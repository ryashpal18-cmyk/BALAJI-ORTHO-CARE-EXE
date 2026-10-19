// Synthetic clinic data only. Executes the real offline helpers and storage engine.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), crypto = require('node:crypto').webcrypto;
const root = path.resolve(__dirname, '..'), mobile = fs.existsSync(path.join(root,'capacitor.config.ts'));
const noop = () => {}, loaded = new Map(), storage = new Map();
const localStorage = {getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k),key:i=>[...storage.keys()][i],get length(){return storage.size}};
const globals = {crypto,structuredClone,console,Blob,URL,atob,btoa,setTimeout,clearTimeout,setInterval,clearInterval,
  navigator:{onLine:false},window:{addEventListener:noop},localStorage,env:{}};
const stubs = {
  '@/lib/clientLogger':{cLog:{info:noop,warn:noop,error:noop}},
  '@/lib/queryClient':{queryClient:{invalidateQueries:async()=>{}}},
  '@/integrations/supabase/client':{supabase:{},usesApiSync:()=>false},
  '@/lib/offlineSync':{isOnline:async()=>false,runSync:async()=>{}},
  '@/lib/localSession':{ensureCloudSession:async()=>false},
  '@capacitor/core':{Capacitor:{isNativePlatform:()=>false}},
  '@capacitor/filesystem':{Filesystem:{},Directory:{},Encoding:{}},
  '@capacitor/share':{Share:{}},
};
let close = noop, diskStore;
if(mobile) {
  const {IDBFactory}=require('fake-indexeddb');globals.indexedDB=new IDBFactory();
  stubs['@/lib/mobileAuth']={accessProfile:async()=>({role:'admin'})};
} else {
  const {DatabaseSync}=require('node:sqlite');
  class Adapter {
    constructor(file){this.db=new DatabaseSync(file);this.depth=0}
    pragma(s){this.db.exec('PRAGMA '+s)}exec(s){this.db.exec(s)}close(){this.db.close()}
    prepare(s){const st=this.db.prepare(s);return {all:(...a)=>st.all(...a),get:(...a)=>st.get(...a),run:(...a)=>st.run(...a)}}
    transaction(fn){return (...a)=>{const n='s'+(++this.depth);this.db.exec('SAVEPOINT '+n);try{const v=fn(...a);this.db.exec('RELEASE '+n);return v}catch(e){this.db.exec('ROLLBACK TO '+n);this.db.exec('RELEASE '+n);throw e}finally{--this.depth}}}
  }
  const mod={exports:{}},dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'balaji-clinic-'));
  vm.runInNewContext(fs.readFileSync(path.join(root,'sqlite-store.cjs'),'utf8'),{module:mod,require:n=>n==='better-sqlite3'?Adapter:n==='./logger.cjs'?{logInfo:noop,logError:noop}:require(n)});
  diskStore=mod.exports;diskStore.init(dir);
  const bridge={};
  for(const name of ['cacheGetAll','cacheGetRow','cacheUpsertRow','cacheMergeServer','queueGetAll','queueRemove','queueUpdate','commitMutation','commitBatch','snapshot','restoreSnapshot'])
    bridge[name]=async(...a)=>{try{return{success:true,data:structuredClone(diskStore[name](...a))}}catch(e){return{success:false,error:e.message}}};
  globals.window.electron={offline:bridge};
  close=()=>{diskStore.close();fs.rmSync(dir,{recursive:true,force:true})};
}
function load(file) {
  file=path.resolve(root,file);if(loaded.has(file))return loaded.get(file);
  const module={exports:{}};loaded.set(file,module.exports);
  const requireLocal=name=>{
    const resolved=name.startsWith('.')?path.resolve(path.dirname(file),name+'.ts'):name.startsWith('@/')?path.resolve(root,'src',name.slice(2)+'.ts'):null;
    const alias=resolved?'@/'+path.relative(path.join(root,'src'),resolved).replace(/\.ts$/,'').replaceAll('\\','/'):name;
    if(stubs[alias])return stubs[alias];
    if(resolved)return load(resolved);return require(name);
  };
  const src=fs.readFileSync(file,'utf8').replace(/import\.meta\.env/g,'env');
  const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{...globals,module,exports:module.exports,require:requireLocal},{filename:file});
  return module.exports;
}
(async()=>{
 const db=load('src/lib/offlineDb.ts'),helpers=load('src/lib/offlineQuery.ts'),ledger=load('src/lib/paymentLedger.ts');
 const patient='11111111-1111-4111-8111-111111111111',branch='22222222-2222-4222-8222-222222222222',billId='33333333-3333-4333-8333-333333333333';
 await db.cacheUpsertRow('patients',{id:patient,name:'Synthetic Patient',mobile:'9123456780',branch_id:branch});
 await db.cacheUpsertRow('billing',{id:billId,patient_id:patient,branch_id:branch,amount:1000,discount:100,amount_paid:100,status:'Partial',created_at:'2026-01-01T06:00:00Z',payment_mode:'Cash'});
 let bill=await helpers.offlineUpdate('billing',billId,{_collectAmount:200,_expectedPaid:100,_receiptId:'new-receipt',_auditReason:'Due collection',payment_mode:'UPI'});
 assert.equal(bill.amount_paid,300);assert.equal(bill.amount,1000);assert.equal(bill.discount,100);
 assert.equal(bill.payment_history[0].amount,100);assert.equal(bill.payment_history[1].amount,200);assert.equal(bill.payment_history[1].payment_mode,'UPI');
 assert.equal(bill.payment_history[1].id,'new-receipt');assert.notEqual(bill.payment_history[1].paid_at,bill.created_at);
 let audit=(await db.cacheGetAll('audit_logs'))[0],description=JSON.parse(audit.description);
 assert.equal(description.before.amount_paid,100);assert.equal(description.after.amount_paid,300);assert.equal(description.reason,'Due collection');
 console.log('PASS incremental due collection preserves gross/discount, dates receipts, and atomically stores before/after audit');
 const before=(await db.queueGetAll()).length;
 for(const amount of [0,-1,601,NaN])await assert.rejects(helpers.offlineUpdate('billing',billId,{_collectAmount:amount,_expectedPaid:300}));
 await assert.rejects(helpers.offlineUpdate('billing',billId,{_collectAmount:10,_expectedPaid:100}));
 assert.equal((await db.queueGetAll()).length,before);assert.equal((await db.cacheGetRow('billing',billId)).amount_paid,300);
 console.log('PASS zero/negative/non-finite/overdue/stale payments leave disk and queue unchanged');
 await assert.rejects(db.commitBatch([
  {mutation:{table:'billing',op:'update',rowId:billId,expectedPaid:100,payload:{amount_paid:400}},row:{amount_paid:400}},
  {mutation:{table:'audit_logs',op:'insert',tempId:'never-created',payload:{}},row:{id:'never-created'}}
 ]));
 assert.equal((await db.cacheGetAll('audit_logs')).length,1);
 console.log('PASS storage transaction rejects concurrent stale balance without orphan audit or receipt');
 bill=await helpers.offlineUpdate('billing',billId,{_collectAmount:600,_expectedPaid:300,payment_mode:'Cash'});
 assert.equal(bill.amount_paid,900);assert.equal(bill.status,'Paid');
 const rows=ledger.collectionRows([bill]);assert.equal(rows.reduce((s,r)=>s+r.amount_paid,0),900);assert.equal(rows.filter(r=>r.created_at==='2026-01-01T06:00:00Z').reduce((s,r)=>s+r.amount_paid,0),100);
 console.log('PASS full due payment and today collection use receipt dates, not original bill date');
 const caseId='44444444-4444-4444-8444-444444444444';
 await db.cacheUpsertRow('fracture_cases',{id:caseId,patient_id:patient,plaster_status:'Active'});
 await helpers.saveFollowUpDates(caseId,'2026-10-21','2026-11-04');
 let appointments=await db.cacheGetAll('appointments');assert.equal(appointments.length,1);assert.equal(appointments[0].date,'2026-11-04');assert.equal(appointments[0].patient_id,patient);
 await helpers.saveFollowUpDates(caseId,'2026-10-22','2026-11-05');appointments=await db.cacheGetAll('appointments');
 assert.equal(appointments.length,1);assert.equal(appointments[0].date,'2026-11-05');
 await helpers.saveFollowUpDates(caseId,'2026-10-22','');assert.equal((await db.cacheGetAll('appointments'))[0].status,'Cancelled');
 assert.equal((await db.cacheGetRow('fracture_cases',caseId)).next_followup_date,'2026-10-22');
 console.log('PASS confirmed cast date uses existing appointment schema, updates one appointment, cancellation preserves history');
 const backup=load('src/lib/backup.ts'),valid=JSON.stringify({formatVersion:2,tables:{patients:[]},localSnapshot:{queue:[]},warnings:['local-cache-only']});
 assert.equal(backup.inspectBackup(valid).warnings.length,1);
 await assert.rejects(backup.restoreBackup(valid));assert.equal((await db.cacheGetAll('patients')).length,1);
 assert.throws(()=>backup.inspectBackup(JSON.stringify({formatVersion:2,tables:{patients:{}},localSnapshot:{queue:[]}})));
 console.log('PASS backup preview validates tables; restore cannot overwrite existing patients or pending work');
 const sms=load('src/lib/smsLogRows.ts');
 const outbox=sms.smsLogRows([],[{id:5,op:'sms',createdAt:'2026-01-01',payload:{messageId:'test',deliveryState:'unconfirmed'}}]);
 assert.equal(outbox[0].unconfirmed,true);assert.equal(outbox[0].queue_id,5);
 assert.equal(sms.smsLogRows([{id:'test',status:'sent'}],[{id:5,op:'sms',payload:{messageId:'test'}}]).length,1);
 console.log('PASS offline SMS review rows expose stable actions and accepted logs are not duplicated');
 const config=load('src/lib/appConfig.ts');config.upsertServiceProduct('X-Ray','300');assert.equal(config.getServiceCatalog()[0].rate,300);
 config.learnServiceItems([{name:'x ray',amount:250}]);assert.equal(config.getServiceCatalog()[0].rate,300);
 assert.match(load('src/lib/billSmsMessage.ts').buildBillSmsMessage({patientName:'TEST',invoice:'TEST',date:'TEST',service:'PU Cast:1000',total:1000,discount:100,paid:900,due:0}),/कुल राशि: ₹1000/);
 console.log('PASS shared preset prices stay stable and Hindi bill SMS includes gross total');
 console.log('8 clinic update checks passed ('+(mobile?'Android IndexedDB':'Windows SQLite')+')');
})().then(close,e=>{console.error(e);close();process.exitCode=1});
