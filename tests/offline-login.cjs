const assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { createOffline, register } = require('../offline-login.cjs');
const SECRET = 'Test-Only-Local-Secret-1', ID = 'owner@example.test';
const dirs = [];
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-owner-')); dirs.push(dir);
  const file = path.join(dir, 'offline-admin.json'), key = crypto.randomBytes(32);
  let principal = null, clock = Date.now(), token = null, networkCalls = 0, fetchImpl;
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString(text) {
      const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    },
    decryptString(data) {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
      decipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString();
    },
  };
  const access = { getPrincipal: () => principal, setPrincipal: p => { principal = p; } };
  const options = { file, safeStorage, access, now: () => clock, config: {url:'https://example.test', key:'public-test'},
    fetchCloud: async (...args) => { networkCalls++; return fetchImpl(...args); }, onCloudToken: value => { token = value; } };
  const make = () => createOffline(options);
  let api = make();
  return { file, dir, access, safeStorage, options, get api() { return api; }, get token() { return token; }, get calls() { return networkCalls; },
    tick: ms => { clock += ms; }, restart() { principal = null; api = make(); },
    cloud(fn) { fetchImpl = fn; }, get principal() { return principal; },
    setup: () => api.setup({identifier:ID, secret:SECRET, confirmSecret:SECRET}),
    login: (secret = SECRET, extra = {}) => api.login({identifier:ID, secret, ...extra}) };
}
const response = data => ({ok:true, json:async()=>data});
function goodCloud(url) {
  if (url.includes('/token')) return response({access_token:'test-access', refresh_token:'test-refresh', expires_in:3600});
  if (url.includes('/user')) return response({id:'cloud-owner', email:ID});
  return response({userId:'cloud-owner',role:'admin',pages:[]});
}
(async () => {
  const t = fixture();
  assert.equal(t.api.status().configured, false);
  assert.equal(t.api.restore(), null);
  assert.equal((await t.api.setup({identifier:ID,secret:SECRET,confirmSecret:'mismatch'})).success,false);
  assert.equal((await t.setup()).success,true);
  assert.equal(t.calls,0, 'offline setup must make no network requests');
  assert.equal(t.principal.role,'admin');
  assert.equal(t.principal.localAdmin,true);
  const identity=t.principal.userId;
  const stored=fs.readFileSync(t.file,'utf8');
  assert.ok(!stored.includes(SECRET)); assert.ok(!stored.includes(ID));
  assert.equal(JSON.parse(stored).enc,true);
  assert.equal((await t.setup()).success,false,'cannot overwrite existing ownership');
  t.tick(365*86400000); t.restart();
  assert.equal(t.api.restore().userId,identity,'automatic login survives long offline restart');
  t.api.logout(); t.restart();
  assert.equal(t.api.restore(),null,'explicit logout persists');
  for(let i=0;i<5;i++) assert.equal((await t.login('Wrong-test-secret')).success,false);
  assert.equal((await t.login()).success,false);
  assert.equal(t.principal,null);
  t.tick(16*60000);
  assert.equal((await t.login()).success,true);
  assert.equal(t.principal.userId,identity);
  t.api.logout();
  assert.equal((await t.login(SECRET,{remember:false})).success,true);
  t.restart(); assert.equal(t.api.restore(),null);
  await t.login();
  console.log('PASS offline first setup, encrypted storage, restart/year offline, logout, wrong password, persistent lockout, remember opt-out');

  t.cloud(goodCloud);
  let connected=await t.api.connect();
  assert.equal(connected.success,true);
  assert.equal(t.token,'test-access');
  assert.equal(t.principal.userId,identity,'cloud must not replace local identity');
  assert.ok(!JSON.stringify(connected).includes(SECRET));
  t.api.logout(); t.restart(); assert.equal(t.api.restore(),null);
  await t.login();
  t.cloud(url => url.includes('/session-access') ? response({userId:'cloud-owner',role:'staff',pages:['/opd']}) : goodCloud(url));
  assert.equal((await t.api.connect()).success,false);
  assert.equal(t.token,null);
  assert.equal(t.principal.role,'admin','cloud denial cannot lock local owner out');
  const calls=t.calls; await t.api.connect(); assert.equal(t.calls,calls,'cloud failure backs off');
  t.tick(61000); t.cloud(goodCloud);
  assert.equal((await t.api.connect()).success,true,'automatic reconnect without another local login');
  t.tick(3600000);
  let release; t.cloud(() => new Promise(resolve => { release=resolve; }));
  const pending=t.api.connect(); await new Promise(setImmediate);
  t.api.logout();
  t.cloud(goodCloud);
  release(response({access_token:'late-token',refresh_token:'late-refresh',expires_in:3600}));
  assert.equal((await pending).success,false);
  assert.equal(t.principal,null); assert.equal(t.token,null);
  t.restart(); assert.equal(t.api.restore(),null);
  console.log('PASS verified matching cloud admin only, cloud outage/backoff/reconnect, logout during connection cannot restore access');

  const corrupt=fixture(); await corrupt.setup();
  fs.writeFileSync(corrupt.file,'broken');
  corrupt.restart();
  assert.throws(()=>corrupt.api.restore(),/recovery/);
  await assert.rejects(()=>corrupt.setup(),/recovery/);
  assert.equal(fs.readFileSync(corrupt.file,'utf8'),'broken');
  const unavailable=fixture(); unavailable.safeStorage.isEncryptionAvailable=()=>false;
  await assert.rejects(()=>unavailable.setup(),/secure storage/);
  assert.ok(!fs.existsSync(unavailable.file));
  const staff=fixture(); staff.access.setPrincipal({role:'staff'});
  assert.equal((await staff.setup()).success,false);
  const legacy=fixture(), salt=crypto.randomBytes(16);
  const hash=crypto.scryptSync(SECRET,salt,64,{N:32768,r:8,p:1,maxmem:128*1024*1024});
  fs.writeFileSync(legacy.file,JSON.stringify({v:1,enc:false,data:{email:ID,userId:'legacy-user',salt:salt.toString('base64'),hash:hash.toString('base64'),remember:true}}));
  assert.equal(legacy.api.restore(),null,'unprotected legacy file never grants auto-login');
  assert.equal((await legacy.login()).success,true);
  assert.equal(JSON.parse(fs.readFileSync(legacy.file)).enc,true);
  legacy.restart(); assert.equal(legacy.api.restore().userId,'legacy-user');
  console.log('PASS corrupt credentials fail closed, no encryption fallback, staff cannot enroll, legacy manual login upgrades encrypted storage');

  const moved=fixture(), handlers={}; let userDir=moved.dir;
  await moved.setup(); moved.api.logout(); moved.access.setPrincipal(null);
  const registration=register({ipcMain:{handle:(name,fn)=>{handlers[name]=fn;}}, access:moved.access,
    app:{getPath:()=>userDir},safeStorage:moved.safeStorage,net:{fetch:goodCloud},config:moved.options.config});
  userDir=path.join(moved.dir,'new-user-data');
  assert.equal(handlers['auth:offlineStatus']().configured,true);
  assert.ok(fs.existsSync(path.join(userDir,'offline-admin.json')));
  assert.equal(registration.restore(),null);
  console.log('PASS old userData login migration preserves ownership and explicit logout');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>dirs.forEach(dir=>fs.rmSync(dir,{recursive:true,force:true})));
