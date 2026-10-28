'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript'),{EventEmitter}=require('events');
const {createWhatsAppService}=require('../whatsapp-service.cjs');
const {recoverWhatsAppBrowser}=require('../whatsapp-browser.cjs');
const noop=()=>{},flush=()=>new Promise(setImmediate);
function load(file,mocks,globals={}){
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/import\.meta\.env/g,'({})'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:n=>{if(!(n in mocks))throw Error('Unexpected import '+n);return mocks[n]},console,Date,structuredClone,setTimeout,clearTimeout,setInterval,clearInterval,...globals});return mod.exports;
}
(async()=>{
 const notes=new Map(),cache=new Map();let queue=[],writes=0,fail=false;
 const db={queueGetAll:async()=>structuredClone(queue),queueUpdate:async(id,p)=>Object.assign(queue.find(q=>q.id===id),p),queueRemove:async id=>{queue=queue.filter(q=>q.id!==id)},metaSet:async(k,v)=>notes.set(k,structuredClone(v)),metaGet:async k=>structuredClone(notes.get(k)),cacheGetAll:async()=>[...cache.values()],cacheReplaceRowKey:async(t,id,row)=>{cache.delete(id);cache.set(row.id,row)},queueRemapRowId:async()=>{},cacheUpsertRow:async(t,row)=>cache.set(row.id,row)};
 const review=load('src/lib/smsReview.ts',{'./offlineDb':db});
 const client={from:()=>({upsert:payload=>({select:()=>({maybeSingle:async()=>{writes++;assert.equal(payload.status,'pending');return fail?{error:{code:'23514',message:'new row violates check constraint other_check'}}:{data:{...payload}}}})}),update:payload=>({eq:id=>({select:()=>({single:async()=>{writes++;assert.equal(payload.status,'pending');assert.equal(payload.id,undefined);return {data:{...payload,id}}}})})})})};
 const sync=load('src/lib/offlineSync.ts',{'./patientRegistration':{warmRegistrationNumbers:async()=>{}},'./paymentLedger':{normalizeBill:x=>x},'./smsReview':review,'./completeFetch':{OPERATIONAL_TABLES:[],resetCloudSchemaBackoff:noop},'./localSession':{ensureCloudSession:async()=>true},'@/integrations/supabase/client':{supabase:client,usesApiSync:()=>false},'@/lib/clientLogger':{cLog:{info:noop,warn:noop,error:noop}},'@/lib/utils':{isValidMobile:()=>true},'@/lib/queryClient':{queryClient:{invalidateQueries:async()=>{}}},'./offlineDb':db},{navigator:{onLine:true},window:{addEventListener:noop,electron:{sendSMS:()=>{throw Error('A log repair must never send SMS')}}}});
 for(const [index,status] of review.SMS_REVIEW_STATUSES.entries()){
  const id='sms-'+index;queue.push({id:index+1,table:'sms_logs',op:'insert',tempId:id,payload:{id,status,message:'synthetic'},retries:254,lastError:'violates check constraint sms_logs_status_check',lastAttemptAt:Date.now()});
 }
 assert.equal((await sync.runSync()).synced,2);assert.equal(queue.length,0);assert.equal(writes,2);
 const restarted=load('src/lib/smsReview.ts',{'./offlineDb':db});
 await Promise.all([review.saveSmsReview('parallel-1','first review'),review.saveSmsReview('parallel-2','second review')]);
 const concurrent=await review.withSmsReviews([{id:'parallel-1',status:'pending'},{id:'parallel-2',status:'pending'}]);
 assert.equal(concurrent[0].status,'first review');assert.equal(concurrent[1].status,'second review');
 const shown=await restarted.withSmsReviews([...cache.values()]);assert.equal(shown[0].status,review.SMS_REVIEW_STATUSES[0]);assert.equal(shown[1].status,review.SMS_REVIEW_STATUSES[1]);
 assert.equal((await restarted.withSmsReviews([{id:'sms-0',status:'sent'}]))[0].status,'sent');
 console.log('PASS legacy 254-retry SMS reviews sync as pending, preserve exact notes across refresh/reload and never resend SMS');
 queue=[{id:3,table:'sms_logs',op:'insert',tempId:'failure',payload:{id:'failure',status:review.SMS_REVIEW_STATUSES[0]},retries:254,lastAttemptAt:Date.now()}];fail=true;
 await sync.runSync();const count=writes;assert.equal(queue[0].payload.status,'pending');await sync.runSync();assert.equal(writes,count);
 queue[0].lastAttemptAt=Date.now()-6*60000;await sync.runSync();assert.equal(writes,count);fail=false;await sync.runSync({retrySchema:true});assert.equal(queue.length,0);
 queue=[{id:4,table:'sms_logs',op:'update',rowId:'updated',payload:{status:review.SMS_REVIEW_STATUSES[1]},retries:0}];assert.equal((await sync.runSync()).synced,1);
 console.log('PASS repaired payload is persisted once, CHECK failures back off 30 minutes and explicit retry recovers; updates keep row identity');
 // Metadata write failure must retain the original queued note and prevent upload.
 const bad=load('src/lib/smsReview.ts',{'./offlineDb':{...db,metaSet:async()=>{throw Error('disk full')}}});
 await assert.rejects(bad.smsCloudRow({id:'disk',status:review.SMS_REVIEW_STATUSES[0]}),/disk full/);
 const meta=new Map(),store={metaGet:k=>structuredClone(meta.get(k)),metaSet:(k,v)=>meta.set(k,structuredClone(v)),cacheGetAll:()=>[]};
 let clock=Date.now(),instances=[],releaseCleanup,attempts=0;
 class Fake extends EventEmitter{
  async initialize(){attempts++;if(attempts===1)throw Error('browser already running userDataDir');this.emit('ready')}
  async destroy(){if(releaseCleanup===undefined)await new Promise(r=>releaseCleanup=r)}
 }
 const service=createWhatsAppService({store,root:'/synthetic',allowed:()=>true,renderPdf:noop,browserPath:()=>'/synthetic/browser',clientFactory:()=>{const c=new Fake();instances.push(c);return c},now:()=>clock});
 await Promise.all([service.connect(),service.connect(),service.tick()]);await flush();assert.equal(instances.length,1);assert.equal(attempts,1);
 await service.connect();await flush();assert.equal(instances.length,1);releaseCleanup();await flush();await flush();
 clock+=61000;await Promise.all([service.connect(),service.connect()]);await flush();assert.equal(instances.length,2);assert.equal(service.status().ready,true);
 let closeDone=false,releaseStop;instances[1].destroy=()=>new Promise(r=>releaseStop=()=>{closeDone=true;r()});const stop=service.stop();await flush();assert.equal(closeDone,false);releaseStop();await stop;assert.equal(closeDone,true);assert.equal(service.status().ready,false);
 console.log('PASS concurrent reconnect cannot bypass browser cleanup; failed initialization recovers and stop awaits browser close');
 // Electron must hold quit until the browser's profile is released.
 const app=new EventEmitter();let releaseQuit,stopCalls=0,quits=0,prevented=0;
 app.getPath=()=>'/synthetic';app.setAsDefaultProtocolClient=noop;app.quit=()=>{quits++};
 const stub={tick:async()=>{},stop:()=>{stopCalls++;return new Promise(r=>releaseQuit=r)}};
 const mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pc-messaging.cjs'),'utf8'),{module:mod,process,setInterval:()=>0,clearInterval:noop,require:n=>n==='./whatsapp-service.cjs'?{createWhatsAppService:()=>stub}:n==='./festival-messaging.cjs'?{createFestivalService:()=>stub}:n==='./outreach-service.cjs'?{createOutreachService:()=>stub}:n.startsWith('./')?require(path.join(__dirname,'..',n)):require(n)});
 mod.exports.registerPcMessaging({app,store,access:{getPrincipal:()=>({role:'admin'})},ipcMain:{handle:noop}});
 const event={preventDefault:()=>{prevented++}};app.emit('before-quit',event);app.emit('before-quit',event);await flush();assert.equal(stopCalls,1);assert.equal(quits,0);releaseQuit();await flush();assert.equal(quits,1);assert.equal(prevented,2);app.emit('before-quit',event);assert.equal(prevented,2);
 console.log('PASS Electron quit waits for shutdown once and resumes without a recursive quit loop');
 let argv,options;
 assert.equal(await recoverWhatsAppBrowser({platform:'linux',run:()=>{throw Error('must not run')}}),0);
 assert.equal(await recoverWhatsAppBrowser({platform:'win32',profile:'C:\\Clinic Space\\session',executablePath:'C:\\Edge\\msedge.exe',run:(file,args,opts,cb)=>{assert.equal(file,'powershell.exe');argv=args;options=opts;cb(null,'1\r\n')}}),1);
 assert.equal(options.env.BALAJI_WA_PROFILE,'C:\\Clinic Space\\session');assert.ok(!argv.join(' ').includes('Clinic Space'));assert.ok(!argv.join(' ').includes('taskkill'));
 // On the Windows build runner, execute the real selector with mocked OS data.
 if(process.platform==='win32'){
  const script=Buffer.from(argv.at(-1),'base64').toString('utf16le');
  const fixture=`function Get-CimInstance { @(
   [pscustomobject]@{ExecutablePath='C:\\Edge\\msedge.exe';CommandLine='edge --user-data-dir="C:\\Clinic Space\\session"';ProcessId=111},
   [pscustomobject]@{ExecutablePath='C:\\Edge\\msedge.exe';CommandLine='edge --user-data-dir="C:\\Clinic Space\\session-other"';ProcessId=222},
   [pscustomobject]@{ExecutablePath='C:\\Chrome\\chrome.exe';CommandLine='chrome --user-data-dir="C:\\Clinic Space\\session"';ProcessId=333},
   [pscustomobject]@{ExecutablePath='C:\\Edge\\msedge.exe';CommandLine='edge --profile-directory=Default';ProcessId=444},
   [pscustomobject]@{ExecutablePath='C:\\Edge\\msedge.exe';CommandLine='edge "--user-data-dir=C:\\Clinic Space\\session"';ProcessId=555}
  ) }; function Stop-Process { param($Id,[switch]$Force,[switch]$PassThru,$ErrorAction) if($Id -ne 111 -and $Id -ne 555){throw 'Unrelated browser selected'} }; function Wait-Process { param($Timeout,$ErrorAction) }; `;
  const output=require('child_process').execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',fixture+script],{env:options.env,encoding:'utf8'});assert.equal(output.trim(),'2');
 }
 console.log('PASS browser recovery scopes executable and exact profile; Windows CI verifies unrelated browser profiles survive');
})().catch(e=>{console.error(e);process.exitCode=1});
