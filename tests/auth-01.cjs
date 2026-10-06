const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict'), ts = require('typescript');
const path = require('path'), root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/pages/Login.tsx'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const start = source.indexOf('  const handleLogin =');
const handler = ts.transpile(source.slice(start, source.indexOf('\n  return (', start)), { target: ts.ScriptTarget.ES2022 });
async function scenario(role, failure) {
 const saved = new Map(), calls = [], pages = role === 'staff' ? ['/opd'] : [];
 const profile = {role, pages};
 const electron = {logout:async()=>calls.push('logout'), establishSession:async()=>{calls.push('verify');return {success: failure !== 'desktop'}}};
 const ctx = {loading:false, username:'owner@example.test',password:'test-input-only',window:{electron},
 queryClient:{clear(){}},setLoading(){},setPassword(){},toast:()=>calls.push('error'),navigate:p=>calls.push(p),
 STORAGE_KEYS:{IS_LOGGED_IN:'logged',USER_NAME:'name',USER_ROLE:'role',USER_PERMS:'pages'},
 localStorage:{setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
 supabase:{auth:{signOut:async()=>{},signInWithPassword:async()=>({data:{session:failure==='password'?null:{access_token:'test-token'}},error:null})},functions:{invoke:async()=>({data:profile,error:null})}},
 migrateLegacyIndexedDbIfNeeded:async()=>{if(failure==='migration')throw Error('migration failed');calls.push('migrate')},
 startAutoSync:()=>calls.push('sync'),startAutoBackupScheduler:()=>calls.push('backup')};
 vm.createContext(ctx); vm.runInContext(handler+';globalThis.run=handleLogin',ctx);
 await ctx.run({preventDefault(){}});return {saved,calls};
}
(async()=>{
 const admin=await scenario('admin');assert.equal(admin.saved.get('role'),'admin');assert.ok(admin.calls.includes('verify'));assert.ok(admin.calls.includes('/dashboard'));assert.ok(admin.calls.includes('migrate'));
 const staff=await scenario('staff');assert.equal(staff.saved.get('role'),'staff');assert.ok(staff.calls.includes('/opd'));assert.ok(!staff.calls.includes('backup'));
 for(const failure of ['password','desktop','migration']){const r=await scenario('admin',failure);assert.equal(r.saved.size,0);assert.ok(!r.calls.includes('sync'));assert.ok(r.calls.includes('error'))}
 const denied=await scenario('unknown');assert.equal(denied.saved.size,0);
 const handlers={};vm.runInNewContext(main.slice(main.indexOf("ipcMain.handle('auth:login'"),main.indexOf('// ═',main.indexOf("ipcMain.handle('auth:login'"))),{ipcMain:{handle:(key,fn)=>handlers[key]=fn},access:{getPrincipal:()=>null,setPrincipal(){}}});
 assert.equal((await handlers['auth:login']({}, {username:'anything',password:'anything'})).success,false);
 assert.equal((await handlers['auth:check']()).valid,false);
 assert.ok(!source.includes('QUICK_USERS'));assert.ok(!source.includes('LOCAL_PASSWORD'));assert.ok(!main.includes('password:'));
 console.log('PASS: admin, staff, invalid password, desktop rejection, migration failure, unknown role, local bypass denial and empty login defaults');
})().catch(e=>{console.error(e);process.exitCode=1});
