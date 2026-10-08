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
for(const name of ['cacheMergeServer','cacheGetAll','cacheGetRow','cacheSetRows','cacheReplaceTable','cacheUpsertRow','cacheDeleteRow','cacheReplaceRowKey','queueGetAll','queueRemove','queueUpdate','metaSet','commitMutation','snapshot','restoreSnapshot','adjustStock'])
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
const db=load('src/lib/offlineDb.ts',['cacheUpsertRowFromServer','cacheGetAll','cacheGetRow','cacheUpsertRow','cacheReplaceTable','cacheSetRows','cacheDeleteRow','cacheReplaceRowKey','queueAdd','queueGetAll','queueUpdate','queueRemove','queueRemapRowId','commitMutation','tempId','getLocalSnapshot','atomicStockAdjustment','MAX_SYNC_RETRIES']);
const payment=load('src/lib/paymentLedger.ts',['paymentHistory','withPaymentHistory','collectionRows']);
const offline=load('src/lib/offlineQuery.ts',['offlineInsert','offlineUpdate','offlineDelete'],{...db,...payment,isOnline:async()=>false,runSync:noop});

(async()=>{
 const id=require('crypto').randomUUID();
 await offline.offlineInsert('patients',{id,name:'Durable test',branch_id:'branch-a'});
 const q=store.queueGetAll()[0];store.queueUpdate(q.id,{retries:12,lastAttemptAt:Date.now()-600000,lastError:'temporary network outage'});
 store.close();store.init(testDir);
 assert.equal(store.cacheGetRow('patients',id).name,'Durable test');assert.equal(store.queueGetAll()[0].retries,12);assert.ok(store.queueGetAll()[0].lastAttemptAt);
 console.log('PASS real SQLite reopen retains local row, queue and retry deadline');
 const never=new Promise(()=>{});let cloudCalls=0;
 const localReads=load('src/lib/offlineQuery.ts',['offlineFetch'],{...db,queryClient:{invalidateQueries:noop},navigator:{onLine:true}});
 const rows=await localReads.offlineFetch('patients',()=>{cloudCalls++;return never});assert.equal(rows[0].name,'Durable test');
 const empty=await localReads.offlineFetch('appointments',()=>never);assert.equal(empty.length,0);
 const branch=load('src/lib/branchData.ts',['readBranchTable'],{...db,queryClient:{invalidateQueries:noop},isOnline:()=>never});
 assert.equal((await branch.readBranchTable('patients','branch-a')).length,1);
 console.log('PASS local populated and empty screens return while network is stalled');
 let calls=0;const supabase={auth:{getSession:async()=>({data:{session:null}})},from:()=>({upsert:p=>({select:()=>({single:async()=>{calls++;return {data:p,error:null}}})})})};
 const sync=load('src/lib/offlineSync.ts',['runSync'],{...db,supabase,queryClient:{invalidateQueries:noop},navigator:{onLine:true}});
 const disconnected=load('src/lib/offlineSync.ts',['runSync'],{...db,supabase,ensureCloudSession:async()=>false,navigator:{onLine:true}});
 const beforeConnect=JSON.stringify(store.queueGetAll());
 assert.equal((await disconnected.runSync()).pending,1);
 assert.equal(calls,0);assert.equal(JSON.stringify(store.queueGetAll()),beforeConnect);
 console.log('PASS missing cloud login preserves pending work and retry count without attempting upload');
 await sync.runSync();assert.equal(calls,1);assert.equal(store.queueGetAll().length,0);
 console.log('PASS retry succeeds automatically after more than eight failures');
 await offline.offlineInsert('patients',{id:require('crypto').randomUUID(),name:'Backoff test',branch_id:'branch-a'});
 const failing=load('src/lib/offlineSync.ts',['runSync'],{...db,supabase:{auth:supabase.auth,from:()=>({upsert:()=>({select:()=>({single:async()=>{calls++;return {error:Error('transport failed')}}})})})},navigator:{onLine:true}});
 await failing.runSync();const attempt=calls;await failing.runSync();assert.equal(calls,attempt);assert.equal(store.queueGetAll().length,1);
 console.log('PASS persistent retry backoff prevents hot loops and keeps failed work');
 const ortho=load('src/hooks/useOrtho.ts',['useUpdateFractureCase'],{useMutation:v=>v,useQueryClient:()=>({invalidateQueries:noop}),offlineUpdate:async(t,id,p)=>({table:t,id,...p}),isOnline:()=>{throw Error('Should not wait for network')}});
 assert.equal((await ortho.useUpdateFractureCase().mutationFn({id:'case',doctor_notes:'saved locally'})).doctor_notes,'saved locally');
 console.log('PASS Ortho edits use local commit regardless of network');
 for(const m of store.queueGetAll())store.queueRemove(m.id);
 const hooks=load('src/hooks/useDatabase.ts',['useDeleteBill','useDeletePatient'],{useMutation:v=>v,useQueryClient:()=>({invalidateQueries:noop}),offlineDelete:offline.offlineDelete,isOnline:()=>{throw Error('Delete must not wait for network')},supabase:{from:()=>{throw Error('Direct cloud write forbidden before local delete')}}});
 await hooks.useDeleteBill().mutationFn('bill-local-test');await hooks.useDeletePatient().mutationFn({id:'patient-local-test'});
 assert.equal(store.queueGetAll().filter(m=>m.op==='delete').length,2);
 console.log('PASS bill/patient delete commits locally without cloud preflight');
 for(const m of store.queueGetAll())store.queueRemove(m.id);
 store.queueAdd({table:'sms_logs',op:'sms',payload:{mobile:'0000000000',message:'legacy invalid'}});
 const invalid=load('src/lib/offlineSync.ts',['runSync'],{...db,isValidMobile:()=>false,supabase:{auth:{getSession:async()=>({data:{session:null}})}},navigator:{onLine:true}});
 assert.equal((await invalid.runSync()).synced,0);assert.equal(store.queueGetAll().length,1);assert.match(store.queueGetAll()[0].lastError,/Invalid SMS recipient/);
 console.log('PASS invalid legacy SMS remains reviewable instead of being marked sent');
 const localQuery=load('src/lib/offlineQuery.ts',['offlineFetch','offlineFetchScoped'],{...db,navigator:{onLine:false}});
 store.cacheUpsertRow('fracture_cases',{id:'case-local',patient_id:id,next_followup_date:new Date().toISOString().slice(0,10)},'id');
 store.cacheUpsertRow('fracture_xrays',{id:'xray-local',fracture_case_id:'case-local',file_url:'cached-url'},'id');
 const orthoReads=load('src/hooks/useOrtho.ts',['useFollowupsAround','useFractureXrays'],{...db,...localQuery,businessDate:d=>new Date(d).toISOString().slice(0,10),useQuery:v=>v,supabase:{from:()=>{throw Error('Offline screen must not request network')}},isOnline:()=>{throw Error('Network preflight forbidden')}});
 assert.equal((await orthoReads.useFollowupsAround().queryFn()).some(r=>r.id==='case-local'),true);
 assert.equal((await orthoReads.useFractureXrays('case-local').queryFn())[0].id,'xray-local');
 console.log('PASS Ortho follow-ups and X-ray list read cached rows without network');
 let externalHandler;const opened=[];const main=fs.readFileSync(root+'/main.js','utf8');const a=main.indexOf("ipcMain.on('open-external-url'");const b=main.indexOf("ipcMain.on('open-whatsapp'",a);
 vm.runInNewContext(main.slice(a,b),{ipcMain:{on:(_,fn)=>externalHandler=fn},shell:{openExternal:async url=>opened.push(url)}});
 externalHandler(null,'file:///C:/test.exe');externalHandler(null,'custom-app:payload');externalHandler(null,'https://example.invalid');assert.deepEqual(opened,['https://example.invalid']);
 console.log('PASS external URL alias rejects file/custom protocols');
 const bounded=load('src/lib/boundedFetch.ts',['boundedFetch'],{AbortController,Request,fetch:(_input,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason))),setTimeout:fn=>setTimeout(fn,10)});
 await assert.rejects(()=>bounded.boundedFetch('https://example.invalid'),/timed out/);
 console.log('PASS stalled request aborts without discarding local data');
 store.close();fs.rmSync(testDir,{recursive:true,force:true});
})().catch(e=>{console.error(e);try{store.close()}catch{};fs.rmSync(testDir,{recursive:true,force:true});process.exitCode=1});
