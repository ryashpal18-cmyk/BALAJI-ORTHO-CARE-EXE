'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm'),{EventEmitter}=require('events');
const {createLogger}=require('../logger.cjs'),{createMessagingLog}=require('../messaging-log.cjs');
const {createWhatsAppService}=require('../whatsapp-service.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'balaji-messaging-log-'));let clock=Date.parse('2030-01-15T04:00:00Z');
const logger=createLogger({dir:path.join(dir,'logs'),now:()=>clock,consoleOutput:false,maxBytes:3000});logger.setVersion('synthetic-logging');
const events=()=>fs.readdirSync(path.join(dir,'logs')).filter(n=>n.endsWith('.jsonl')).flatMap(n=>fs.readFileSync(path.join(dir,'logs',n),'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)));
const makeStore=()=>{const meta=new Map();return{metaGet:k=>structuredClone(meta.get(k)),metaSet:(k,v)=>meta.set(k,structuredClone(v)),cacheGetAll:()=>[],patientDirectoryRows:()=>[{id:'person',name:'Synthetic Patient',mobile:'9876543210'}]};};
(async()=>{
 const report=createMessagingLog(logger,'test-worker',()=>clock),err=Error('Synthetic failure phone=9876543210 api_key=SECRET_VALUE');
 report('MSG-010','Tick',err,{jobId:'raw-job-id',campaignId:'raw-campaign-id',kind:'test',attempt:2});for(let i=0;i<20;i++)report('MSG-010','Tick',err,{jobId:'raw-job-id',campaignId:'raw-campaign-id',kind:'test'});
 assert.equal(events().length,1);clock+=61000;report('MSG-010','Tick',err,{jobId:'raw-job-id',campaignId:'raw-campaign-id',kind:'test'});assert.equal(events().at(-1).detail.suppressedRepeats,20);
 const log=events()[0];assert.equal(log.appVersion,'synthetic-logging');assert.ok(log.timestamp);assert.match(log.stack,/Synthetic failure/);assert.equal(log.detail.attempt,2);assert.equal(log.detail.jobRef.length,12);
 const text=JSON.stringify(events());for(const sensitive of ['9876543210','SECRET_VALUE','raw-job-id','raw-campaign-id'])assert.equal(text.includes(sensitive),false,sensitive);
 assert.doesNotThrow(()=>createMessagingLog({record(){throw Error('ENOSPC')}},'full-disk')('MSG-010','Tick',err));console.log('PASS real .log/.jsonl writes retain version, timestamp, stack, stage and opaque references; repeats are limited and logger failure cannot interrupt work');
 let client,mode='pdf',calls=0;const store=makeStore(),bill={id:'bill',patient_id:'person',amount:100,amount_paid:100,service:'X-ray:100',created_at:new Date(clock-1000).toISOString()};store.cacheGetAll=t=>t==='billing'?[bill]:t==='patients'?store.patientDirectoryRows():[];
 class Fake extends EventEmitter{async initialize(){}async destroy(){}async getNumberId(){if(mode==='lookup')throw Error('Synthetic lookup fault');return{_serialized:'919876543210@c.us'};}async sendMessage(){calls++;throw Error('Synthetic transport fault');}}
 const service=createWhatsAppService({store,root:dir,logger,allowed:()=>true,now:()=>clock,browserPath:()=>'/synthetic',clientFactory:()=>client=new Fake(),mediaFactory:file=>({file}),renderPdf:async()=>{if(mode==='pdf')throw Error('Synthetic renderer fault');return Buffer.from('%PDF-1.4 synthetic');}});
 try{
  const job=service.enqueue('bill');await service.connect();await new Promise(setImmediate);client.emit('ready');for(let i=0;i<200&&!events().some(e=>e.code==='WA-011');i++)await new Promise(r=>setTimeout(r,5));
  let list=events().filter(e=>e.code==='WA-011');assert.ok(list.some(e=>e.message.includes('Synthetic renderer fault')));assert.equal(service.status().jobs[0].state,'queued');assert.equal(calls,0);
  mode='lookup';clock+=61000;await service.tick();list=events().filter(e=>e.code==='WA-011');assert.ok(list.some(e=>e.message.includes('Synthetic lookup fault')));
  mode='send';clock+=61000;await service.tick();const failure=events().find(e=>e.code==='WA-011'&&e.message.includes('Synthetic transport fault'));assert.ok(failure);assert.equal(failure.detail.stage,'WhatsApp को PDF भेजना');assert.equal(failure.detail.deliveryState,'unconfirmed');assert.ok(failure.stack);assert.equal(service.status().jobs[0].state,'unconfirmed');const before=calls;await service.tick();assert.equal(calls,before);
  const result=await service.sendText('9876543210','PRIVATE_BODY',()=>true,{jobId:'text-job',campaignId:'campaign',kind:'festival'});assert.equal(result.uncertain,true);assert.ok(events().some(e=>e.code==='WA-012'&&e.detail.jobRef));
  client.emit('auth_failure','PRIVATE_CREDENTIAL');client.emit('disconnected','Synthetic connection loss');assert.ok(events().some(e=>e.code==='WA-010'));
  assert.equal(JSON.stringify(events()).includes('PRIVATE_BODY'),false);assert.equal(JSON.stringify(events()).includes('PRIVATE_CREDENTIAL'),false);
  assert.equal(service.status().jobs.find(j=>j.id===job.id).state,'unconfirmed');console.log('PASS PDF rendering, lookup, handoff, text, auth and disconnect failures reach disk with context, preserving delivery state and duplicate prevention');
 }finally{service.stop();}
 const {createFestivalService}=require('../festival-messaging.cjs'),{createOutreachService}=require('../outreach-service.cjs');
 for(const type of ['festival','outreach']){
  const sms=async()=>{throw Error('Synthetic '+type+' gateway exception');};const opts={store:makeStore(),logger,now:()=>clock,allowed:()=>true,whatsapp:{status:()=>({ready:false})},sendSMS:sms};const s=type==='festival'?createFestivalService(opts):createOutreachService(opts);s.configureSMS({apiUrl:'https://synthetic.invalid',apiKey:'PRIVATE_KEY',deviceId:'private-device'});
  if(type==='festival'){const input={festival:'diwali',title:'Synthetic',scheduledAt:new Date(clock).toISOString(),channels:['sms'],sms:'PRIVATE_BODY'};s.create({...input,fingerprint:s.preview(input).fingerprint});}
  else{const input={requestId:'synthetic-request-123',title:'Synthetic',patientIds:['person'],channels:['sms'],sms:'PRIVATE_BODY'};s.enqueueBulk({...input,fingerprint:s.previewBulk(input).fingerprint});}
  await s.tick();assert.ok(events().some(e=>e.code==='MSG-011'&&e.message.includes(type+' gateway exception')&&e.stack&&e.detail.channel==='sms'));
 }
 console.log('PASS festival and outreach SMS exceptions log the real cause/stack without logging bodies or gateway credentials');
 const timers=[];const app=new EventEmitter();app.getPath=()=>dir;app.setAsDefaultProtocolClient=()=>{};
 const registerModule={exports:{}};const serviceStub={tick:async()=>{throw Error('Synthetic worker tick fault')},stop(){}};
 const customRequire=name=>name==='./whatsapp-service.cjs'?{createWhatsAppService:()=>serviceStub}:name==='./festival-messaging.cjs'?{createFestivalService:()=>serviceStub}:name==='./outreach-service.cjs'?{createOutreachService:()=>serviceStub}:name.startsWith('./')?require(path.join(__dirname,'..',name)):require(name);
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pc-messaging.cjs'),'utf8'),{require:customRequire,module:registerModule,exports:registerModule.exports,process,setTimeout,clearTimeout,setInterval:fn=>(timers.push(fn),timers.length),clearInterval:()=>{}});
 registerModule.exports.registerPcMessaging({app,logger,store:makeStore(),access:{getPrincipal:()=>({role:'admin'})},ipcMain:{handle(){}},sendSMS:async()=>({ok:true})});
 for(const tick of timers)tick();await new Promise(setImmediate);const workers=events().filter(e=>e.code==='MSG-010'&&e.message.includes('worker tick fault'));assert.equal(workers.length,3);assert.deepEqual(workers.map(e=>e.detail.kind).sort(),['festival','outreach','whatsapp']);
 for(const e of events())assert.ok(e.timestamp&&e.appVersion);assert.ok(fs.readdirSync(path.join(dir,'logs')).some(n=>n.endsWith('.log')));console.log('PASS every periodic messaging worker logs caught failures; human-readable and structured log files both exist');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(dir,{recursive:true,force:true}));
