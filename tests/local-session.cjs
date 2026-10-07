const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),ts=require('typescript');
let source=fs.readFileSync(require('path').join(__dirname,'../src/lib/localSession.ts'),'utf8').replace(/^import.*$/gm,'');
source=ts.transpile(source.replace(/\bexport\s+/g,''),{target:ts.ScriptTarget.ES2022});
let auth={valid:true,principal:{localAdmin:true,sessionKey:'first'}},calls=0,sets=0,reply={success:false};
const ctx={window:{electron:{checkAuth:async()=>auth,syncSession:async()=>{calls++;return typeof reply==='function'?reply():reply}}},
 supabase:{auth:{getSession:async()=>({data:{session:{}}}),setSession:async()=>{sets++;return {error:null}}}},Date};
vm.createContext(ctx);vm.runInContext(source+';globalThis.api={ensureCloudSession,resetCloudConnection}',ctx);
(async()=>{
 assert.equal(await ctx.api.ensureCloudSession(),false);assert.equal(sets,0);
 reply={success:true,session:{access_token:'test',refresh_token:'test',expires_at:Date.now()/1000+3600}};
 assert.equal(await ctx.api.ensureCloudSession(),true);assert.equal(sets,1);
 const count=calls;assert.equal(await ctx.api.ensureCloudSession(),true);assert.equal(calls,count);
 auth={valid:false};assert.equal(await ctx.api.ensureCloudSession(),false);
 auth={valid:true,principal:{localAdmin:true,sessionKey:'second'}};
 let release;reply=()=>new Promise(r=>{release=r});
 const p=ctx.api.ensureCloudSession();await new Promise(setImmediate);
 auth={valid:false};release({success:true,session:{access_token:'late',refresh_token:'late'}});
 assert.equal(await p,false);assert.equal(sets,1,'late sync cannot install a session after logout');
 console.log('PASS renderer cloud gate: disconnected, authenticated, bounded reuse, session change and logout race');
})().catch(e=>{console.error(e);process.exitCode=1});
