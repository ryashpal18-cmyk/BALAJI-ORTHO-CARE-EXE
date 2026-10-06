// Run with Node 22.13+ (node:sqlite) after npm install. No network or real clinic data.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),noop=()=>{},log={info:noop,warn:noop,error:noop};
let failQueue=false;
class SQLiteAdapter {
 constructor(){this.db=new DatabaseSync(':memory:');this.depth=0;}
 pragma(sql){this.db.exec('PRAGMA '+sql)} exec(sql){this.db.exec(sql)} close(){this.db.close()}
 prepare(sql){const st=this.db.prepare(sql);return {all:(...a)=>st.all(...a),get:(...a)=>st.get(...a),run:(...a)=>{if(failQueue&&/INSERT INTO mutation_queue/.test(sql))throw Error('simulated disk failure');return st.run(...a)}}}
 transaction(fn){return (...args)=>{const n=++this.depth,key='t'+n;this.db.exec('SAVEPOINT '+key);try{const value=fn(...args);this.db.exec('RELEASE '+key);return value}catch(e){this.db.exec('ROLLBACK TO '+key);this.db.exec('RELEASE '+key);throw e}finally{--this.depth}}}
}
const moduleStore={exports:{}};
vm.runInNewContext(fs.readFileSync(root+'/sqlite-store.cjs','utf8'),{module:moduleStore,require:n=>n==='better-sqlite3'?SQLiteAdapter:n==='./logger.cjs'?{logInfo:noop,logError:noop}:require(n),console});
const store=moduleStore.exports;store.init(require('os').tmpdir());
const storage=new Map([["bocc_selected_branch","00000000-0000-4000-8000-000000000010"]]);const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const bridge={};
for(const name of ['cacheMergeServer','cacheGetAll','cacheGetRow','cacheSetRows','cacheReplaceTable','cacheUpsertRow','cacheDeleteRow','cacheReplaceRowKey','queueGetAll','queueRemove','queueUpdate','metaSet','commitMutation','snapshot','restoreSnapshot','adjustStock'])
 bridge[name]=async(...args)=>{try{return {success:true,data:structuredClone(store[name](...args))}}catch(e){return {success:false,error:e.message}}};
