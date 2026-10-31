// Run with Node 22.13+ (node:sqlite) after npm install. No network or real clinic data.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),noop=()=>{},log={info:noop,warn:noop,error:noop};
let failQueue=false;
class SQLiteAdapter {
 constructor(file){this.db=new DatabaseSync(file);this.depth=0;}
 pragma(sql){this.db.exec('PRAGMA '+sql)} exec(sql){this.db.exec(sql)} close(){this.db.close()}
 prepare(sql){const st=this.db.prepare(sql);return {all:(...a)=>st.all(...a),get:(...a)=>st.get(...a),run:(...a)=>{if(failQueue&&/INSERT INTO mutation_queue/.test(sql))throw Error('simulated disk failure');return st.run(...a)}}}
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
 const ctx={...require("./audit-fixtures.cjs").smsReview(deps),normalizeBill:require("./audit-fixtures.cjs").normalizeBill,ensureCloudSession:async()=>true,exports:{},console,window:windowMock,localStorage,navigator:{onLine:false},cLog:log,crypto:require('crypto').webcrypto,Blob,atob,setTimeout,setInterval,clearTimeout,clearInterval,...deps};
 if (ctx.supabase) ctx.supabase = require("./audit-fixtures.cjs").queryMock(ctx.supabase);
 vm.createContext(ctx);vm.runInContext(source+'\n;globalThis.api={'+names.join(',')+'};',ctx);return ctx.api;
}
const db=load('src/lib/offlineDb.ts',['cacheUpsertRowFromServer','cacheGetAll','cacheGetRow','cacheUpsertRow','cacheReplaceTable','cacheSetRows','cacheDeleteRow','cacheReplaceRowKey','queueAdd','queueGetAll','queueUpdate','queueRemove','queueRemapRowId','commitMutation','commitBatch','metaSet','tempId','getLocalSnapshot','atomicStockAdjustment','MAX_SYNC_RETRIES','queueCount','queueStuckCount','queueSmsReviewCount']);
const payment=load('src/lib/paymentLedger.ts',['paymentHistory','withPaymentHistory','collectionRows']);
const offline=load('src/lib/offlineQuery.ts',['offlineInsert','offlineUpdate','offlineDelete'],{...db,...payment,isOnline:async()=>false,runSync:noop});

