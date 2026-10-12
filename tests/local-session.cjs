const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),ts=require('typescript');
let source=fs.readFileSync(require('path').join(__dirname,'../src/lib/localSession.ts'),'utf8').replace(/^import.*$/gm,'').replaceAll('import.meta.env','env');
source=ts.transpile(source.replace(/\bexport\s+/g,''),{target:ts.ScriptTarget.ES2022});
let auth={valid:true,principal:{localAdmin:true,sessionKey:'owner'}},reply={success:false,error:'connect'},sets=0,adopts=0;
const storage=new Map(),session={access_token:'old-test',refresh_token:'refresh-test',expires_at:Date.now()/1000+3600};
const ctx={window:{electron:{checkAuth:async()=>auth,syncSession:async()=>typeof reply==='function'?reply():reply,
 adoptSyncSession:async saved=>{adopts++;assert.equal(saved.access_token,'old-test');reply={success:true,session}}}},
 localStorage:{getItem:k=>storage.get(k)||null,removeItem:k=>storage.delete(k)},URL,Date,
 env:{VITE_SUPABASE_URL:'https://clinic-test.supabase.co'},
 supabase:{auth:{getSession:async()=>({data:{session:null}}),setSession:async()=>{sets++;return {error:null}},signOut:async()=>{}}}};
vm.createContext(ctx);vm.runInContext(source+';globalThis.api={ensureCloudSession,resetCloudConnection}',ctx);
(async()=>{
 assert.equal(await ctx.api.ensureCloudSession(),false);assert.equal(sets,0);
 ctx.api.resetCloudConnection();storage.set('sb-clinic-test-auth-token',JSON.stringify(session));
 assert.equal(await ctx.api.ensureCloudSession(),true);assert.equal(adopts,1);assert.equal(sets,1);
 assert.ok(!storage.has('sb-clinic-test-auth-token'));
 assert.equal(await ctx.api.ensureCloudSession(),true);assert.equal(sets,1);
 auth={valid:false};assert.equal(await ctx.api.ensureCloudSession(),false);
 auth={valid:true,principal:{localAdmin:true,sessionKey:'different'}};
 let release;reply=()=>new Promise(r=>{release=r});
 const p=ctx.api.ensureCloudSession();await new Promise(setImmediate);auth={valid:false};release({success:true,session});
 assert.equal(await p,false);assert.equal(sets,1);
 console.log('PASS separate cloud session, old-session adoption, no password coupling, bounded reuse and logout race');
})().catch(e=>{console.error(e);process.exitCode=1});
