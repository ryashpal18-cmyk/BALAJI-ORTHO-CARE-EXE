'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {normId,familyNumber,familyLink}=require('./family-profile.cjs');
const {invoiceDocument}=require('./invoice-document.cjs');
const {statementForPatient,statementDocument,statementSummary}=require('./patient-statement.cjs');
function findBrowser() {
  const paths=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).flatMap(root=>[path.join(root,'Microsoft','Edge','Application','msedge.exe'),path.join(root,'Google','Chrome','Application','chrome.exe')]);
  return paths.find(file=>fs.existsSync(file));
}
function createWhatsAppService({store,root,allowed,renderPdf,clientFactory,mediaFactory,now=Date.now,timeoutMs=60000,browserPath=findBrowser}) {
  const jobsKey='whatsapp:invoice-jobs',settingsKey='whatsapp:settings';
  let client=null,ready=false,qr=null,state='disconnected',error='',busy=false,stopped=false,nextConnect=0;
  const jobs=()=>store.metaGet(jobsKey)||[];
  const save=list=>store.metaSet(jobsKey,list);
  const settings=()=>store.metaGet(settingsKey)||{auto:true,paired:false};
  if(!store.metaGet('whatsapp:started-at'))store.metaSet('whatsapp:started-at',now());
  // A process that died during dispatch cannot know whether WhatsApp accepted it.
  save(jobs().map(j=>j.state==='sending'?{...j,state:'unconfirmed',error:'App बंद होने पर परिणाम अनिश्चित था; WhatsApp में जाँचें।'}:j));
  function assertAllowed(){if(!allowed())throw Error('Administrator login required');}
  function billData(id){
    const bill=store.cacheGetAll('billing').find(b=>normId(b.id)===normId(id));
    if(!bill)throw Error('Bill अब उपलब्ध नहीं है');
    const patient=store.cacheGetAll('patients').find(p=>normId(p.id)===normId(bill.patient_id));
    if(!patient||!familyNumber(patient.mobile))throw Error('मरीज का सही mobile number चाहिए');
    if(['cancelled','canceled','void','deleted'].includes(String(bill.status).toLowerCase()))throw Error('Bill रद्द है');
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify([normId(bill.id),normId(patient.id),familyNumber(patient.mobile),patient.name,bill.service,bill.amount,bill.discount||0,bill.amount_paid||0])).digest('hex');
    return{bill,patient,fingerprint};
  }
  function enqueue(id){
    assertAllowed();const data=billData(id),list=jobs();
    const unresolved=list.find(j=>normId(j.billId)===normId(id)&&['sending','unconfirmed'].includes(j.state));
    if(unresolved)throw Error('पहले इसी bill के अनिश्चित WhatsApp परिणाम की जाँच करें');
    const same=list.find(j=>normId(j.billId)===normId(id)&&j.fingerprint===data.fingerprint&&j.state!=='cancelled');
    if(same)return same;
    // Replace an unsent revision, not the patient record or bill itself.
    const waiting=list.find(j=>normId(j.billId)===normId(id)&&['queued','failed'].includes(j.state));
    const job={id:waiting?.id||crypto.randomUUID(),billId:data.bill.id,patientName:data.patient.name,mobile:familyNumber(data.patient.mobile),fingerprint:data.fingerprint,state:'queued',createdAt:waiting?.createdAt||new Date(now()).toISOString(),attempts:0,error:''};
    save([...list.filter(j=>j.id!==job.id),job]);return job;
  }
  function statementData(id){const statement=statementForPatient(store,id,now());return {statement,patient:statement.patient,fingerprint:statement.fingerprint};}
  function previewStatement(id){assertAllowed();return statementSummary(statementData(id).statement);}
  function enqueueStatement(id,expectedFingerprint){
    assertAllowed();const data=statementData(id);
    if(!familyNumber(data.patient.mobile))throw Error('STATEMENT-003: मरीज का सही mobile number चाहिए।');
    if(!data.statement.rows.length)throw Error('STATEMENT-003: भेजने के लिए कोई सक्रिय bill उपलब्ध नहीं है।');
    if(!expectedFingerprint||expectedFingerprint!==data.fingerprint)throw Error('STATEMENT-004: हिसाब बदल गया है; फिर preview करके भेजें।');
    const list=jobs(),samePatient=j=>j.kind==='statement'&&normId(j.patientId)===normId(data.patient.id);
    if(list.some(j=>samePatient(j)&&['sending','unconfirmed'].includes(j.state)))throw Error('STATEMENT-005: पहले इस मरीज के अनिश्चित WhatsApp परिणाम की जाँच करें।');
    const same=list.find(j=>samePatient(j)&&j.fingerprint===data.fingerprint&&['sent','queued'].includes(j.state));if(same)return same;
    const waiting=list.find(j=>samePatient(j)&&['queued','failed'].includes(j.state));
    const job={id:waiting?.id||crypto.randomUUID(),kind:'statement',patientId:data.patient.id,patientName:data.patient.name,mobile:familyNumber(data.patient.mobile),fingerprint:data.fingerprint,state:'queued',createdAt:new Date(now()).toISOString(),attempts:0,error:''};
    save([...list.filter(j=>j.id!==job.id),job]);return job;
  }
  async function createStatementPdf(id,expectedFingerprint){
    assertAllowed();const data=statementData(id);
    if(expectedFingerprint&&expectedFingerprint!==data.fingerprint)throw Error('STATEMENT-004: हिसाब बदल गया है; फिर preview करें।');
    const bytes=await renderPdf(statementDocument(data.statement));assertAllowed();
    if(statementData(id).fingerprint!==data.fingerprint)throw Error('STATEMENT-004: PDF बनते समय हिसाब बदला; फिर preview करें।');
    if(!bytes||Buffer.from(bytes).subarray(0,5).toString()!=='%PDF-')throw Error('STATEMENT-006: PDF नहीं बनी।');
    const dir=path.join(root,'statement-pdfs');fs.mkdirSync(dir,{recursive:true});
    const file=path.join(dir,crypto.createHash('sha256').update(data.patient.id+data.fingerprint).digest('hex').slice(0,32)+'.pdf');
    fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file);return file;
  }
  const stillQueued=job=>jobs().some(j=>j.id===job.id&&j.state==='queued'&&j.fingerprint===job.fingerprint);
  const jobData=job=>job.kind==='statement'?statementData(job.patientId):billData(job.billId);
  function patch(id,values){const list=jobs(),job=list.find(j=>j.id===id);if(job)Object.assign(job,values);save(list);return job;}
  async function createPdf(id){
    assertAllowed();const {bill,patient,fingerprint}=billData(id);
    const qrImage=await require('qrcode').toDataURL(familyLink(patient.id),{width:256,margin:4,errorCorrectionLevel:'M'});
    const bytes=await renderPdf(invoiceDocument(bill,patient,qrImage));
    assertAllowed();
    if(!bytes||Buffer.from(bytes).subarray(0,5).toString()!=='%PDF-')throw Error('PDF नहीं बनी');
    const dir=path.join(root,'invoice-pdfs');fs.mkdirSync(dir,{recursive:true});
    const file=path.join(dir,crypto.createHash('sha256').update(normId(bill.id)+fingerprint).digest('hex').slice(0,32)+'.pdf');
    fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file);return file;
  }
  function status(){assertAllowed();return{state,ready,qr,error,auto:settings().auto!==false,paired:!!settings().paired,jobs:jobs().map(({pdfPath,...j})=>j).reverse()};}
  async function connect(){
    assertAllowed();if(client)return status();
    const executablePath=browserPath();if(!executablePath)throw Error('PC में Microsoft Edge या Google Chrome install करें।');
    stopped=false;state='connecting';error='';qr=null;
    const factory=clientFactory||((options)=>{const{Client,LocalAuth}=require('whatsapp-web.js');return new Client({authStrategy:new LocalAuth({clientId:'balaji-clinic',dataPath:path.join(root,'whatsapp-auth')}),webVersionCache:{type:'none'},puppeteer:{executablePath,headless:true,timeout:45000},...options});});
    const candidate=factory({});client=candidate;
    const on=(name,fn)=>candidate.on(name,(...args)=>{if(client===candidate)fn(...args);});
    on('qr',value=>{qr=value;state='scan';ready=false;});
    on('ready',()=>{ready=true;state='connected';qr=null;error='';store.metaSet(settingsKey,{...settings(),paired:true});void tick();});
    on('auth_failure',()=>{error='WhatsApp login नहीं हुआ; दोबारा जोड़ें।';state='error';ready=false;});
    on('disconnected',()=>{ready=false;qr=null;state='disconnected';client=null;nextConnect=now()+60000;void candidate.destroy().catch(()=>{});});
    Promise.resolve().then(()=>candidate.initialize()).catch(()=>{if(client===candidate){error='WhatsApp Web connection नहीं बना। इंटरनेट जाँचकर दोबारा जोड़ें।';state='error';ready=false;client=null;nextConnect=now()+60000;void candidate.destroy().catch(()=>{});}});
    return status();
  }
  async function disconnect(){assertAllowed();store.metaSet(settingsKey,{...settings(),paired:false});stopped=true;const old=client;client=null;ready=false;qr=null;state='disconnected';if(old){await old.logout().catch(()=>{});await old.destroy().catch(()=>{});}return status();}
  const bounded=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Request timed out')),ms);})]).finally(()=>clearTimeout(timer));};
  async function tick(){
    if(stopped||busy||!allowed())return;
    busy=true;
    try{
      if(settings().auto!==false){
        const since=store.metaGet('whatsapp:started-at');
        for(const bill of store.cacheGetAll('billing'))if(Date.parse(bill.created_at)>=since&&!jobs().some(j=>normId(j.billId)===normId(bill.id)))try{enqueue(bill.id);}catch{}
      }
      if(!client&&settings().paired&&now()>=nextConnect){nextConnect=now()+60000;await connect();}
      if(!ready||!client)return;
      const job=jobs().find(j=>j.state==='queued'&&(!j.retryAt||j.retryAt<=now()));if(!job)return;
      let handedOff=false;
      try{
        const current=jobData(job),activeClient=client;
        if(job.kind==='statement'&&job.fingerprint!==current.fingerprint)throw Error('STATEMENT-004: हिसाब बदला है; Patient Profile में फिर preview करके queue करें।');
        const pdfPath=job.kind==='statement'?await createStatementPdf(job.patientId,job.fingerprint):await createPdf(job.billId);
        if(!stillQueued(job))return;
        const fresh=jobData(job);
        if(fresh.fingerprint!==current.fingerprint)throw Error(job.kind==='statement'?'STATEMENT-004: हिसाब बदला; फिर preview करें।':'Bill बदल गया; नवीनतम PDF दोबारा बनेगी');
        const number=await bounded(activeClient.getNumberId('91'+familyNumber(fresh.patient.mobile)),30000);
        if(!stillQueued(job))return;
        if(!number) {patch(job.id,{state:'failed',error:'इस नंबर पर WhatsApp account नहीं मिला'});return;}
        assertAllowed();if(client!==activeClient||!ready)throw Error('WhatsApp connection बदल गया');
        if(jobData(job).fingerprint!==fresh.fingerprint)throw Error(job.kind==='statement'?'STATEMENT-004: हिसाब या mobile बदला; फिर preview करें।':'Bill या mobile बदला; PDF दोबारा बनेगी');
        if(!stillQueued(job))return;
        const media=mediaFactory?mediaFactory(pdfPath):require('whatsapp-web.js').MessageMedia.fromFilePath(pdfPath);
        patch(job.id,{state:'sending',pdfPath,mobile:familyNumber(fresh.patient.mobile),patientName:fresh.patient.name,fingerprint:fresh.fingerprint,attempts:(job.attempts||0)+1,error:''});
        handedOff=true;
        const sent=await bounded(activeClient.sendMessage(number._serialized,media,{sendMediaAsDocument:true,caption:`नमस्ते ${fresh.patient.name} जी, Balaji Digital X-Ray & Ortho Care Center का आपका ${job.kind==='statement'?'पूरा account statement':'bill'} PDF संलग्न है।`,waitUntilMsgSent:true}),timeoutMs);
        if(!sent?.id?._serialized)throw Error('WhatsApp acknowledgment नहीं मिला');
        patch(job.id,{state:'sent',messageId:sent.id._serialized,sentAt:new Date(now()).toISOString(),error:''});
      }catch(e){if(!handedOff&&!stillQueued(job))return;patch(job.id,{state:handedOff?'unconfirmed':job.kind==='statement'&&/STATEMENT-00[124]/.test(String(e.message))?'failed':'queued',retryAt:now()+60000,error:handedOff?'परिणाम अनिश्चित है। WhatsApp chat में जाँचें; अपने आप दोबारा नहीं भेजेंगे।':String(e.message||e)});}
    }finally{busy=false;}
  }
  function setAuto(value){assertAllowed();if(typeof value!=='boolean')throw Error('Invalid setting');store.metaSet(settingsKey,{...settings(),auto:value});return status();}
  function review(id,action){assertAllowed();const job=jobs().find(j=>j.id===id);if(!job||!['unconfirmed','failed','queued'].includes(job.state))throw Error('Job review उपलब्ध नहीं');if(!['sent','retry','cancel'].includes(action))throw Error('Invalid review');patch(id,{state:action==='retry'?'queued':action==='cancel'?'cancelled':'sent',retryAt:0,error:'',reviewedAt:new Date(now()).toISOString(),reviewAction:action});return status();}
  function stop(){stopped=true;ready=false;const old=client;client=null;if(old)void old.destroy().catch(()=>{});}
  return{connect,disconnect,status,setAuto,enqueue,createPdf,previewStatement,enqueueStatement,createStatementPdf,tick,review,stop};
}
module.exports={createWhatsAppService,findBrowser};