const {createSmsSender}=require('../sms-outbox.cjs');
const config={apiUrl:'https://gateway.example.test/send',apiKey:'test-only',deviceId:'test-device'};
(async()=>{
 let calls=0;
 const sender=createSmsSender({store,fetchImpl:async()=>{calls++;return {ok:true}}});
 windowMock.electron.sendSMS=input=>sender({...input,...config});
 const service=load('src/services/smsService.ts',['sendSMS'],{...db,isValidMobile:()=>true,normalizeIndianMobile:x=>'91'+x,runSync:async()=>{}});
 const saved=await service.sendSMS('9123456780','Fake SMS','Test Patient');assert.equal(saved.queued,true);assert.equal(calls,0);
 store.close();store.init(testDir);assert.equal(store.queueGetAll().length,1);
 const sync=load('src/lib/offlineSync.ts',['runSync'],{...db,ensureCloudSession:async()=>false,isValidMobile:()=>true,navigator:{onLine:true}});
 await sync.runSync();assert.equal(calls,1);assert.equal(store.queueGetAll().filter(q=>q.op==='sms').length,0);assert.equal(store.cacheGetAll('sms_logs')[0].status,'sent');assert.equal(store.queueGetAll().filter(q=>q.op==='insert').length,1);
 console.log('PASS SMS queues without network/logging; survives restart; dispatches without cloud login; local log remains queued');
 const accepted=store.cacheGetAll('sms_logs')[0];store.close();store.init(testDir);
 assert.equal((await sender({...config,requestId:accepted.id,mobile:'919123456780',message:'Fake SMS'})).ok,true);assert.equal(calls,1);
 console.log('PASS accepted journal survives restart and prevents repeat gateway call');
 let failRemove=true;
 await service.sendSMS('9123456780','Cleanup test');
 const cleanup=load('src/lib/offlineSync.ts',['runSync'],{...db,ensureCloudSession:async()=>false,isValidMobile:()=>true,navigator:{onLine:true},queueRemove:async id=>{if(failRemove)throw Error('disk cleanup failed');return db.queueRemove(id)}});
 await cleanup.runSync();assert.equal(calls,2);failRemove=false;for(const q of store.queueGetAll())store.queueUpdate(q.id,{lastAttemptAt:0});await cleanup.runSync();assert.equal(calls,2);
 console.log('PASS queue cleanup failure retries without duplicate SMS');
 let timedCalls=0;
 const timeoutSender=createSmsSender({store,timeoutMs:10,fetchImpl:()=>{timedCalls++;return new Promise(()=>{})}});
 const ambiguous={...config,requestId:'ambiguous',mobile:'919123456780',message:'Timeout test'};
 assert.equal((await timeoutSender(ambiguous)).uncertain,true);assert.equal((await timeoutSender(ambiguous)).uncertain,true);assert.equal(timedCalls,1);
 console.log('PASS timeout releases sender; ambiguous request is not resent');
 let writes=0,ackCalls=0;
 const badAck=createSmsSender({store:{metaGet:k=>store.metaGet(k),metaSet:(k,v)=>{if(v.state==='accepted')throw Error('disk ack failed');store.metaSet(k,v)}},fetchImpl:async()=>{ackCalls++;return {ok:true}}});
 const ack={...config,requestId:'bad-ack',mobile:'919123456780',message:'Ack test'};
 assert.equal((await badAck(ack)).uncertain,true);assert.equal((await badAck(ack)).uncertain,true);assert.equal(ackCalls,1);
 const badDisk=createSmsSender({store:{metaGet:()=>null,metaSet:()=>{throw Error('disk full')}},fetchImpl:async()=>{writes++;return {ok:true}}});await badDisk({...ack,requestId:'bad-disk'});assert.equal(writes,0);
 console.log('PASS disk failure before send prevents dispatch; failure after acceptance prevents resend');
 let rejectedCalls=0;
 const rejection=createSmsSender({store,fetchImpl:async()=>({ok:++rejectedCalls>1,status:429})});
 const reject={...ack,requestId:'rejected'};assert.equal((await rejection(reject)).ok,false);assert.equal((await rejection(reject)).ok,true);assert.equal(rejectedCalls,2);
 console.log('PASS explicit gateway rejection can retry');
 const rows=load('src/lib/smsLogRows.ts',['smsLogRows']).smsLogRows([{id:'done',status:'sent'}],[{id:1,op:'sms',payload:{messageId:'done'}},{id:2,op:'sms',payload:{messageId:'pending'}},{id:3,op:'sms',payload:{deliveryState:'unconfirmed'}}]);
 assert.equal(rows.length,3);assert.equal(rows.find(r=>r.id==='done').status,'sent');assert.match(rows.find(r=>r.id==='pending').status,/Pending/);assert.match(rows.find(r=>r.id==='queue-3').status,/unconfirmed/);
 console.log('PASS offline history shows pending, accepted and unconfirmed without duplicates');
 // A stalled SMS must not delay a database mutation in the other lane.
 for(const q of store.queueGetAll())store.queueRemove(q.id);
 store.queueAdd({table:'sms_logs',op:'sms',payload:{mobile:'919123456780',message:'slow'}});
 store.queueAdd({table:'patients',op:'delete',rowId:'test-delete'});
 let release,deleted=false;windowMock.electron.sendSMS=()=>new Promise(r=>release=r);
 const parallel=load('src/lib/offlineSync.ts',['runSync'],{...db,ensureCloudSession:async()=>true,isValidMobile:()=>true,navigator:{onLine:true},supabase:{rpc:async()=>{deleted=true;return {data:true}},auth:{getSession:async()=>({data:{session:null}})}}});
 const running=parallel.runSync();await new Promise(r=>setTimeout(r,20));assert.equal(deleted,true);release({ok:false,error:'fake rejection'});await running;
 console.log('PASS data lane runs while SMS gateway is stalled; legacy request gets durable ID');
 // ── Endless "SMS delivery unconfirmed" error loop fix ──
 // 1) Failures that provably happened before the request left this PC are retryable (no duplicate risk).
 const netErr=code=>Object.assign(new TypeError('fetch failed'),{cause:Object.assign(new Error(code),{code})});
 let netCalls=0;
 const flaky=createSmsSender({store,fetchImpl:async()=>{netCalls++;if(netCalls===1)throw netErr('ENOTFOUND');
  if(netCalls===2)throw Object.assign(new TypeError('fetch failed'),{cause:new AggregateError([Object.assign(new Error('a'),{code:'ECONNREFUSED'}),Object.assign(new Error('b'),{code:'ENETUNREACH'})])});
  return {ok:true}}});
 const down={...config,requestId:'net-down',mobile:'919123456780',message:'Net test'};
 const d1=await flaky(down),d2=await flaky(down);
 assert.equal(d1.ok,false);assert.ok(!d1.uncertain);assert.equal(d2.ok,false);assert.ok(!d2.uncertain);
 assert.equal((await flaky(down)).ok,true);assert.equal(netCalls,3);
 let resetCalls=0;
 const resetSender=createSmsSender({store,fetchImpl:async()=>{resetCalls++;throw netErr('ECONNRESET')}});
 const midReq={...config,requestId:'reset-mid',mobile:'919123456780',message:'Reset test'};
 assert.equal((await resetSender(midReq)).uncertain,true);assert.equal((await resetSender(midReq)).uncertain,true);assert.equal(resetCalls,1);
 console.log('PASS DNS/refused/unreachable failures retry safely; mid-request reset stays unconfirmed and is never resent');
 // 2) A genuinely unconfirmed SMS is parked: gateway called once, no ERROR log, no lastError, no retry counter,
 //    and it never keeps the cloud-sync pending / stuck counters alive.
 for(const q of store.queueGetAll())store.queueRemove(q.id);
 const errorLog=[],statuses=[];let gwCalls=0;
 windowMock.electron.sendSMS=async()=>{gwCalls++;return {ok:false,uncertain:true,error:'SMS delivery unconfirmed; check gateway before resending'}};
 const qid=store.queueAdd({table:'sms_logs',op:'sms',payload:{mobile:'919123456780',message:'Parked',patientName:'P',smsType:'general'}});
 const parkedSync=load('src/lib/offlineSync.ts',['runSync','onSyncStatus'],{...db,ensureCloudSession:async()=>true,isValidMobile:()=>true,navigator:{onLine:true},cLog:{info:noop,warn:noop,error:(...a)=>errorLog.push(a)}});
 parkedSync.onSyncStatus(s=>statuses.push(s));
 const first=await parkedSync.runSync();
 const parkedItem=store.queueGetAll().find(q=>q.id===qid);
 assert.equal(gwCalls,1);assert.equal(errorLog.length,0);assert.equal(parkedItem.payload.deliveryState,'unconfirmed');assert.equal(parkedItem.retries,0);
 assert.equal(first.pending,0);assert.ok(statuses.length>0&&statuses.every(s=>!s.lastError));
 for(const q of store.queueGetAll())store.queueUpdate(q.id,{lastAttemptAt:0});
 const second=await parkedSync.runSync();assert.equal(gwCalls,1);assert.equal(errorLog.length,0);assert.equal(second.pending,0);
 store.queueUpdate(qid,{retries:20});
 assert.equal(await db.queueCount(),0);assert.equal(await db.queueStuckCount(),0);assert.equal(await db.queueSmsReviewCount(),1);
 console.log('PASS unconfirmed SMS is parked once: no repeat gateway call, no ERROR log, no sync error, not counted as pending/stuck');
 // 3) Staff "Dobara bhejein" (SMS Logs): fresh request ID, retry counters reset, then it dispatches normally.
 const cur=store.queueGetAll().find(q=>q.id===qid);const {deliveryState:_parked,...resendPayload}=cur.payload;
 store.queueUpdate(qid,{payload:{...resendPayload,messageId:'fresh-id'},retries:0,lastError:'',lastAttemptAt:0});
 windowMock.electron.sendSMS=async input=>{gwCalls++;assert.equal(input.requestId,'fresh-id');return {ok:true,acceptedAt:new Date().toISOString()}};
 await parkedSync.runSync();
 assert.equal(gwCalls,2);assert.equal(store.queueGetAll().filter(q=>q.op==='sms').length,0);assert.equal(await db.queueSmsReviewCount(),0);
 console.log('PASS manual resend uses a fresh request ID and dispatches once');
 const reviewRows=load('src/lib/smsLogRows.ts',['smsLogRows']).smsLogRows([],[{id:7,op:'sms',payload:{messageId:'u',deliveryState:'unconfirmed'}},{id:8,op:'sms',payload:{messageId:'p'}}]);
 assert.equal(reviewRows.find(r=>r.id==='u').queue_id,7);assert.equal(reviewRows.find(r=>r.id==='u').unconfirmed,true);assert.equal(reviewRows.find(r=>r.id==='p').unconfirmed,false);
 console.log('PASS SMS Logs rows expose queue id and unconfirmed flag for the action buttons');
 for(const q of store.queueGetAll())store.queueRemove(q.id);

 for(const q of store.queueGetAll())store.queueRemove(q.id);
 store.cacheUpsertRow('patients',{id:'safe-patient',mobile:'919876543210'},'id');store.cacheUpsertRow('billing',{id:'safe-bill',patient_id:'safe-patient',amount:100,amount_paid:0,status:'Cancelled'},'id');
 let obsoleteCalls=0;windowMock.electron.sendSMS=async()=>{obsoleteCalls++;return{ok:true}};
 store.queueAdd({table:'sms_logs',op:'sms',payload:{messageId:'obsolete-sms',billing_id:'safe-bill',mobile:'919123456780',message:'Synthetic obsolete bill',smsType:'bill_saved'}});
 const safeSync=load('src/lib/offlineSync.ts',['runSync'],{...db,ensureCloudSession:async()=>false,isValidMobile:()=>true,navigator:{onLine:true}});await safeSync.runSync();assert.equal(obsoleteCalls,0);assert.equal(store.cacheGetRow('sms_logs','obsolete-sms').status,'failed');
 store.cacheUpsertRow('billing',{...store.cacheGetRow('billing','safe-bill'),status:'Pending'},'id');
 store.queueAdd({table:'sms_logs',op:'sms',payload:{messageId:'old-phone-sms',billing_id:'safe-bill',mobile:'919123456780',message:'Synthetic old number',smsType:'bill_saved'}});await safeSync.runSync();assert.equal(obsoleteCalls,0);assert.equal(store.cacheGetRow('sms_logs','old-phone-sms').status,'failed');
 console.log('PASS cancelled bill and obsolete recipient SMS never reach the transport; cancellation stays reviewable');
 store.close();fs.rmSync(testDir,{recursive:true,force:true});
})().catch(e=>{console.error(e);try{store.close()}catch{};fs.rmSync(testDir,{recursive:true,force:true});process.exitCode=1});
