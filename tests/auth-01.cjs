const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),ts=require('typescript'),path=require('path');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(root+'/src/pages/Login.tsx','utf8');
const enter=source.slice(source.indexOf('  const enter ='),source.indexOf('\n  useEffect',source.indexOf('  const enter =')));
const handle=source.slice(source.indexOf('  const handleLogin ='),source.indexOf('\n  return (',source.indexOf('  const handleLogin =')));
const code=ts.transpile(enter+'\n'+handle,{target:ts.ScriptTarget.ES2022});
async function scenario(mode,configured=true,failure='',role='admin'){
 const calls=[],saved=new Map(),profile={role,pages:role==='staff'?['/opd']:[],displayName:'Test'};
 const local=async()=>{calls.push(configured?'local-login':'local-setup');return failure==='password'?{success:false,error:'wrong password'}:{success:true,principal:profile}};
 const ctx={loading:false,ready:true,desktop:true,mode,configured,confirmPassword:'test-only',remember:true,
 username:'owner@example.test',password:'test-only',queryClient:{clear(){}},resetCloudConnection(){},
 setLoading(){},setPassword(){},setConfirmPassword(){},toast(){calls.push('error')},navigate:p=>calls.push(p),
 STORAGE_KEYS:{IS_LOGGED_IN:'logged',USER_NAME:'name',USER_ROLE:'role',USER_PERMS:'pages'},
 localStorage:{setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
 displaySession:p=>{saved.set('role',p.role)},
 window:{electron:{offlineLogin:local,offlineSetup:local,logout:async()=>calls.push('logout'),establishSession:async()=>({success:failure!=='desktop'})}},
 supabase:{auth:{signOut:async()=>calls.push('cloud-signout'),signInWithPassword:async()=>{calls.push('cloud-login');return {data:{session:failure==='password'?null:{access_token:'test-token'}}}}},
 functions:{invoke:async()=>({data:profile})}},
 migrateLegacyIndexedDbIfNeeded:async()=>{if(failure==='migration')throw Error('migration failed');calls.push('migrate')},
 startAutoSync:()=>calls.push('sync'),startAutoBackupScheduler:()=>calls.push('backup')};
 vm.createContext(ctx);vm.runInContext(code+';globalThis.run=handleLogin',ctx);await ctx.run({preventDefault(){}});
 return {calls,saved};
}
(async()=>{
 for(const configured of [false,true]){
  const r=await scenario('local',configured);assert.equal(r.saved.get('role'),'admin');
  assert.ok(r.calls.includes('/dashboard'));assert.ok(r.calls.includes('sync'));assert.ok(r.calls.includes('backup'));
  assert.ok(!r.calls.some(c=>c.startsWith('cloud')),'local entry never waits for cloud');
 }
 const wrong=await scenario('local',true,'password');assert.equal(wrong.saved.size,0);assert.ok(wrong.calls.includes('error'));assert.ok(!wrong.calls.includes('/dashboard'));
 const staff=await scenario('cloud',true,'','staff');assert.equal(staff.saved.get('role'),'staff');assert.ok(staff.calls.includes('/opd'));assert.ok(!staff.calls.includes('backup'));
 for(const failure of ['password','desktop','migration']){const r=await scenario('cloud',true,failure);assert.equal(r.saved.size,0);assert.ok(r.calls.includes('error'));assert.ok(!r.calls.includes('sync'));}
 const unknown=await scenario('cloud',true,'','unknown');assert.equal(unknown.saved.size,0);
 console.log('PASS login UI logic: setup/login offline without any cloud wait, incorrect password, staff permissions, cloud validation and migration failure');
})().catch(e=>{console.error(e);process.exitCode=1});
