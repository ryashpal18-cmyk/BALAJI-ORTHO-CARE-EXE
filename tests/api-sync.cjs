const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=require('path').resolve(__dirname,'..');
function load(file,deps,names) {
 let code=fs.readFileSync(root+'/'+file,'utf8').replace(/^import[\s\S]*?from\s+["'][^"']+["'];?/gm,'').replaceAll('import.meta.env','env');
 code=ts.transpile(code.replace(/\bexport\s+/g,''),{target:ts.ScriptTarget.ES2022});
 const ctx={console,Date,env:{VITE_SUPABASE_URL:'https://example.test',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'},...deps};
 vm.createContext(ctx);vm.runInContext(code+';globalThis.api={'+names.join(',')+'}',ctx);return ctx.api;
}
(async()=>{
 const clients=[];
 const client=load('src/integrations/supabase/client.ts',{
  boundedFetch(){},window:{electron:{}},localStorage:{},
  createClient:(url,key,options)=>{const c={url,key,options,auth:{},from(){return this}};clients.push(c);return c}
 },['supabase','setCloudAccessMode']);
 assert.equal(client.supabase.from('patients'),clients[0]);
 client.setCloudAccessMode(true);assert.equal(client.supabase.from('patients'),clients[1]);
 assert.equal(client.supabase.auth,clients[0].auth);
 assert.equal(clients[1].options.auth.persistSession,false);assert.equal(clients[1].options.auth.autoRefreshToken,false);
 client.setCloudAccessMode(false);assert.equal(client.supabase.from('patients'),clients[0]);
 console.log('PASS owner API requests isolated from staff/old Auth tokens');
 let queue=[{id:1,table:'patients',op:'insert',tempId:'local_00000000-0000-4000-8000-000000000001',payload:{name:'test'},retries:15}];
 let fail=true,replaced=0,uploads=0,removed=0;
 const noop=()=>{};
 const deps={window:{addEventListener:noop},navigator:{onLine:true},MAX_SYNC_RETRIES:8,
  cLog:{info:noop,warn:noop,error:noop},queryClient:{invalidateQueries:noop},usesApiSync:()=>true,
  ensureCloudSession:async()=>true,normalizeBill:p=>p,OPERATIONAL_TABLES:['patients'],fetchCompleteTable:async()=>[],
  queueGetAll:async()=>structuredClone(queue),queueRemove:async id=>{removed++;queue=queue.filter(q=>q.id!==id)},
  queueUpdate:async(id,p)=>Object.assign(queue.find(q=>q.id===id),p),queueRemapRowId:async()=>{},
  cacheGetAll:async()=>[{id:'cached-patient',name:'keep'}],cacheReplaceTable:async()=>{replaced++},cacheReplaceRowKey:async()=>{},
  supabase:{auth:{getSession:()=>{throw Error('API sync must not need an Auth session')}},from:()=>({upsert:payload=>({select:()=>({maybeSingle:async()=>{uploads++;return fail?{error:Error('RLS denied')}:{data:payload,error:null}}})})})}
 };
 const sync=load('src/lib/offlineSync.ts',deps,['runSync','downloadAllDataToCache']);
 let r=await sync.runSync();assert.equal(r.synced,0);assert.equal(queue.length,1);assert.equal(removed,0);
 assert.match(queue[0].lastError,/RLS denied/);
 await sync.runSync();assert.equal(uploads,1,'persisted retry backoff');
 queue[0].lastAttemptAt=Date.now()-360000;fail=false;
 r=await sync.runSync();assert.equal(r.synced,1);assert.equal(queue.length,0);assert.equal(removed,1);
 await new Promise(setImmediate);await sync.downloadAllDataToCache();assert.equal(replaced,0,'RLS empty must not wipe existing local cache');
 console.log('PASS old pending retries automatically; failure retains queue; confirmed upload clears it; API-empty cache protected');
})().catch(e=>{console.error(e);process.exitCode=1});