bridge.queueAdd=async m=>{try{return {success:true,id:store.queueAdd(m)}}catch(e){return {success:false,id:-1,error:e.message}}};
bridge.metaGet=async key=>({success:true,value:store.metaGet(key)});
const windowMock={electron:{offline:bridge},addEventListener:noop};
function load(file,names,deps={}){
 let source=fs.readFileSync(root+'/'+file,'utf8').replace(/^import[\s\S]*?from\s+["'][^"']+["'];?/gm,'').replaceAll('import.meta.env','({})');
 source=ts.transpile(source.replace(/\bexport\s+/g,''),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS});
 const ctx={exports:{},console,window:windowMock,localStorage,navigator:{onLine:false},cLog:log,crypto:require('crypto').webcrypto,Blob,atob,setTimeout,setInterval,clearTimeout,clearInterval,...deps};
 vm.createContext(ctx);vm.runInContext(source+'\n;globalThis.api={'+names.join(',')+'};',ctx);return ctx.api;
}
const db=load('src/lib/offlineDb.ts',['cacheUpsertRowFromServer','cacheGetAll','cacheGetRow','cacheUpsertRow','cacheReplaceTable','cacheSetRows','cacheDeleteRow','cacheReplaceRowKey','queueAdd','queueGetAll','queueUpdate','queueRemove','queueRemapRowId','commitMutation','tempId','getLocalSnapshot','atomicStockAdjustment','MAX_SYNC_RETRIES']);
const payment=load('src/lib/paymentLedger.ts',['paymentHistory','withPaymentHistory','collectionRows']);
const offline=load('src/lib/offlineQuery.ts',['offlineInsert','offlineUpdate','offlineDelete'],{...db,...payment,isOnline:async()=>false,runSync:noop});
const passes=[];async function test(name,fn){await fn();passes.push(name);console.log('PASS',name)}
const uid=()=>require('crypto').randomUUID();
(async()=>{
 await test('5: Save waits for durable atomic commit',async()=>{
  const original=bridge.commitMutation;let release;const gate=new Promise(r=>release=r);let returned=false;
  bridge.commitMutation=async(...args)=>{await gate;return original(...args)};
  const saving=offline.offlineInsert('patients',{name:'Wait'}).then(()=>{returned=true});
  await new Promise(r=>setImmediate(r));assert.equal(returned,false);release();await saving;bridge.commitMutation=original;
 });
 await test('5: Queue failure rolls back cache and reaches caller',async()=>{
  const count=store.cacheGetAll('patients').length;failQueue=true;
  await assert.rejects(()=>offline.offlineInsert('patients',{name:'DO NOT SAVE'}),/failure/);failQueue=false;
  assert.equal(store.cacheGetAll('patients').length,count);
 });
 await test('5: False cache/queue IPC results are rejected',async()=>{
  const original=bridge.cacheUpsertRow;bridge.cacheUpsertRow=async()=>({success:false});
  await assert.rejects(()=>db.cacheUpsertRow('patients',{id:uid()}));bridge.cacheUpsertRow=original;
  failQueue=true;await assert.rejects(()=>db.queueAdd({table:'patients',op:'insert'}));failQueue=false;
 });
 await test('7: Concurrent updates retain independent fields',async()=>{
  const row=await offline.offlineInsert('billing',{amount:100,amount_paid:0,payment_mode:'Cash'});
  await Promise.all([offline.offlineUpdate('billing',row.id,{amount_paid:50}),offline.offlineUpdate('billing',row.id,{amount:150})]);
  const saved=store.cacheGetRow('billing',row.id);assert.equal(saved.amount_paid,50);assert.equal(saved.amount,150);
 });
 await test('10/19: New installment belongs to its IST receipt date',async()=>{
  const dates=load('src/lib/businessDate.ts',['businessDate']);
  const old={id:uid(),amount_paid:200,created_at:'2026-10-01T04:30:00Z',payment_mode:'Cash'};
  const updated={...old,...payment.withPaymentHistory(old,{amount_paid:1000,payment_mode:'UPI'},uid(),'2026-10-04T20:30:00Z')};
  const rows=payment.collectionRows([updated]);assert.equal(rows.length,2);assert.equal(rows[0].amount_paid,200);assert.equal(rows[1].amount_paid,800);assert.equal(dates.businessDate(rows[1].created_at),'2026-10-05');assert.equal(rows[0].payment_mode,'Cash');assert.equal(rows[1].payment_mode,'UPI');
 });
 await test('13: Authoritative empty clears synced rows, preserves pending',async()=>{
  await db.cacheUpsertRow('test_empty',{id:'old'});await db.cacheUpsertRow('test_empty',{id:'pending',_pendingSync:true});
  await db.cacheReplaceTable('test_empty',[]);assert.deepEqual((await db.cacheGetAll('test_empty')).map(r=>r.id),['pending']);
 });
 await test('17: Overdraw rejected; stock and movement commit/rollback together',async()=>{
  const id=uid();store.cacheUpsertRow('medicines',{id,name:'Test',stock_quantity:5},'id');
  await assert.rejects(()=>db.atomicStockAdjustment({medicineId:id,changeQty:-10}),/Insufficient/);
  assert.equal(store.cacheGetRow('medicines',id).stock_quantity,5);
  failQueue=true;await assert.rejects(()=>db.atomicStockAdjustment({medicineId:id,changeQty:-2}));failQueue=false;
  assert.equal(store.cacheGetRow('medicines',id).stock_quantity,5);
  await db.atomicStockAdjustment({medicineId:id,changeQty:-2});assert.equal(store.cacheGetRow('medicines',id).stock_quantity,3);
  assert.equal(store.cacheGetAll('stock_movements').filter(m=>m.medicine_id===id).length,1);
 });
 await test('6: Detached queue insert/delete leaves no cloud row',async()=>{
  for(const m of store.queueGetAll())store.queueRemove(m.id);
  const row=await offline.offlineInsert('patients',{name:'Delete me'});await offline.offlineDelete('patients',row.id);
  const remote=new Map();const supabase={rpc:async(name,args)=>{remote.delete(args.p_id);return {data:true,error:null}},auth:{getSession:async()=>({data:{session:null}})},from:()=>({upsert:p=>({select:()=>({single:async()=>{remote.set(p.id,p);return {data:p,error:null}}})}),delete:()=>({eq:async(k,id)=>{remote.delete(id);return {error:null}}})})};
  const sync=load('src/lib/offlineSync.ts',['runSync'],{...db,supabase,queryClient:{invalidateQueries:noop},navigator:{onLine:true}});
  await sync.runSync();assert.equal(remote.size,0);assert.equal(store.queueGetAll().length,0);assert.equal(store.cacheGetAll('patients').some(p=>p.id===row.id||p.id===row.id.slice(6)),false);
 });
 await test('9: X-ray uses resolved IDs and stable retry path',async()=>{
  const patientId='local_'+uid(),caseId='local_'+uid();const mutation={table:'fracture_xrays',op:'xray_upload',payload:{patientId,caseId,fileName:'test.jpg',fileBase64:'YQ==',uploadId:uid()}};
  const id=await db.queueAdd(mutation);let calls=0;const paths=[],rows=[];
  const supabase={storage:{from:()=>({upload:async path=>{paths.push(path);return {}},createSignedUrl:async()=>({data:{signedUrl:'mock'}})})},from:()=>({upsert:async row=>{rows.push(row);return {error:++calls===1?new Error('retry'):null}}})};
  const sync=load('src/lib/offlineSync.ts',['applyMutation'],{...db,supabase});
  await assert.rejects(()=>sync.applyMutation({...mutation,id}));await sync.applyMutation({...mutation,id});
  assert.equal(paths[0],paths[1]);assert.equal(rows[1].patient_id,patientId.slice(6));assert.equal(rows[1].fracture_case_id,caseId.slice(6));assert.equal(rows[0].id,rows[1].id);store.queueRemove(id);
 });
 await test('8: Failed legacy import preserves original database',async()=>{
  let deleted=false;const req={};
  const migration=load('src/lib/offlineDb.ts',['migrateLegacyIndexedDbIfNeeded'],{window:{indexedDB:{},electron:{offline:{isLegacyMigrated:async()=>({success:true,migrated:false}),importLegacyDump:async()=>({success:false})}}},indexedDB:{open:()=>{queueMicrotask(()=>{req.onupgradeneeded();req.onerror()});return req},deleteDatabase:()=>{deleted=true}}});
  await assert.rejects(()=>migration.migrateLegacyIndexedDbIfNeeded());assert.equal(deleted,false);
 });
 await test('12: Pagination handles low server cap without truncation',async()=>{
  const rows=Array.from({length:1305},(_,i)=>({id:i}));let calls=0;
  const supabase={from:()=>({select:()=>({order:()=>({range:async(from,to)=>{calls++;return {data:rows.slice(from,Math.min(to+1,from+40)),error:null}}})})})};
  const fetcher=load('src/lib/completeFetch.ts',['fetchCompleteTable'],{supabase});const got=await fetcher.fetchCompleteTable('patients');assert.equal(got.length,1305);assert.ok(calls>30);
 });
 await test('11: Backup snapshot + empty DB restore preserve queue and all tables',async()=>{
  const queued=store.queueAdd({table:"prescriptions",op:"insert",payload:{id:"local_restore",medicines:"TEST"},tempId:"local_restore"});store.queueUpdate(queued,{retries:3,lastError:"test retry"});
  const snapshot=store.snapshot();const counts=Object.fromEntries(Object.entries(snapshot.cache).map(([t,rows])=>[t,rows.length]));
  store.close();store.init(require('os').tmpdir());store.restoreSnapshot(snapshot);
  assert.deepEqual(Object.fromEntries(Object.entries(store.snapshot().cache).map(([t,rows])=>[t,rows.length])),counts);
  assert.equal(store.queueGetAll().length,snapshot.queue.length);
  assert.throws(()=>store.restoreSnapshot(snapshot),/empty/);
 });
 await test('11: Backup overlays pending writes and deletes',async()=>{
  const backup=load('src/lib/backup.ts',['mergeBackupTable'],{OPERATIONAL_TABLES:[]});
  const got=backup.mergeBackupTable('patients',[{id:'gone'},{id:'edit',name:'old'}],{cache:{patients:[{id:'edit',name:'new',_pendingSync:true},{id:'stale'}]},queue:[{table:'patients',op:'delete',rowId:'gone'}]},true);
  assert.equal(got.length,1);assert.equal(got[0].name,'new');
 });
 await test('14: Poll emits restored network state',async()=>{
  let poll,emitted=0;const sync=load('src/lib/offlineSync.ts',['startAutoSync','onNetworkChange'],{...db,supabase:{auth:{getSession:async()=>({data:{session:null}})}},window:{addEventListener:noop,electron:{isOnline:async()=>({online:true})}},setTimeout:noop,setInterval:(fn,ms)=>{if(ms===30000)poll=fn},backupCacheToDisk:noop});
  sync.onNetworkChange(()=>emitted++);sync.startAutoSync();await poll();assert.equal(emitted,1);
 });
 await test('15: Ten-digit 91-prefix mobile gets full country code',async()=>{
  const mobile=load('src/lib/mobile.ts',['normalizeIndianMobile']);assert.equal(mobile.normalizeIndianMobile('9123456780'),'919123456780');assert.equal(mobile.normalizeIndianMobile('+91 9123456780'),'919123456780');assert.throws(()=>mobile.normalizeIndianMobile('123'));
 });
 await test('2: Anonymous/non-admin creation denied; role failure rolls back new user',async()=>{
  async function scenario(token,isAdmin,roleFails=false){
    let handler,created=0,deleted=0;
    const client={auth:{getUser:async()=>({data:{user:{id:'caller'}}}),admin:{createUser:async()=>{created++;return {data:{user:{id:'created'}}}},deleteUser:async()=>{deleted++;return {}}}},from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:isAdmin?{role:'admin'}:null})})})}),insert:async()=>({error:roleFails?new Error('role write failed'):null})})};
    load('supabase/functions/create-admin-user/index.ts',[],{createClient:()=>client,Deno:{env:{get:()=>''},serve:fn=>{handler=fn}},Response,Request});
    const res=await handler(new Request('https://test.invalid',{method:'POST',headers:token?{Authorization:'Bearer test'}:{},body:JSON.stringify({email:'test@example.test',password:'test-only-password'})}));
    return {status:res.status,created,deleted};
  }
  assert.deepEqual(await scenario(false,false),{status:401,created:0,deleted:0});
  assert.deepEqual(await scenario(true,false),{status:403,created:0,deleted:0});
  assert.deepEqual(await scenario(true,true,true),{status:400,created:1,deleted:1});
 });
 await test('4: IPC permissions deny missing role and forbidden tables',async()=>{
  const ac=require(root+'/access-control.cjs');assert.equal(ac.canTable('patients'),false);assert.throws(()=>ac.authorize('offline:cacheGetAll',['patients'],store));
  ac.setPrincipal({role:'staff',pages:['/opd'],expiresAt:Date.now()+10000});assert.equal(ac.canTable('patients'),true);assert.equal(ac.canTable('billing'),false);assert.throws(()=>ac.authorize('app:nuclearIndexedDBReset',[],store));
  assert.throws(()=>ac.authorize('offline:commitMutation',[{mutation:{table:'billing'}}],store));
 });
 await test('20: Branch filter isolates records and All includes both',async()=>{
  const branch=load('src/lib/branchData.ts',['inBranch']);const rows=[{branch_id:'a'},{branch_id:'b'},{branch_id:null}];assert.equal(rows.filter(r=>branch.inBranch(r,'a')).length,1);assert.equal(rows.filter(r=>branch.inBranch(r,null)).length,3);
 });
 console.log(JSON.stringify({passed:passes.length,failed:0,tests:passes},null,2));store.close();
})().catch(error=>{console.error(error);process.exitCode=1;try{store.close()}catch{}});
