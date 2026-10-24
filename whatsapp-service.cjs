'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {normId,familyNumber,familyLink}=require('./family-profile.cjs');
const {invoiceDocument}=require('./invoice-document.cjs');
const {statementForPatient,statementDocument,statementSummary}=require('./patient-statement.cjs');
const monthly=require('./monthly-report.cjs');
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
  const monthlyKey='monthly-account:settings';
  function monthlySettings(){const s=store.metaGet(monthlyKey);return {mobile:s?.mobile||'',enabled:s?.enabled===true,startMonth:s?.startMonth||null,configId:s?.configId||null};}
  function getMonthlySettings(){assertAllowed();return monthlySettings();}
  function saveMonthlySettings(input){
    assertAllowed();if(typeof input?.enabled!=='boolean')throw Error('MONTHLY-003: Invalid automatic setting');
    const mobile=familyNumber(input.mobile);if((input.mobile||input.enabled)&&!mobile)throw Error('MONTHLY-003: सही WhatsApp नंबर भरें।');
    const old=monthlySettings();if(old.mobile===(mobile||'')&&old.enabled===input.enabled)return old;
    const next={mobile:mobile||'',enabled:input.enabled,startMonth:monthly.monthKey(now()),configId:crypto.randomUUID()};
    store.metaSet(monthlyKey,next);
    save(jobs().map(j=>j.kind==='monthly'&&['queued','failed'].includes(j.state)?{...j,state:'cancelled',error:'Monthly report setting/recipient changed; new selection required'}:j));
    return next;
  }
  function monthlyData(month){const report=monthly.monthlyForStore(store,month,now());return {report,patient:{name:'मासिक clinic हिसाब '+month,mobile:monthlySettings().mobile},fingerprint:report.fingerprint};}
  function previewMonthly(month){assertAllowed();const data=monthlyData(month),config=monthlySettings();return {...monthly.monthlySummary(data.report),mobile:config.mobile,configId:config.configId};}
  function enqueueMonthly(month,fingerprint,configId,automatic=false){
    assertAllowed();monthly.validMonth(month);const cfg=monthlySettings();
    if(!familyNumber(cfg.mobile)||!cfg.configId)throw Error('MONTHLY-003: पहले report प्राप्तकर्ता का WhatsApp नंबर save करें।');
    if(cfg.configId!==configId)throw Error('MONTHLY-004: Recipient/settings बदली हैं; फिर preview करें।');
    if(automatic&&!cfg.enabled)throw Error('MONTHLY-004: Automatic report बंद है।');
    const sameMonth=j=>j.kind==='monthly'&&j.month===month&&j.configId===configId;
    const list=jobs();if(list.some(j=>sameMonth(j)&&['sending','unconfirmed'].includes(j.state)))throw Error('MONTHLY-005: पहले इसी महीने के अनिश्चित परिणाम की जाँच करें।');
    let report;
    if(!automatic){report=monthlyData(month).report;if(!fingerprint||report.fingerprint!==fingerprint)throw Error('MONTHLY-004: हिसाब बदला; फिर preview करें।');}
    const identity=automatic?'auto:'+month+':'+configId:fingerprint;
    const prior=list.find(j=>sameMonth(j)&&['queued','sent'].includes(j.state)&&(automatic&&j.automatic||!automatic&&j.fingerprint===identity));if(prior)return prior;
    const waiting=list.find(j=>sameMonth(j)&&['queued','failed'].includes(j.state));
    const job={id:waiting?.id||crypto.randomUUID(),kind:'monthly',month,automatic,partial:report?.partial||false,configId,mobile:cfg.mobile,patientName:'मासिक हिसाब '+month,fingerprint:identity,state:'queued',createdAt:new Date(now()).toISOString(),attempts:0,error:''};
    save([...list.filter(j=>j.id!==job.id),job]);return job;
  }
  function scheduleMonthly(){const cfg=monthlySettings();if(!cfg.enabled||!cfg.configId||!cfg.startMonth||!familyNumber(cfg.mobile))return;
    let created=0;for(const month of monthly.readyMonths(cfg.startMonth,now(),1200)){
      const exists=jobs().some(j=>j.kind==='monthly'&&j.month===month&&j.configId===cfg.configId&&(j.automatic||['sending','unconfirmed'].includes(j.state)||!j.partial&&['sent','queued'].includes(j.state)));
      if(!exists){enqueueMonthly(month,null,cfg.configId,true);if(++created>=12)break;}
    }
  }
  function assertMonthlyJob(job){const cfg=monthlySettings();if(cfg.configId!==job.configId||cfg.mobile!==job.mobile||job.automatic&&!cfg.enabled)throw Error('MONTHLY-004: Monthly recipient/settings changed');}
  async function createMonthlyPdf(month,expectedFingerprint){
    assertAllowed();const data=monthlyData(month);
    if(expectedFingerprint&&data.fingerprint!==expectedFingerprint)throw Error('MONTHLY-004: हिसाब बदला; फिर preview करें।');
    const bytes=await renderPdf(monthly.monthlyDocument(data.report));assertAllowed();
    if(monthlyData(month).fingerprint!==data.fingerprint)throw Error('MONTHLY-004: PDF बनते समय हिसाब बदला; फिर कोशिश करें।');
    if(!bytes||Buffer.from(bytes).subarray(0,5).toString()!=='%PDF-')throw Error('MONTHLY-006: PDF नहीं बनी।');
    const dir=path.join(root,'monthly-pdfs');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,month+'-'+data.fingerprint.slice(0,24)+'.pdf');
    fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file);return file;
  }
  const stillQueued=job=>jobs().some(j=>j.id===job.id&&j.state==='queued'&&j.fingerprint===job.fingerprint);
  const jobData=job=>job.kind==='monthly'?(assertMonthlyJob(job),monthlyData(job.month)):job.kind==='statement'?statementData(job.patientId):billData(job.billId);
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
      try{scheduleMonthly();}catch(e){error=String(e.message||e);}
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
        if((job.kind==='statement'||job.kind==='monthly'&&!job.automatic)&&job.fingerprint!==current.fingerprint)throw Error('STATEMENT-004: हिसाब बदला है; Patient Profile में फिर preview करके queue करें।');
        const pdfPath=job.kind==='monthly'?await createMonthlyPdf(job.month,current.fingerprint):job.kind==='statement'?await createStatementPdf(job.patientId,job.fingerprint):await createPdf(job.billId);
        if(!stillQueued(job))return;
        const fresh=jobData(job);
        if(fresh.fingerprint!==current.fingerprint)throw Error(job.kind==='statement'?'STATEMENT-004: हिसाब बदला; फिर preview करें।':'Bill बदल गया; नवीनतम PDF दोबारा बनेगी');
        const number=await bounded(activeClient.getNumberId('91'+familyNumber(fresh.patient.mobile)),30000);
        if(!stillQueued(job))return;
        if(!number) {patch(job.id,{state:'failed',error:'इस नंबर पर WhatsApp account नहीं मिला'});return;}
        assertAllowed();if(client!==activeClient||!ready)throw Error('WhatsApp connection बदल गया');
        if(job.kind==='monthly')assertMonthlyJob(job);
        if(jobData(job).fingerprint!==fresh.fingerprint)throw Error(job.kind==='statement'?'STATEMENT-004: हिसाब या mobile बदला; फिर preview करें।':'Bill या mobile बदला; PDF दोबारा बनेगी');
        if(!stillQueued(job))return;
        const media=mediaFactory?mediaFactory(pdfPath):require('whatsapp-web.js').MessageMedia.fromFilePath(pdfPath);
        patch(job.id,{state:'sending',pdfPath,mobile:familyNumber(fresh.patient.mobile),patientName:fresh.patient.name,fingerprint:fresh.fingerprint,attempts:(job.attempts||0)+1,error:''});
        handedOff=true;
        const sent=await bounded(activeClient.sendMessage(number._serialized,media,{sendMediaAsDocument:true,caption:`नमस्ते ${fresh.patient.name} जी, Balaji Digital X-Ray & Ortho Care Center का आपका ${job.kind==='monthly'?'मासिक हिसाब '+job.month:job.kind==='statement'?'पूरा account statement':'bill'} PDF संलग्न है।`,waitUntilMsgSent:true}),timeoutMs);
        if(!sent?.id?._serialized)throw Error('WhatsApp acknowledgment नहीं मिला');
        patch(job.id,{state:'sent',messageId:sent.id._serialized,sentAt:new Date(now()).toISOString(),error:''});
      }catch(e){if(!handedOff&&!stillQueued(job))return;patch(job.id,{state:handedOff?'unconfirmed':(job.kind==='statement'&&/STATEMENT-00[124]/.test(String(e.message))||job.kind==='monthly'&&(/STATEMENT-002|MONTHLY-00[12]/.test(String(e.message))||!job.automatic&&/STATEMENT-001|MONTHLY-004/.test(String(e.message))))?'failed':'queued',retryAt:now()+60000,error:handedOff?'परिणाम अनिश्चित है। WhatsApp chat में जाँचें; अपने आप दोबारा नहीं भेजेंगे।':String(e.message||e)});}
    }finally{busy=false;}
  }
  // Plain text campaigns share the paired client, but have a separate durable journal.
  async function sendText(mobile,text,validate=()=>true){
    assertAllowed();const normalized=familyNumber(mobile);
    if(!normalized||typeof text!=='string'||!text.trim()||text.length>1500)return{ok:false,permanent:true,error:'सही नंबर और संदेश चाहिए।'};
    if(!ready||!client||busy)return{ok:false,error:'WhatsApp कनेक्शन/पिछले संदेश की प्रतीक्षा में'};
    busy=true;let handedOff=false;
    try{
      const activeClient=client,number=await bounded(activeClient.getNumberId('91'+normalized),30000);
      if(!number)return{ok:false,permanent:true,error:'इस नंबर पर WhatsApp नहीं है।'};
      assertAllowed();if(client!==activeClient||!ready)return{ok:false,error:'WhatsApp connection बदल गया।'};
      const check=validate();if(check!==true)return{ok:false,cancelled:check==='cancelled',error:'प्राप्तकर्ता या अभियान बदला है; संदेश रोका गया।'};
      handedOff=true;
      const sent=await bounded(activeClient.sendMessage(number._serialized,text,{waitUntilMsgSent:true}),timeoutMs);
      if(!sent?.id?._serialized)throw Error('Acknowledgment missing');
      return{ok:true,messageId:sent.id._serialized};
    }catch{return{ok:false,uncertain:handedOff,error:handedOff?'परिणाम अनिश्चित है; WhatsApp चैट में जाँचें।':'WhatsApp connection की प्रतीक्षा में'};}
    finally{busy=false;}
  }
  function setAuto(value){assertAllowed();if(typeof value!=='boolean')throw Error('Invalid setting');store.metaSet(settingsKey,{...settings(),auto:value});return status();}
  function review(id,action){assertAllowed();const job=jobs().find(j=>j.id===id);if(!job||!['unconfirmed','failed','queued'].includes(job.state))throw Error('Job review उपलब्ध नहीं');if(!['sent','retry','cancel'].includes(action))throw Error('Invalid review');patch(id,{state:action==='retry'?'queued':action==='cancel'?'cancelled':'sent',retryAt:0,error:'',reviewedAt:new Date(now()).toISOString(),reviewAction:action});return status();}
  function stop(){stopped=true;ready=false;const old=client;client=null;if(old)void old.destroy().catch(()=>{});}
  return{sendText,connect,disconnect,status,setAuto,enqueue,createPdf,previewStatement,enqueueStatement,createStatementPdf,getMonthlySettings,saveMonthlySettings,previewMonthly,enqueueMonthly,createMonthlyPdf,tick,review,stop};
}
module.exports={createWhatsAppService,findBrowser};
