const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),ts=require('typescript');
let source=fs.readFileSync(require('path').join(__dirname,'../src/lib/localSession.ts'),'utf8').replace(/^import.*$/gm,'');
source=ts.transpile(source.replace(/\bexport\s+/g,''),{target:ts.ScriptTarget.ES2022});
let auth={valid:true,principal:{localAdmin:true}},mode=false,session=null,calls=0;
const ctx={window:{electron:{checkAuth:async()=>auth,syncSession:async()=>{throw Error('password sync forbidden')}}},
 setCloudAccessMode:value=>{mode=value},supabase:{auth:{getSession:async()=>{calls++;return {data:{session}}}}}};
vm.createContext(ctx);vm.runInContext(source+';globalThis.api={ensureCloudSession,resetCloudConnection}',ctx);
(async()=>{
 assert.equal(await ctx.api.ensureCloudSession(),true);assert.equal(mode,true);assert.equal(calls,0);
 auth={valid:false};assert.equal(await ctx.api.ensureCloudSession(),false);assert.equal(mode,false);
 auth={valid:true,principal:{localAdmin:false}};
 assert.equal(await ctx.api.ensureCloudSession(),false);assert.equal(mode,false);
 session={access_token:'staff'};assert.equal(await ctx.api.ensureCloudSession(),true);assert.equal(mode,false);
 auth={valid:true,principal:{localAdmin:true}};await ctx.api.ensureCloudSession();assert.equal(mode,true);
 ctx.api.resetCloudConnection();assert.equal(mode,false);
 console.log('PASS local API sync without cloud password; logged-out and staff access remain gated');
})().catch(e=>{console.error(e);process.exitCode=1});
