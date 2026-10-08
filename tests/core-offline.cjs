// Run with Node 22.13+ (node:sqlite) after npm install. No network or real clinic data.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),noop=()=>{},log={info:noop,warn:noop,error:noop};
let failQueue=false, failQueueAt=0, queueWrites=0;
class SQLiteAdapter {
 constructor(file){this.db=new DatabaseSync(file);this.depth=0;}
 pragma(sql){this.db.exec('PRAGMA '+sql)} exec(sql){this.db.exec(sql)} close(){this.db.close()}
 prepare(sql){const st=this.db.prepare(sql);return {all:(...a)=>st.all(...a),get:(...a)=>st.get(...a),run:(...a)=>{if(/INSERT INTO mutation_queue/.test(sql) && (failQueue || (++queueWrites === failQueueAt)))throw Error('simulated disk failure');return st.run(...a)}}}
 transaction(fn){return (...args)=>{const n=++this.depth,key='t'+n;this.db.exec('SAVEPOINT '+key);try{const value=fn(...args);this.db.exec('RELEASE '+key);return value}catch(e){this.db.exec('ROLLBACK TO '+key);this.db.exec('RELEASE '+key);throw e}finally{--this.depth}}}
}
const moduleStore={exports:{}};
vm.runInNewContext(fs.readFileSync(root+'/sqlite-store.cjs','utf8'),{module:moduleStore,require:n=>n==='better-sqlite3'?SQLiteAdapter:n==='./logger.cjs'?{logInfo:noop,logError:noop}:require(n),console});
const testDir=fs.mkdtempSync(path.join(require('os').tmpdir(),'balaji-offline-test-'));
const store=moduleStore.exports;store.init(testDir);
const storage=new Map([["bocc_selected_branch","00000000-0000-4000-8000-000000000010"]]);const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const bridge={};
for(const name of ['cacheMergeServer','cacheGetAll','cacheGetRow','cacheSetRows','cacheReplaceTable','cacheUpsertRow','cacheDeleteRow','cacheReplaceRowKey','queueGetAll','queueRemove','queueUpdate','metaSet','commitMutation','commitBatch','snapshot','restoreSnapshot','adjustStock'])
 bridge[name]=async(...args)=>{try{return {success:true,data:structuredClone(store[name](...args))}}catch(e){return {success:false,error:e.message}}};
bridge.queueAdd=async m=>{try{return {success:true,id:store.queueAdd(m)}}catch(e){return {success:false,id:-1,error:e.message}}};
bridge.metaGet=async key=>({success:true,value:store.metaGet(key)});
const windowMock={electron:{offline:bridge},addEventListener:noop};
function load(file,names,deps={}){
 let source=fs.readFileSync(root+'/'+file,'utf8').replace(/^import[\s\S]*?from\s+["'][^"']+["'];?/gm,'').replaceAll('import.meta.env','({})');
 source=ts.transpile(source.replace(/\bexport\s+/g,''),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS});
 const ctx={normalizeBill:require("./audit-fixtures.cjs").normalizeBill,ensureCloudSession:async()=>true,exports:{},console,window:windowMock,localStorage,navigator:{onLine:false},cLog:log,crypto:require('crypto').webcrypto,Blob,atob,setTimeout,setInterval,clearTimeout,clearInterval,...deps};
 if (ctx.supabase) ctx.supabase = require("./audit-fixtures.cjs").queryMock(ctx.supabase);
 vm.createContext(ctx);vm.runInContext(source+'\n;globalThis.api={'+names.join(',')+'};',ctx);return ctx.api;
}
const db=load('src/lib/offlineDb.ts',['cacheUpsertRowFromServer','cacheGetAll','cacheGetRow','cacheUpsertRow','cacheReplaceTable','cacheSetRows','cacheDeleteRow','cacheReplaceRowKey','queueAdd','queueGetAll','queueUpdate','queueRemove','queueRemapRowId','commitMutation','commitBatch','tempId','getLocalSnapshot','atomicStockAdjustment','MAX_SYNC_RETRIES']);
const payment=load('src/lib/paymentLedger.ts',['paymentHistory','withPaymentHistory','collectionRows']);
const offline=load('src/lib/offlineQuery.ts',['offlineInsert','offlineUpdate','offlineDelete'],{...db,...payment,isOnline:async()=>false,runSync:noop});

