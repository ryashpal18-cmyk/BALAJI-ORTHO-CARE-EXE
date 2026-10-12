const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const {createCloudSync}=require('../cloud-sync.cjs');
const dirs=[];
function fixture() {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clinic-cloud-test-'));dirs.push(dir);
 const file=path.join(dir,'cloud.json'),key=crypto.randomBytes(32);
 let principal={localAdmin:true,role:'admin',userId:'local-owner',sessionKey:'local-session'},clock=Date.now(),token=null,role='admin',calls=[];
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>{
  const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([c.update(s,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]);
 },decryptString:b=>{const d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString()}};
 const response=d=>({ok:true,status:200,json:async()=>d});
 const session={access_token:'test-access',refresh_token:'test-refresh',expires_at:Math.floor(clock/1000)+3600};
 let fetch=async(url,opts)=>{
  calls.push({url,body:opts.body});assert.ok(!url.includes('grant_type=password'));
  if(url.includes('refresh_token')) return response({access_token:'rotated-access',refresh_token:'rotated-refresh',expires_in:3600});
  if(url.endsWith('/user')) return response({id:'cloud-admin',email:'cloud@example.test'});
  return response([{role}]);
 };
 const opts={file,safeStorage,access:{getPrincipal:()=>principal},config:{url:'https://clinic.test',key:'public-test'},
 fetchCloud:(...args)=>fetch(...args),onCloudToken:t=>{token=t},now:()=>clock};
 const api=createCloudSync(opts);
 return {api,file,session,safeStorage,read:()=>JSON.parse(safeStorage.decryptString(Buffer.from(JSON.parse(fs.readFileSync(file,'utf8')).data,'base64'))),
 get calls(){return calls},get token(){return token},setRole:r=>{role=r},tick:ms=>{clock+=ms},setFetch:f=>{fetch=f},setPrincipal:p=>{principal=p},response};
}
(async()=>{
 const t=fixture();assert.equal(t.api.status().configured,false);assert.equal((await t.api.connect()).success,false);
 assert.equal((await t.api.adopt(t.session)).success,true);assert.equal(t.api.status().configured,true);
 const text=fs.readFileSync(t.file,'utf8');assert.ok(!text.includes('test-refresh'));assert.ok(!text.includes('test-access'));
 assert.equal(t.read().ownerId,'local-owner');assert.equal(t.read().userId,'cloud-admin');
 assert.equal((await t.api.connect()).success,true);assert.equal(t.token,'test-access');
 t.tick(3600000);assert.equal((await t.api.connect()).success,true);assert.equal(t.token,'rotated-access');
 assert.equal(t.read().session.refresh_token,'rotated-refresh');
 assert.ok(t.calls.every(c=>!String(c.body).includes('password')));
 console.log('PASS encrypted separate cloud session; local/cloud identities independent; token refresh without any password');
 const denied=fixture();denied.setRole('staff');await assert.rejects(()=>denied.api.adopt(denied.session),/administrator/);assert.ok(!fs.existsSync(denied.file));
 denied.setPrincipal({role:'staff'});await assert.rejects(()=>denied.api.adopt(denied.session),/administrator/);
 const insecure=fixture();insecure.safeStorage.isEncryptionAvailable=()=>false;await assert.rejects(()=>insecure.api.adopt(insecure.session),/secure storage/);assert.ok(!fs.existsSync(insecure.file));
 console.log('PASS staff denied, cloud role verified, encryption mandatory');
 const race=fixture();await race.api.adopt(race.session);race.tick(3600000);
 let release;race.setFetch(()=>new Promise(r=>{release=r}));const p=race.api.connect();await new Promise(setImmediate);
 race.setPrincipal(null);race.api.pause();release(race.response({access_token:'late-token',refresh_token:'late-refresh',expires_in:3600}));
 assert.equal((await p).success,false);assert.equal(race.token,null);assert.equal(race.read().session.refresh_token,'test-refresh');
 console.log('PASS logout during refresh cannot restore cloud access or overwrite saved session');
 const outage=fixture();await outage.api.adopt(outage.session);outage.tick(3600000);let count=0;
 outage.setFetch(async(url)=>{
  count++;if(url.includes('refresh_token'))return outage.response({access_token:'new',refresh_token:'new-refresh',expires_in:3600});
  throw Error('transport unavailable');
 });
 assert.equal((await outage.api.connect()).success,false);assert.equal(outage.read().session.refresh_token,'new-refresh');
 const before=count;assert.equal((await outage.api.connect()).success,false);assert.equal(count,before);
 assert.ok(fs.existsSync(outage.file));
 console.log('PASS rotated credential retained through outage; backoff preserves saved connection');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>dirs.forEach(d=>fs.rmSync(d,{recursive:true,force:true})));
