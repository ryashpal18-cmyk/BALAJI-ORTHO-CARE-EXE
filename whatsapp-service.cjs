'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {normId,familyNumber,familyLink}=require('./family-profile.cjs');
const {invoiceDocument,INVOICE_TEMPLATE_VERSION}=require('./invoice-document.cjs');
const {statementForPatient,statementDocument,statementSummary}=require('./patient-statement.cjs');
const monthly=require('./monthly-report.cjs');
const {createMessagingLog}=require('./messaging-log.cjs');
function serializedId(value){
  const id=typeof value==='string'?value:value?._serialized||value?.$1;
  return typeof id==='string'&&id.trim()?id:null;
}
function errorDetail(error){return String(error?.message||error||'Unknown WhatsApp error').replace(/data:[^\s]+/g,'[file data]').slice(0,600);}
function findBrowsers(env=process.env,exists=fs.existsSync) {
  const roots=[env.PROGRAMW6432,env.PROGRAMFILES,env['PROGRAMFILES(X86)'],env.LOCALAPPDATA].filter(Boolean);
  const candidates=roots.flatMap(root=>[
    path.join(root,'Microsoft','Edge','Application','msedge.exe'),
    path.join(root,'Google','Chrome','Application','chrome.exe'),
  ]);
  const seen=new Set();
  return candidates.filter(file=>{const key=path.resolve(file).toLowerCase();if(seen.has(key)||!exists(file))return false;seen.add(key);return true;});
}
function findBrowser(){return findBrowsers()[0];}
function writableDirectory(dir,fsImpl=fs){
  const token=`.balaji-write-${process.pid}-${crypto.randomBytes(6).toString('hex')}`,first=path.join(dir,token),second=first+'.ok';
  try{fsImpl.mkdirSync(dir,{recursive:true});fsImpl.writeFileSync(first,'ok');fsImpl.renameSync(first,second);fsImpl.unlinkSync(second);return true;}
  catch{try{if(fsImpl.existsSync(first))fsImpl.unlinkSync(first);}catch{}try{if(fsImpl.existsSync(second))fsImpl.unlinkSync(second);}catch{}return false;}
}
function resolveAuthRoot(root,{localAppData=process.env.LOCALAPPDATA,fsImpl=fs}={}){
  const legacy=path.join(root,'whatsapp-auth');
  const preferred=localAppData?path.join(localAppData,'Balaji Ortho Care Connect','whatsapp-auth'):legacy;
  const hasLegacySession=fsImpl.existsSync(path.join(legacy,'session-balaji-clinic'));
  const candidates=hasLegacySession?[legacy,preferred]:[preferred,legacy];
  for(const candidate of [...new Set(candidates)])if(writableDirectory(candidate,fsImpl))return candidate;
  throw Error('WhatsApp session folder writable नहीं है। Windows Security में Local AppData access allow करें।');
}
function createWhatsAppService({store,root,authRoot,allowed,renderPdf,clientFactory,mediaFactory,now=Date.now,timeoutMs=60000,initializeTimeoutMs=90000,browserPath=findBrowsers,logger,recoverBrowser=require('./whatsapp-browser.cjs').recoverWhatsAppBrowser}) {
  const jobsKey='whatsapp:invoice-jobs',settingsKey='whatsapp:settings';
  const report=createMessagingLog(logger,'whatsapp',now);
  let client=null,ready=false,qr=null,state='disconnected',error='',busy=false,stopped=false,nextConnect=0,connectRequested=false;
  let cleanup=Promise.resolve(),starting=null,connectionFailures=0,selectedBrowser='',connectionStage='idle',browserErrors=[];
  const authDataPath=authRoot||(clientFactory?path.join(root,'whatsapp-auth'):resolveAuthRoot(root));
  const profile=path.join(authDataPath,'session-balaji-clinic');
  function dispose(candidate){
    cleanup=cleanup.catch(()=>{}).then(async()=>{
      try{await bounded(Promise.resolve().then(()=>candidate.destroy()),2000);}catch{}
    });
    return cleanup;
  }
  const jobs=()=>store.metaGet(jobsKey)||[];
  const save=list=>store.metaSet(jobsKey,list);
  const settings=()=>store.metaGet(settingsKey)||{auto:true,paired:false};
  if(!store.metaGet('whatsapp:started-at'))store.metaSet('whatsapp:started-at',now());
  // A process that died during dispatch cannot know whether WhatsApp accepted it.
  save(jobs().map(j=>j.state==='sending'?{...j,state:'unconfirmed',error:'App बंद होने पर परिणाम अनिश्चित था; WhatsApp में जाँचें।'}:j));
  function assertAllowed(){if(!allowed())throw Error('Administrator login required');}
  const cachedRow=(table,id)=>store.cacheGetRow?store.cacheGetRow(table,id):store.cacheGetAll(table).find(row=>normId(row.id)===normId(id));
  function billData(id){
    const bill=cachedRow('billing',id);
    if(!bill)throw Error('Bill अब उपलब्ध नहीं है');
    const patient=cachedRow('patients',bill.patient_id);
    if(!patient)throw Error('मरीज उपलब्ध नहीं है');
    if(['cancelled','canceled','void','deleted'].includes(String(bill.status).toLowerCase()))throw Error('Bill रद्द है');
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify([normId(bill.id),normId(patient.id),familyNumber(patient.mobile),patient.name,bill.service,bill.amount,bill.discount||0,bill.amount_paid||0])).digest('hex');
    return{bill,patient,fingerprint};
  }
  function assertMessageAllowed(patient){const current=cachedRow('patients',patient.id)||patient;if(current.workflow_data?.whatsapp===false)throw Error('इस मरीज के लिए WhatsApp बंद है');if(!familyNumber(current.mobile))throw Error('मरीज का सही mobile number चाहिए');}
  function enqueue(id){
    assertAllowed();const data=billData(id),list=jobs();assertMessageAllowed(data.patient);
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
    if(!familyNumber(data.patient.mobile))throw Error('STATEMENT-003: मरीज का सही mobile number चाहिए।');assertMessageAllowed(data.patient);
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
  const jobData=job=>{const data=job.kind==='monthly'?(assertMonthlyJob(job),monthlyData(job.month)):job.kind==='statement'?statementData(job.patientId):billData(job.billId);if(job.kind!=='monthly')assertMessageAllowed(data.patient);return data;};
  function patch(id,values){const list=jobs(),job=list.find(j=>j.id===id);if(job)Object.assign(job,values);save(list);return job;}
  async function createPdf(id){
    assertAllowed();const {bill,patient,fingerprint}=billData(id);
    const qrImage=await require('qrcode').toDataURL(familyLink(patient.id),{width:256,margin:4,errorCorrectionLevel:'M'});
    const bytes=await renderPdf(invoiceDocument(bill,patient,qrImage));
    assertAllowed();
    if(!bytes||Buffer.from(bytes).subarray(0,5).toString()!=='%PDF-')throw Error('PDF नहीं बनी');
    const dir=path.join(root,'invoice-pdfs');fs.mkdirSync(dir,{recursive:true});
    const file=path.join(dir,crypto.createHash('sha256').update(INVOICE_TEMPLATE_VERSION+normId(bill.id)+fingerprint).digest('hex').slice(0,32)+'.pdf');
    fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file);return file;
  }
  function status(limit){assertAllowed();const stored=jobs(),count=Number.isInteger(limit)?Math.max(0,limit):stored.length;const recent=count>=stored.length?stored:stored.slice(Math.max(0,stored.length-count));return{state,ready,qr,error,auto:settings().auto!==false,paired:!!settings().paired,browser:selectedBrowser?path.basename(selectedBrowser):'',connectionStage,browserErrors:[...browserErrors],jobs:recent.map(({pdfPath,...j})=>j).reverse()};}
  const canSendText=()=>!!(ready&&client&&!busy&&!stopped);
  async function connect(){
    assertAllowed();connectRequested=true;if(client||starting)return status();
    const discovered=browserPath(),executables=[...new Set((Array.isArray(discovered)?discovered:[discovered]).filter(Boolean))];
    if(!executables.length)throw Error('PC में Microsoft Edge या Google Chrome install करें।');
    stopped=false;state='connecting';error='';qr=null;browserErrors=[];connectionStage='cleanup';
    const factory=(executablePath)=>clientFactory?clientFactory({executablePath,authDataPath}):(()=>{const{Client,LocalAuth}=require('whatsapp-web.js');return new Client({authStrategy:new LocalAuth({clientId:'balaji-clinic',dataPath:authDataPath}),webVersionCache:{type:'none'},puppeteer:{executablePath,headless:true,timeout:45000}});})();
    // Reserve the whole fallback sequence so repeated clicks/timers cannot
    // launch two browsers against one LocalAuth profile.
    starting=Promise.resolve().then(async()=>{
      await cleanup;
      for(const executablePath of executables){
        if(stopped||!allowed())return;
        selectedBrowser=executablePath;connectionStage='browser-cleanup';
        if(!clientFactory)for(const staleExecutable of executables)try{await recoverBrowser({profile,executablePath:staleExecutable});}catch(e){report('WA-010','WhatsApp cleanup unavailable; trying browser launch',e,{level:'warn',browser:path.basename(staleExecutable)});}
        if(stopped||!allowed())return;
        const candidate=factory(executablePath);client=candidate;let authenticationFailed=false;
        const on=(name,fn)=>candidate.on(name,(...args)=>{if(client===candidate)fn(...args);});
        on('qr',value=>{qr=value;state='scan';ready=false;connectionStage='qr';});
        on('ready',()=>{connectionFailures=0;ready=true;state='connected';qr=null;error='';browserErrors=[];connectionStage='ready';store.metaSet(settingsKey,{...settings(),paired:true});void tick().catch(e=>report('WA-013','WhatsApp ready worker',e));});
        on('auth_failure',()=>{authenticationFailed=true;connectRequested=false;report('WA-010','WhatsApp login',Error('Linked-device authentication failed'));error='WhatsApp login नहीं हुआ; Disconnect करके दोबारा जोड़ें।';state='error';ready=false;connectionStage='authentication';if(client===candidate)client=null;void dispose(candidate);});
        on('disconnected',reason=>{report('WA-010','WhatsApp disconnected',reason||'Connection closed',{level:'warn'});ready=false;qr=null;state='disconnected';connectionStage='disconnected';if(client===candidate)client=null;nextConnect=now()+60000;void dispose(candidate);});
        try{
          connectionStage='initialize';
          await bounded(Promise.resolve().then(()=>candidate.initialize()),initializeTimeoutMs);
          if(authenticationFailed)return;
          if(client===candidate&&state==='connecting')connectionStage='waiting-for-whatsapp';
          return;
        }catch(e){
          if(authenticationFailed)return;
          if(client===candidate)client=null;
          ready=false;qr=null;
          const detail=errorDetail(e);browserErrors.push({browser:path.basename(executablePath),error:detail});
          report('WA-010','WhatsApp initialize',e,{browser:path.basename(executablePath)});
          await dispose(candidate);
        }
      }
      connectionFailures++;
      error=browserErrors.some(x=>/already running|userDataDir/i.test(x.error))?'WhatsApp browser session व्यस्त है। Balaji बंद करके PC restart करें; session delete न करें।':'Edge और Chrome दोनों से WhatsApp connection नहीं बना। कारण नीचे देखें।';
      state='error';connectionStage='failed';nextConnect=now()+Math.min(60000*2**Math.min(connectionFailures-1,4),900000);
    }).catch(e=>{report('WA-010','WhatsApp browser recovery',e);state='error';connectionStage='failed';error='WhatsApp browser शुरू नहीं हुआ: '+errorDetail(e);nextConnect=now()+300000;}).finally(()=>{starting=null;});
    return status();
  }
  async function disconnect(){assertAllowed();connectRequested=false;store.metaSet(settingsKey,{...settings(),paired:false});stopped=true;const old=client;client=null;ready=false;qr=null;state='disconnected';connectionStage='idle';browserErrors=[];if(old){try{await bounded(Promise.resolve().then(()=>old.logout()),2000);}catch{}await dispose(old);}return status();}
  const bounded=(promise,ms)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Request timed out')),ms);})]).finally(()=>clearTimeout(timer));};
  async function tick(){
    if(stopped||busy||!allowed())return;
    busy=true;
    try{
      try{scheduleMonthly();}catch(e){report('WA-013','Monthly report scheduling',e,{kind:'monthly'});error=String(e.message||e);}
      if(settings().auto!==false){
        const since=store.metaGet('whatsapp:started-at');
        const knownBills=new Set(jobs().map(j=>normId(j.billId)).filter(Boolean));
        for(const bill of store.cacheGetAll('billing')){
          const id=normId(bill.id),createdAt=Date.parse(bill.created_at);
          if(!Number.isFinite(createdAt)||createdAt<since||knownBills.has(id))continue;
          try{enqueue(bill.id);knownBills.add(id);}catch(e){report('WA-013','Automatic bill queue',e,{jobId:bill.id,kind:'bill',level:'warn'});}
        }
      }
      if(!client&&!starting&&(settings().paired||connectRequested)&&now()>=nextConnect){nextConnect=now()+60000;await connect();}
      if(!ready||!client)return;
      const job=jobs().find(j=>j.state==='queued'&&(!j.retryAt||j.retryAt<=now()));if(!job)return;
      let handedOff=false,failureStage='PDF बनाना';
      try{
        const current=jobData(job),activeClient=client;
        if((job.kind==='statement'||job.kind==='monthly'&&!job.automatic)&&job.fingerprint!==current.fingerprint)throw Error(job.kind==='monthly'?'MONTHLY-004: हिसाब बदला है; फिर preview करके queue करें।':'STATEMENT-004: हिसाब बदला है; Patient Profile में फिर preview करके queue करें।');
        const pdfPath=job.kind==='monthly'?await createMonthlyPdf(job.month,current.fingerprint):job.kind==='statement'?await createStatementPdf(job.patientId,job.fingerprint):await createPdf(job.billId);
        if(!stillQueued(job))return;
        const fresh=jobData(job);
        if(fresh.fingerprint!==current.fingerprint)throw Error(job.kind==='statement'?'STATEMENT-004: हिसाब बदला; फिर preview करें।':job.kind==='monthly'&&!job.automatic?'MONTHLY-004: हिसाब बदला; फिर preview करें।':'Bill बदल गया; नवीनतम PDF दोबारा बनेगी');
        failureStage='WhatsApp नंबर जाँचना';
        const number=await bounded(activeClient.getNumberId('91'+familyNumber(fresh.patient.mobile)),30000);
        if(!stillQueued(job))return;
        if(!number) {report('WA-011',failureStage,Error('Recipient WhatsApp account not found'),{jobId:job.id,kind:job.kind||'bill',channel:'whatsapp',deliveryState:'failed',level:'warn'});patch(job.id,{state:'failed',error:'इस नंबर पर WhatsApp account नहीं मिला'});return;}
        const chatId=serializedId(number);if(!chatId)throw Error('WhatsApp chat ID नहीं मिली; connector compatibility जाँचें');
        assertAllowed();if(client!==activeClient||!ready)throw Error('WhatsApp connection बदल गया');
        if(job.kind==='monthly')assertMonthlyJob(job);
        if(jobData(job).fingerprint!==fresh.fingerprint)throw Error(job.kind==='statement'?'STATEMENT-004: हिसाब या mobile बदला; फिर preview करें।':job.kind==='monthly'&&!job.automatic?'MONTHLY-004: हिसाब बदला; फिर preview करें।':'Bill या mobile बदला; PDF दोबारा बनेगी');
        if(!stillQueued(job))return;
        const media=mediaFactory?mediaFactory(pdfPath):require('whatsapp-web.js').MessageMedia.fromFilePath(pdfPath);
        patch(job.id,{state:'sending',pdfPath,mobile:familyNumber(fresh.patient.mobile),patientName:fresh.patient.name,fingerprint:fresh.fingerprint,attempts:(job.attempts||0)+1,error:''});
        failureStage='WhatsApp को PDF भेजना';
        handedOff=true;
        const sent=await bounded(activeClient.sendMessage(chatId,media,{sendSeen:false,sendMediaAsDocument:true,caption:job.kind==='monthly'||job.kind==='statement'?`नमस्ते ${fresh.patient.name} जी, Balaji Digital X-Ray & Ortho Care Center का आपका ${job.kind==='monthly'?'मासिक हिसाब '+job.month:'पूरा account statement'} PDF संलग्न है।`:[
          `नमस्कार ${String(fresh.patient.name||'मरीज').replace(/[\r\n]+/g,' ').trim()||'मरीज'} जी,`,
          'BALAJI DIGITAL X-RAY & ORTHO CARE CENTER में आपका हार्दिक स्वागत है।',
          '', 'अपनी सेहत की देखभाल के लिए हम पर भरोसा करने का धन्यवाद। आपके बिल का विवरण साथ दी गई PDF में है।',
          '', 'हम आपके शीघ्र स्वस्थ होने की कामना करते हैं।',
          '', 'डॉ. एस. एस. राठौड़', 'संपर्क: 80057 07783',
        ].join('\n'),waitUntilMsgSent:true}),timeoutMs);
        const messageId=serializedId(sent?.id);
        if(!messageId)throw Error('WhatsApp acknowledgment नहीं मिला');
        patch(job.id,{state:'sent',messageId,sentAt:new Date(now()).toISOString(),error:'',errorDetail:'',failureStage:''});
      }catch(e){
        if(!handedOff&&!stillQueued(job))return;
        const reason=String(e?.message||e);
        const terminal=job.kind==='statement'&&/STATEMENT-00[124]/.test(reason)||job.kind==='monthly'&&(/STATEMENT-002|MONTHLY-00[12]/.test(reason)||!job.automatic&&/STATEMENT-001|MONTHLY-004/.test(reason));
        const deliveryState=handedOff?'unconfirmed':terminal?'failed':'queued';
        report('WA-011',failureStage,e,{jobId:job.id,kind:job.kind||'bill',channel:'whatsapp',attempt:(job.attempts||0)+1,deliveryState});
        patch(job.id,{state:deliveryState,retryAt:now()+60000,errorDetail:errorDetail(e),failureStage,failedAt:new Date(now()).toISOString(),error:handedOff?'परिणाम अनिश्चित है। WhatsApp chat में जाँचें; अपने आप दोबारा नहीं भेजेंगे।':reason});
      }
    }finally{busy=false;}
  }
  // Plain text campaigns share the paired client, but have a separate durable journal.
  async function sendText(mobile,text,validate=()=>true,logContext={}){
    assertAllowed();const normalized=familyNumber(mobile);
    if(!normalized||typeof text!=='string'||!text.trim()||text.length>1500)return{ok:false,permanent:true,error:'सही नंबर और संदेश चाहिए।'};
    if(!ready||!client||busy)return{ok:false,error:'WhatsApp कनेक्शन/पिछले संदेश की प्रतीक्षा में'};
    busy=true;let handedOff=false,failureStage='WhatsApp text number lookup';
    try{
      const activeClient=client,number=await bounded(activeClient.getNumberId('91'+normalized),30000);
      if(!number){report('WA-012',failureStage,Error('Recipient WhatsApp account not found'),{...logContext,channel:'whatsapp',deliveryState:'failed',level:'warn'});return{ok:false,permanent:true,error:'इस नंबर पर WhatsApp नहीं है।'};}
      const chatId=serializedId(number);if(!chatId){report('WA-012',failureStage,Error('WhatsApp chat ID missing'),{...logContext,channel:'whatsapp',deliveryState:'queued'});return{ok:false,error:'WhatsApp chat ID नहीं मिली; connector compatibility जाँचें।'};}
      assertAllowed();if(client!==activeClient||!ready)return{ok:false,error:'WhatsApp connection बदल गया।'};
      const check=validate();if(check!==true)return{ok:false,cancelled:check==='cancelled',error:'प्राप्तकर्ता या अभियान बदला है; संदेश रोका गया।'};
      failureStage='WhatsApp text send';
      handedOff=true;
      const sent=await bounded(activeClient.sendMessage(chatId,text,{sendSeen:false,waitUntilMsgSent:true}),timeoutMs);
      const messageId=serializedId(sent?.id);if(!messageId)throw Error('WhatsApp acknowledgment missing');
      return{ok:true,messageId};
    }catch(e){report('WA-012',failureStage,e,{...logContext,channel:'whatsapp',deliveryState:handedOff?'unconfirmed':'queued'});return{ok:false,uncertain:handedOff,error:(handedOff?'परिणाम अनिश्चित है; WhatsApp चैट में जाँचें।':'WhatsApp connection की प्रतीक्षा में')+' कारण: '+errorDetail(e)};}
    finally{busy=false;}
  }
  function setAuto(value){assertAllowed();if(typeof value!=='boolean')throw Error('Invalid setting');store.metaSet(settingsKey,{...settings(),auto:value});return status();}
  function review(id,action){assertAllowed();const job=jobs().find(j=>j.id===id);if(!job||!['unconfirmed','failed','queued'].includes(job.state))throw Error('Job review उपलब्ध नहीं');if(!['sent','retry','cancel'].includes(action))throw Error('Invalid review');patch(id,{state:action==='retry'?'queued':action==='cancel'?'cancelled':'sent',retryAt:0,error:'',errorDetail:'',failureStage:'',reviewedAt:new Date(now()).toISOString(),reviewAction:action});return status();}
  async function stop(){stopped=true;connectRequested=false;ready=false;qr=null;state='disconnected';connectionStage='idle';const old=client;client=null;if(old)await dispose(old);if(!clientFactory){const discovered=browserPath(),executables=[...new Set((Array.isArray(discovered)?discovered:[discovered]).filter(Boolean))];for(const executablePath of executables)try{await recoverBrowser({profile,executablePath});}catch(e){report('WA-010','WhatsApp browser shutdown',e,{browser:path.basename(executablePath)});}}}
  return{sendText,canSendText,connect,disconnect,status,setAuto,enqueue,createPdf,previewStatement,enqueueStatement,createStatementPdf,getMonthlySettings,saveMonthlySettings,previewMonthly,enqueueMonthly,createMonthlyPdf,tick,review,stop};
}
module.exports={createWhatsAppService,findBrowser,findBrowsers,resolveAuthRoot,serializedId};