const {normalizeBill}=require('./audit-fixtures.cjs');
const invoice=load('src/lib/invoiceNumber.ts',['invoiceNumber']);
const save=load('src/lib/saveBillOffline.ts',['saveBillOffline'],{...db,...payment,...invoice,normalizeBill,normalizeIndianMobile:x=>'91'+x,isValidMobile:x=>/^\d{10}$/.test(x),runSync:async()=>{}}).saveBillOffline;
function expression(file,name) { const text=fs.readFileSync(root+'/'+file,'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let out;function walk(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)out=n.initializer;ts.forEachChild(n,walk)}walk(ast);return {node:out,ast}; }
function evaluate(code,ctx){return vm.runInNewContext(ts.transpile('const result = '+code+';',{target:ts.ScriptTarget.ES2022})+'result',ctx)}
(async()=>{
 const patient={id:'local_00000000-0000-4000-8000-000000000111',name:'Test Patient',mobile:'9123456780',branch_id:'branch-test'};store.cacheUpsertRow('patients',patient,'id');
 const input={patient_id:patient.id,amount:1000,discount:200,amount_paid:300,service:'Consultation:1000'};
 failQueueAt=2;await assert.rejects(()=>save(input),/disk/);assert.equal(store.cacheGetAll('billing').length,0);assert.equal(store.cacheGetAll('sms_logs').length,0);assert.equal(store.queueGetAll().length,0);
 failQueueAt=0;const saved=await save(input);assert.equal(saved.smsQueued,true);assert.equal(store.queueGetAll().length,2);assert.match(store.queueGetAll().find(q=>q.op==='sms').payload.message,/बकाया: ₹500/);assert.equal(saved.payment_history[0].amount,300);
 store.close();store.init(testDir);assert.equal(store.cacheGetAll('billing').length,1);assert.equal(store.queueGetAll().length,2);console.log('PASS atomic bill/SMS rollback on second write failure, correct due/message and payment history survive restart');
 // Bill pending cloud upload must not block its SMS lane.
 let sent=0;windowMock.electron.sendSMS=async()=>{sent++;return {ok:true}};
 const sync=load('src/lib/offlineSync.ts',['runSync'],{...db,ensureCloudSession:async()=>false,isValidMobile:()=>true,navigator:{onLine:true}});await sync.runSync();assert.equal(sent,1);assert.equal(store.queueGetAll().filter(q=>q.table==='billing').length,1);console.log('PASS pending cloud bill does not block atomic SMS outbox');
 const file='src/pages/DueAmount.tsx';let e=expression(file,'dueBills');const due=evaluate(e.node.arguments[0].getText(e.ast),{bills:[{...input,id:'bill',created_at:'2026-10-08'}]})();assert.equal(due[0]._due,500);assert.equal(due[0]._total,800);
 let patch; e=expression(file,'handleMarkFullyPaid');await evaluate(e.node.getText(e.ast),{updateBill:{mutateAsync:async x=>patch=x},toast:()=>{}})(due[0]);assert.equal(patch.amount,1000);assert.equal(patch.amount_paid,800);assert.equal(normalizeBill(patch,{...input,id:'bill'}).status,'Paid');
 const notices=[];e=expression(file,'handleSendSMS');await evaluate(e.node.getText(e.ast),{setSendingId:()=>{},sendSMS:async()=>({ok:false,queued:false,error:'disk full'}),getDueMessage:()=>'',toast:x=>notices.push(x)})({...due[0],patients:patient});assert.equal(notices[0].title,'SMS bhejne me dikkat hui');console.log('PASS discounted due and full-payment amount; no false SMS success');
 e=expression('src/pages/Ortho.tsx','handleSave');let caseRow;const notices2=[];await evaluate(e.node.getText(e.ast),{name:'Test Patient',mobile:'+919123456780',bodySelection:{body_part:'Arm'},fractureType:'Test',selPt:null,savingCase:{current:false},cacheGetAll:async()=>[patient],addPatient:{mutateAsync:async()=>{throw Error('Duplicate patient')}},addCase:{mutateAsync:async r=>caseRow=r},age:'',cause:'',plasterType:'POP',plasterDate:'2026-10-08',followupDays:'7',nextFU:'2026-10-15',notes:'',toast:{success:x=>notices2.push(x),error:x=>{throw Error(x)}},sendSMS:async()=>({ok:true,queued:true}),tplReminder:()=>'',resetForm:()=>{},refetchCases:()=>{},refetchFollowups:()=>{}})();assert.equal(caseRow.patient_id,patient.id);console.log('PASS Ortho save reuses local patient without any network dependency');
 store.close();fs.rmSync(testDir,{recursive:true,force:true});
})().catch(e=>{console.error(e);try{store.close()}catch{};fs.rmSync(testDir,{recursive:true,force:true});process.exitCode=1});
