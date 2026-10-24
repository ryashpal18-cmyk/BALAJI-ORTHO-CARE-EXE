'use strict';
// Execute the pinned connector's real injected send function in a synthetic WA Web model.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm'),{EventEmitter}=require('events');
const {patchUtils,patchInstalledPackage}=require('../whatsapp-compat.cjs');
const {createWhatsAppService,serializedId}=require('../whatsapp-service.cjs');
const utils=fs.readFileSync(require.resolve('whatsapp-web.js/src/util/Injected/Utils.js'),'utf8');
const legacy=utils.replace(/\n    \/\/ Balaji compatibility: MsgKey serialization[\s\S]*?\n    \/\*\*/, '\n    /**').replace(/\/\/ Balaji compatibility: keep MediaData.__x_id[^\n]*\n        delete message.__x_id;\n\n/, '');
const patched=patchUtils(legacy);assert.equal(patchUtils(patched),patched);assert.throws(()=>patchUtils('unsupported source'),/anchor changed/);
function browser(source,{oldKeys=false}={}){
 class Key {constructor(data){this.$1='true_'+data.to.$1+'_'+data.id;if(oldKeys)this._serialized=this.$1;}toString(){return this.$1;}static async newId(){return 'synthetic-id';}}
 const collection=new Map();let dispatches=0;
 const modules={WAWebMsgKey:Key,WAWebChatGetters:{getIsNewsletter:()=>false,getIsBroadcast:()=>false},WALinkify:{findLink:()=>null},WAWebUserPrefsMeUser:{getMaybeMeLidUser:()=>({}),getMaybeMePnUser:()=>({})},WAWebGetEphemeralFieldsMsgActionsUtils:{getEphemeralFields:()=>({})},WAWebCollections:{Msg:{get:key=>collection.get(key)}},WAWebSendMsgChatAction:{addAndSendMsgToChat:(chat,msg)=>{
  if('__x_id' in msg)throw Error('Data passed to getter must include an id property');
  dispatches++;collection.set(msg.id.toString(),msg);return[Promise.resolve(),Promise.resolve('OK')];
 }}};
 const window={require:name=>{if(!modules[name])throw Error('Synthetic module unavailable: '+name);return modules[name];}},lib={};
 vm.runInNewContext(source,{exports:lib,window,console,Date,Uint8Array,Buffer,atob,btoa});lib.LoadUtils();
 window.WWebJS.processMediaData=async()=>({__x_id:'private-media-id',type:'document',preview:'',toJSON:()=>({__x_id:'private-media-id'})});
 const chat={id:{$1:'919876543210@c.us',isLid:()=>false,isGroup:()=>false}};
 return{Key,dispatches:()=>dispatches,send:media=>window.WWebJS.sendMessage(chat,'synthetic',{...(media?{media:{data:'synthetic'},sendMediaAsDocument:true}:{}),waitUntilMsgSent:true})};
}
(async()=>{
 const broken=browser(legacy);await assert.rejects(broken.send(true),/Data passed to getter/);assert.equal(await broken.send(false),undefined);
 const fixed=browser(patched);assert.ok(await fixed.send(true));assert.ok(await fixed.send(false));assert.equal(fixed.dispatches(),2);
 const old=browser(patched,{oldKeys:true});assert.ok(await old.send(true));assert.ok(Object.hasOwn(new old.Key({to:{$1:'chat'},id:'i'}),'_serialized'));
 console.log('PASS actual injected connector reproduces PDF private-ID failure and missing acknowledgment; both fixes work on old/new MsgKey models');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'balaji-wa-patch-'));
 try{fs.mkdirSync(path.join(temp,'src/util/Injected'),{recursive:true});fs.writeFileSync(path.join(temp,'package.json'),JSON.stringify({version:'1.34.7'}));const file=path.join(temp,'src/util/Injected/Utils.js');fs.writeFileSync(file,legacy);assert.equal(patchInstalledPackage(temp),true);assert.equal(patchInstalledPackage(temp),false);assert.equal(fs.readFileSync(file,'utf8'),patched);}finally{fs.rmSync(temp,{recursive:true,force:true});}
 assert.equal(serializedId({$1:'renamed-id'}),'renamed-id');assert.equal(serializedId({_serialized:'old-id'}),'old-id');assert.equal(serializedId({}),null);
 console.log('PASS installer patch persists, is idempotent, and acknowledgment IDs accept both connector formats');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'balaji-wa-send-')),meta=new Map();let bills=[],clock=Date.now(),client,calls=0,fail=false;
 const patient={id:'patient',name:'Synthetic Patient',mobile:'9876543210'},store={metaGet:k=>structuredClone(meta.get(k)),metaSet:(k,v)=>meta.set(k,structuredClone(v)),cacheGetAll:t=>t==='patients'?[patient]:t==='billing'?bills:[]};
 class Fake extends EventEmitter{async initialize(){}async destroy(){}async getNumberId(){return{$1:'919876543210@c.us'};}async sendMessage(to,content,options){calls++;assert.equal(to,'919876543210@c.us');assert.equal(options.sendSeen,false);if(fail)throw Error('Synthetic media injection failed');return{id:{$1:'synthetic-message-'+calls}};}}
 const service=createWhatsAppService({store,root:dir,allowed:()=>true,now:()=>clock,browserPath:()=>'/synthetic',clientFactory:()=>client=new Fake(),mediaFactory:file=>({file}),renderPdf:async()=>Buffer.from('%PDF-1.4 synthetic')});
 try{
  await service.connect();await new Promise(setImmediate);client.emit('ready');await new Promise(setImmediate);
  const text=await service.sendText(patient.mobile,'Synthetic text');assert.equal(text.ok,true);assert.equal(text.messageId,'synthetic-message-1');
  bills.push({id:'new',patient_id:patient.id,amount:100,amount_paid:100,service:'X-ray:100',created_at:new Date(clock).toISOString()});await service.tick();assert.equal(service.status().jobs[0].state,'sent');assert.equal(calls,2);await service.tick();assert.equal(calls,2);
  fail=true;clock+=1000;bills.push({...bills[0],id:'next',created_at:new Date(clock).toISOString()});await service.tick();const job=service.status().jobs.find(j=>j.billId==='next');assert.equal(job.state,'unconfirmed');assert.match(job.errorDetail,/Synthetic media injection failed/);assert.equal(job.failureStage,'WhatsApp को PDF भेजना');const sent=calls;await service.tick();assert.equal(calls,sent);
  service.stop();const reloaded=createWhatsAppService({store,root:dir,allowed:()=>true,now:()=>clock,renderPdf:async()=>Buffer.from('')});assert.equal(reloaded.status().jobs.find(j=>j.id===job.id).errorDetail,job.errorDetail);reloaded.stop();
  console.log('PASS automatic new bill PDF/text sends accept renamed IDs, bypass read-status errors, retain the actual failure reason, and never automatically resend uncertain messages');
 }finally{service.stop();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
