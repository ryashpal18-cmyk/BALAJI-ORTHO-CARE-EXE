'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {redactText,sanitize,classify,describe,reference}=require('./diagnostic-utils.cjs');
const MAX_LOG_BYTES=8*1024*1024;
function tail(file,limit){const st=fs.statSync(file);const n=Math.min(st.size,limit);const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(n);fs.readSync(fd,b,0,n,st.size-n);let text=b.toString('utf8');if(st.size>n)text=text.slice(text.indexOf('\n')+1);return {text,bytes:n,truncated:st.size>n};}finally{fs.closeSync(fd);}}
function readEvents(dir,{days=7,maxBytes=MAX_LOG_BYTES}={}){
  const events=[];let truncated=false,invalid=0,bytes=0,filesRead=0,legacy=false;
  if(!fs.existsSync(dir))return {events,truncated,invalid,bytes,filesRead,legacy};
  const files=fs.readdirSync(dir).filter(f=>/^app-\d{4}-\d{2}-\d{2}(?:-part\d+)?\.(jsonl|log)$/.test(f)).map(f=>({name:f,file:path.join(dir,f),stat:fs.statSync(path.join(dir,f))})).filter(f=>f.stat.mtimeMs>=Date.now()-days*86400000).sort((a,b)=>b.stat.mtimeMs-a.stat.mtimeMs||b.name.localeCompare(a.name,undefined,{numeric:true}));
  const structuredDays=new Set(files.filter(f=>f.name.endsWith('.jsonl')).map(f=>f.name.slice(0,14)));
  const chosen=files;
  for(const f of chosen){if(bytes>=maxBytes||filesRead>=50){truncated=true;break;}const r=tail(f.file,Math.min(2*1024*1024,maxBytes-bytes));bytes+=r.bytes;filesRead++;truncated ||= r.truncated;
    if(f.name.endsWith('.jsonl')){for(const line of r.text.split('\n'))if(line.trim()){try{const e=JSON.parse(line);if(typeof e.message!=='string'||!['info','warn','error'].includes(e.level)||!Number.isFinite(Date.parse(e.timestamp)))throw Error();events.push(sanitize(e));}catch{invalid++;}}}
    else{for(const block of r.text.split(/─{20,}/)){const h=block.match(/\[([^\]\n]+)\]\s*\[(ERROR|WARN)\]\s*\[([^\]\n]+)\]/);if(!h)continue;if(structuredDays.has(f.name.slice(0,14))&&/^\d{4}-\d{2}-\d{2}T/.test(h[1]))continue;legacy=true;const msg=block.slice(h.index+h[0].length).trim().slice(0,4000);events.push({timestamp:new Date(f.stat.mtimeMs).toISOString(),level:h[2].toLowerCase(),source:h[3],message:redactText(msg),...classify(msg),legacy:true});}}
  }
  events.sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));return {events,truncated,invalid,bytes,filesRead,legacy};
}
function analyzeEvents(events){
  const groups=new Map();
  for(const e of events.filter(e=>e.level==='error'||e.level==='warn')){
    const key=reference([e.code,e.source,e.message.replace(/\b\d+\b/g,'N')].join('|'));
    if(!groups.has(key))groups.set(key,{...describe(e.code,e.message),code:e.code||classify(e.message).code,level:e.level,source:e.source,count:0,firstSeen:e.timestamp,lastSeen:e.timestamp,sample:e.message,stack:e.stack,route:e.route,actionContext:e.action,times:[],versions:[]});
    const g=groups.get(key);g.count++;if(!g.versions.includes(e.appVersion||'unknown'))g.versions.push(e.appVersion||'unknown');g.lastSeen=e.timestamp;g.level=e.level==='error'?'error':g.level;if(!e.legacy)g.times.push(Date.parse(e.timestamp));
  }
  return [...groups.values()].map(({times,...g})=>{times.sort((a,b)=>a-b);let left=0,peak=0;for(let i=0;i<times.length;i++){while(times[i]-times[left]>60000)left++;peak=Math.max(peak,i-left+1);}return {...g,peakPerMinute:peak,loop:peak>=15};}).sort((a,b)=>(b.level==='error')-(a.level==='error')||b.count-a.count);
}
function createDiagnostics({store,logger,reportDir,backupDir,dataDir,appInfo,registeredChannels,cloudProbe,uiProbe,now=Date.now}){
  let active=null;
  function history(){if(!fs.existsSync(reportDir))return [];return fs.readdirSync(reportDir).filter(f=>/^diagnostic-[\w-]+\.json$/.test(f)).sort().reverse().slice(0,20).flatMap(name=>{try{const p=path.join(reportDir,name);if(fs.statSync(p).size>2*1024*1024)return [];const r=JSON.parse(fs.readFileSync(p,'utf8'));return [{name,generatedAt:r.generatedAt,mode:r.mode,summary:r.summary,runId:r.runId}];}catch{return [];}});}
  function reportFile(name){if(typeof name!=='string'||!/^diagnostic-[\w-]+\.(txt|json)$/.test(name))throw Error('Invalid diagnostic report name');const file=path.join(reportDir,name);if(!fs.existsSync(file))throw Error('Report unavailable');return file;}
  async function perform(options={}){
    const started=now(),mode=options.mode==='deep'?'deep':'quick',checks=[];
    const add=(code,status,title,evidence,action='',category='system',verification='checked')=>checks.push({code,status,title,evidence:sanitize(evidence),action,category,verification});
    const safeCheck=async(code,title,fn)=>{try{await fn();}catch(e){add(code,'error',title,{error:redactText(e.message),nativeCode:e.code||null},'Error code और stack के साथ storage/access जाँचें।');}};
    const runId=crypto.randomUUID();
    await safeCheck('DB-000','Offline database inspection failed',async()=>{
      const s=store.diagnosticSnapshot({deep:mode==='deep'});
      const integrity=s.integrity.map(r=>String(Object.values(r)[0]));
      add('DB-001',integrity.length>0&&integrity.every(v=>v==='ok')?'pass':'error',mode==='deep'?'SQLite integrity check':'SQLite quick check',{result:integrity},'Integrity error पर database reset/delete न करें; backup copy पर repair जाँचें।','database');
      add('DB-003',s.malformed||s.malformedQueue?'error':'pass','Stored JSON and queue readability',{malformedCache:s.malformed,malformedQueue:s.malformedQueue},'Malformed record को सुरक्षित copy पर ठीक करें।','database');
      add('DB-004','pass','Actual SQLite record and queue counts',{tables:s.counts,queueTotal:s.queueCount,journal:s.journalMode},'Counts local PC के हैं; cloud totals नहीं।','database');
      if(s.truncated)add('COVERAGE-002','skipped','Large database scan limited','Maximum 50,000 rows per scan/journal; counts complete, item checks partial.','बड़ी database की अलग offline copy पर विस्तृत audit करें।','coverage');
      const smsTotal=Number(s.queueCounts.find(r=>r.op==='sms')?.n||0),dataTotal=s.queueCount-smsTotal;
      const queue=s.queue,data=queue.filter(q=>q.op!=='sms'),sms=queue.filter(q=>q.op==='sms');
      const review=sms.filter(q=>['unconfirmed','uncertain','sending','dispatching'].includes(q.payload?.deliveryState));
      const retry=data.filter(q=>(q.retries||0)>=5||q.lastError),old=data.filter(q=>now()-Date.parse(q.createdAt)>86400000);
      add('SYNC-001',retry.length||old.length?'warn':dataTotal?'warn':'pass','Offline data sync queue',{pending:dataTotal,examined:data.length,stuck:retry.length,olderThan24h:old.length,lastAcknowledgedUpload:s.meta['last-cloud-sync-at']||null,examples:retry.slice(0,10).map(q=>({ref:reference(q.id),table:q.table,op:q.op,retries:q.retries,error:redactText(q.lastError)}))},'Cloud connection/failed item जाँचें; queue clear/delete न करें।','sync');
      add('SMS-001',smsTotal?'warn':'pass','Offline SMS queue',{queued:smsTotal,examined:sms.length,needsReview:review.length},'Gateway में परिणाम जाँचकर review करें; report SMS नहीं भेजती।','sms');
      const uncertain=s.smsJournal.filter(s=>['dispatching','uncertain','invalid'].includes(s)).length;
      add('SMS-002',uncertain||review.length?'warn':'pass','SMS dispatch safety journal',{unconfirmedJournal:uncertain,unconfirmedQueue:review.length},'Gateway acceptance और phone delivery अलग हैं; अनिश्चित संदेश स्वतः resend न करें।','sms');
      add('SMS-003','skipped','Live gateway / handset delivery','No SMS was sent. Credentials, SIM balance and actual handset delivery are not verified.','एक सहमति वाले test number पर अलग device test करें।','coverage');
      const jobs=s.meta['whatsapp:invoice-jobs'];if(jobs!=null&&!Array.isArray(jobs))throw Error('WhatsApp job journal is not an array');
      const jobList=jobs||[],waPending=jobList.filter(j=>['queued','sending'].includes(j.state)).length,waReview=jobList.filter(j=>['failed','unconfirmed'].includes(j.state)).length;
      add('WA-001',waPending||waReview?'warn':'pass','WhatsApp local outbox',{pending:waPending,failedOrUnconfirmed:waReview,paired:!!s.meta['whatsapp:settings']?.paired},'WhatsApp screen पर connection और uncertain jobs जाँचें; report कोई message नहीं भेजती।','whatsapp');
      add('WA-002','skipped','WhatsApp live delivery','Local paired flag does not prove an active browser session or patient delivery.','Scan के बाद सहमति वाले test number पर PDF खोलकर जाँचें।','coverage');
      const norm=id=>String(id||'').replace(/^local_/,'');
      const unique=rows=>{const m=new Map();for(const r of rows||[]){const k=norm(r.id);if(!m.has(k)||r._pendingSync)m.set(k,r);}return [...m.values()];};
      const patients=unique(s.cache.patients),bills=unique(s.cache.billing),ids=new Set(patients.map(p=>norm(p.id)));
      const missing=bills.filter(b=>b.patient_id&&!ids.has(norm(b.patient_id)));
      add('BILL-002',missing.length?'warn':'pass','Bills with no cached patient',{count:missing.length,references:missing.slice(0,10).map(b=>reference(b.id))},'यह local cache पर inference है; cloud में parent मौजूद हो सकता है।','billing','code-inference');
      const bad=bills.filter(b=>{const a=Number(b.amount),d=Number(b.discount||0),p=Number(b.amount_paid||0);return ![a,d,p].every(Number.isFinite)||Math.min(a,d,p)<0||d>a||p>a-d+0.01;});
      const dueMismatch=bills.filter(b=>{if(b.due_amount==null)return false;const due=Math.max(Number(b.amount)-Number(b.discount||0)-Number(b.amount_paid||0),0);return !Number.isFinite(due)||Math.abs(Number(b.due_amount)-due)>0.01;});
      add('BILL-001',bad.length||dueMismatch.length?'warn':'pass','Bill amount, paid, discount and stored due',{scanned:bills.length,invalidOrOverpaid:bad.length,dueMismatch:dueMismatch.length,references:[...new Set([...bad,...dueMismatch].map(b=>reference(b.id)))].slice(0,10)},'Original bill/receipt से मिलान करें; diagnostic कोई रकम नहीं बदलता।','billing','code-inference');
      if(mode==='deep'){
        const receipts=unique(s.cache.payments),billIds=new Set(bills.map(b=>norm(b.id)));
        const orphan=receipts.filter(p=>(p.billing_id||p.bill_id)&&!billIds.has(norm(p.billing_id||p.bill_id)));
        const historyMismatch=bills.filter(b=>Array.isArray(b.payment_history)&&Math.abs(b.payment_history.reduce((n,r)=>n+Number(r.amount),0)-Number(b.amount_paid||0))>0.01);
        const malformedHistory=bills.filter(b=>Array.isArray(b.payment_history)&&(b.payment_history.some(r=>!r.id||!Number.isFinite(Number(r.amount))||!Number.isFinite(Date.parse(r.paid_at)))||new Set(b.payment_history.map(r=>r.id)).size!==b.payment_history.length));
        add('BILL-004',historyMismatch.length||malformedHistory.length?'warn':'pass','Bill receipt ledger reconciliation',{ledgerMismatch:historyMismatch.length,invalidOrDuplicateReceipts:malformedHistory.length,legacyWithoutLedger:bills.filter(b=>!Array.isArray(b.payment_history)).length},'Original receipt से मिलाएँ; पुराने legacy bills की receipt date का manual सत्यापन करें।','billing','code-inference');
        add('BILL-003',orphan.length?'warn':'pass','Payment references in local cache',{scanned:receipts.length,missingBill:orphan.length},'Receipt को original bill से मिलाएँ; legacy receipts की manual जाँच करें।','billing','code-inference');
      }else add('BILL-003','skipped','Detailed payment reference scan','Quick mode; run deep scan.','','coverage');
    });
    await safeCheck('STORAGE-000','Storage inspection failed',async()=>{
      for(const [label,dir] of [['data',dataDir],['backup',backupDir],['logs',logger.getLogDir()]]){
        try{fs.accessSync(dir,fs.constants.R_OK|fs.constants.W_OK);const st=fs.statfsSync?.(dir);const free=st?Number(st.bavail)*Number(st.bsize):null;add('STORAGE-003',free!==null&&free<512*1024*1024?'warn':'pass',`${label} folder access and free space`,{accessible:true,freeMB:free===null?null:Math.floor(free/1024/1024)},'Disk space और Windows permissions जाँचें।','storage');}
        catch(e){add('STORAGE-002','error',`${label} folder unavailable`,{nativeCode:e.code},'Folder permissions/drive जाँचें।','storage');}
      }
      const health=logger.health();add('LOG-001',health.lastWriteError?'error':'pass','Logger write health',{lastWriteError:health.lastWriteError||null},'Log folder writable होना चाहिए; missing logs का अर्थ no errors नहीं है।','logs');
      const backups=fs.existsSync(backupDir)?fs.readdirSync(backupDir).filter(n=>n.endsWith('.json')).map(n=>({file:path.join(backupDir,n),mtime:fs.statSync(path.join(backupDir,n)).mtimeMs})).sort((a,b)=>b.mtime-a.mtime):[];
      const latest=backups[0];let valid=false,reason='No full JSON backup found';
      if(latest&&mode==='deep'){if(fs.statSync(latest.file).size<=25*1024*1024){try{const b=JSON.parse(fs.readFileSync(latest.file,'utf8'));valid=b.formatVersion===2&&!!b.tables&&!!b.localSnapshot?.cache&&Array.isArray(b.localSnapshot.queue);reason=valid?'Version 2 JSON + localSnapshot structure valid; restore not performed':'Full version 2 localSnapshot missing';}catch{reason='Backup JSON cannot be parsed';}}else reason='Backup exceeds 25 MB inspection limit';}
      add('BACKUP-001',!latest?'warn':now()-latest.mtime>48*3600000?'warn':mode==='deep'&&!valid?'warn':'pass','Latest full JSON backup',{lastModified:latest?new Date(latest.mtime).toISOString():null,structure:mode==='deep'?reason:'Not parsed in quick mode'},'Backup Now चलाएँ; restore की अलग test copy पर पुष्टि करें।','backup',mode==='deep'?'checked':'metadata-only');
      add('BACKUP-002','skipped','Restore and X-ray attachment completeness','No restore or image/PDF opening performed; a recent file is not proof of recoverability.','अलग test PC/folder में backup restore और X-ray खोलकर जाँचें।','coverage');
    });
    await safeCheck('IPC-000','IPC inspection failed',async()=>{
      const channels=registeredChannels();const missing=channels.required.filter(c=>!channels.registered.includes(c));
      add('IPC-001',missing.length?'error':'pass','Actual desktop handler registration',{checked:channels.required.length,registered:channels.registered.length,missing},'Main/preload release versions का मिलान करें।','ipc');
    });
    await safeCheck('CLOUD-000','Cloud check failed',async()=>{
      const results=await cloudProbe();for(const r of results)add(r.code,r.status,r.title,r.evidence,r.action||'Cloud connection और permissions जाँचें; local काम चलता रहना चाहिए।','cloud');
    });
    await safeCheck('UI-000','UI inspection failed',async()=>{
      const ui=await uiProbe();if(!ui){add('UI-010','skipped','Current screen layout','Renderer snapshot unavailable.','Screen खुलने के बाद दोबारा जाँचें।','coverage');return;}
      const overflow=Number(ui.overflowPx)||0;add('UI-010',overflow>4?'warn':'pass','Current screen horizontal overflow',{route:ui.route,width:ui.width,height:ui.height,overflowPx:overflow,brokenImages:ui.brokenImages},'Window size/zoom और screen layout जाँचें।','ui');
      if(ui.rootChildren===0)add('UI-008','error','Application root is empty','No rendered clinic screen found in the root element.','Startup JS/assets और bootstrap errors जाँचें।','ui');
      if(Number(ui.brokenImages)>0)add('UI-011','warn','Broken images on current screen',{count:ui.brokenImages},'Image path/network और file presence जाँचें।','ui');
      add('UI-012','skipped','All screens and business workflows','Only the currently rendered screen and recorded errors are inspected. Hidden screens, print alignment and untriggered bugs require device tests.','समस्या वाला screen/action चलाएँ, फिर report निकालें।','coverage');
    });
    let logScan={events:[],truncated:false};
    await safeCheck('LOG-000','Error history scan failed',async()=>{
      logScan=readEvents(logger.getLogDir());
      add('LOG-002',logScan.truncated||logScan.invalid||logScan.legacy?'warn':'pass','Last 7 days error history coverage',{filesRead:logScan.filesRead,bytesRead:logScan.bytes,truncated:logScan.truncated,malformedEntries:logScan.invalid,legacyApproximation:logScan.legacy},'Bounded scan; पुराने raw logs share करने से पहले review करें।','logs');
      if(!logScan.filesRead)add('LOG-003','skipped','Runtime error history unavailable','No readable log files found; no-error status cannot be inferred.','','coverage');
    });
    const allIssues=analyzeEvents(logScan.events),issues=allIssues.slice(0,50);
    if(allIssues.length>50)add('LOG-004','warn','Issue list limited',{totalGroups:allIssues.length,shown:50},'Older/raw log history पर अलग targeted audit करें।','logs');
    for(const issue of issues){add(issue.code,issue.level==='error'?'error':'warn',issue.title,{occurrences:issue.count,firstSeen:issue.firstSeen,lastSeen:issue.lastSeen,source:issue.source,route:issue.route,actionContext:issue.actionContext,versions:issue.versions,sample:issue.sample,stack:issue.stack},issue.action,'recorded-errors','recorded-runtime');if(issue.loop)add('LOOP-001','error','Repeated error burst',{code:issue.code,peakPerMinute:issue.peakPerMinute},'संबंधित retry/effect loop जाँचें।','logs','recorded-runtime');}
    const summary={passed:checks.filter(c=>c.status==='pass').length,warnings:checks.filter(c=>c.status==='warn').length,errors:checks.filter(c=>c.status==='error').length,skipped:checks.filter(c=>c.status==='skipped').length};
    const report={schemaVersion:1,runId,generatedAt:new Date(now()).toISOString(),mode,durationMs:now()-started,app:appInfo(),summary,checks,issues,
      limits:['Read-only clinical inspection; no data repair, queue clearing, SMS or WhatsApp dispatch.','A passed check covers only its stated evidence, not every software function.','Reports mask common sensitive fields; review before sharing. No patient rows or credentials are exported.']};
    const text=['BALAJI DIGITAL X-RAY & ORTHO CARE CENTER — DIAGNOSTICS',`Run: ${runId} | Version: ${report.app.version} | ${report.generatedAt} | Mode: ${mode}`,`Pass ${summary.passed} | Warnings ${summary.warnings} | Errors ${summary.errors} | Not checked ${summary.skipped}`,...checks.map(c=>`\n[${c.status.toUpperCase()}] ${c.code} — ${c.title}\nVerification: ${c.verification}\nEvidence: ${JSON.stringify(c.evidence)}\nNext: ${c.action||'—'}`),'\nLIMITS',...report.limits].join('\n');
    const name=`diagnostic-${new Date(now()).toISOString().replace(/[:.]/g,'-')}-${runId.slice(0,8)}`;
    fs.mkdirSync(reportDir,{recursive:true});
    for(const [ext,content] of [['json',JSON.stringify(report,null,2)],['txt',text]]){const f=path.join(reportDir,name+'.'+ext);fs.writeFileSync(f+'.tmp',content,'utf8');fs.renameSync(f+'.tmp',f);}
    // Keep 20 report pairs; never touch patient files, queues or old application logs here.
    for(const old of fs.readdirSync(reportDir).filter(f=>/^diagnostic-[\w-]+\.json$/.test(f)).sort().reverse().slice(20))for(const ext of ['json','txt']){try{fs.unlinkSync(path.join(reportDir,old.replace(/\.json$/,'.'+ext)));}catch{}}
    return {success:true,...report,text,reportName:name+'.txt',jsonName:name+'.json',reportPath:path.join(reportDir,name+'.txt')};
  }
  function run(options){if(active)return active;active=perform(options).finally(()=>{active=null;});return active;}
  return {run,history,reportFile};
}
module.exports={createDiagnostics,readEvents,analyzeEvents};
