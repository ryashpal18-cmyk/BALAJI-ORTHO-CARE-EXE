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
const findings=[];const found=(id,evidence)=>{findings.push({id,evidence});console.log('PASS',id)};
const reset=()=>{for(const m of store.queueGetAll())store.queueRemove(m.id)};
(async()=>{
 reset();const id=uid();store.cacheUpsertRow('patients',{id,name:'original'},'id');
 await offline.offlineUpdate('patients',id,{name:'first edit'});await offline.offlineUpdate('patients',id,{name:'latest edit'});
 let failFirst=true,remote={id,name:'original'};
 const supabase={auth:{getSession:async()=>({data:{session:null}})},from:()=>({update:p=>({eq:()=>({select:()=>({single:async()=>{if(p.name==='first edit'&&failFirst){failFirst=false;return {error:Error('transient')}};remote={...remote,...p};return {data:remote}}})})})})};
 const sync=load('src/lib/offlineSync.ts',['runSync'],{...db,supabase,queryClient:{invalidateQueries:noop},navigator:{onLine:true}});
 await sync.runSync();assert.equal(remote.name,'original');await sync.runSync();assert.equal(remote.name,'latest edit');
 found('F01-order','Regression fixed and verified');
 reset();const deleted=uid();store.cacheUpsertRow('prescriptions',{id:deleted,medicines:'test'},'id');await offline.offlineDelete('prescriptions',deleted);
 await db.cacheUpsertRowFromServer('prescriptions',{id:deleted,medicines:'stale server copy'});
 assert.ok(!store.cacheGetRow('prescriptions',deleted));assert.equal(store.queueGetAll()[0].op,'delete');found('F02-tombstone','Regression fixed and verified');
 reset();const ac=require(root+'/access-control.cjs');ac.setPrincipal({role:'staff',userId:'staff-a',pages:['/opd'],branchIds:['branch-a'],expiresAt:Date.now()+10000});
 const foreign=uid();store.cacheUpsertRow('patients',{id:foreign,name:'branch-b patient',branch_id:'branch-b'},'id');
 const qid=store.queueAdd({table:'patients',op:'update',rowId:foreign,payload:{name:'private branch-b name'}});
 assert.doesNotThrow(()=>ac.authorize('offline:queueGetAll',[],store));assert.equal(store.queueGetAll().filter(m=>ac.canMutation(m,store)).length,0);
 assert.throws(()=>ac.authorize('offline:queueRemove',[qid],store));assert.throws(()=>ac.authorize('offline:cacheDeleteRow',[{table:'patients',rowId:foreign}],store));
 assert.throws(()=>ac.authorize('offline:queueAdd',[{table:'patients',op:'delete',rowId:foreign}],store));found('F03-ipc','Regression fixed and verified');
 ac.setPrincipal({role:'staff',pages:['/inventory'],expiresAt:Date.now()+10000});
 assert.doesNotThrow(()=>ac.authorize('offline:commitMutation',[{mutation:{table:'audit_logs',op:'insert'},row:{}}],store));found('F04-audit','Regression fixed and verified');
 const bill={id:uid(),amount_paid:100,payment_mode:'Cash',payment_history:[{id:uid(),amount:100,payment_mode:'Cash',paid_at:'2026-10-05T05:00:00Z'}]};
 const changed=payment.withPaymentHistory(bill,{amount_paid:100,payment_mode:'UPI'},uid(),'2026-10-06T05:00:00Z');
 assert.equal(changed.payment_mode,'UPI');assert.equal(changed.payment_history.filter(r=>r.payment_mode==='Cash').reduce((n,r)=>n+r.amount,0),0);assert.equal(changed.payment_history.filter(r=>r.payment_mode==='UPI').reduce((n,r)=>n+r.amount,0),100);assert.equal(bill.payment_history.length,1);found('F05-payment-mode','Regression fixed and verified');
 reset();const rid=uid();store.cacheUpsertRow('patients',{id:rid,name:'still remote'},'id');await offline.offlineDelete('patients',rid);
 const noDelete={rpc:async()=>({data:false,error:null}),auth:{getSession:async()=>({data:{session:null}})},from:()=>({delete:()=>({eq:async()=>({error:null,count:0})})})};
 const zero=load('src/lib/offlineSync.ts',['runSync'],{...db,supabase:noDelete,queryClient:{invalidateQueries:noop},navigator:{onLine:true}});const z=await zero.runSync();assert.equal(z.synced,0);assert.equal(store.queueGetAll().length,1);found('F06-delete-ack','zero-row denied delete treated as success; pending intent discarded');
 reset();let reads=0;
 const locked=load('src/lib/offlineSync.ts',['runSync'],{...db,queueGetAll:async()=>{if(++reads===1)throw Error('IPC disconnected');return []},supabase:noDelete,navigator:{onLine:true}});
 await assert.rejects(()=>locked.runSync(),/IPC/);assert.equal((await locked.runSync()).synced,0);assert.ok(reads>2);found('F07-sync-lock','Regression fixed and verified');
 console.log('PASS all seven follow-up sync/IPC/payment regressions');store.close();
})().catch(e=>{console.error(e);process.exitCode=1;try{store.close()}catch{}});
