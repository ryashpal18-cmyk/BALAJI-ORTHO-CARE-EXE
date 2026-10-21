'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {normalizeEvent,localDay}=require('./diagnostic-utils.cjs');
// Factory permits isolated fault-injection tests; production uses only the clinic log folder.
function createLogger({dir='C:\\Balaji_Health_Backup\\logs', now=Date.now, maxBytes=5*1024*1024, maxTotalBytes=100*1024*1024, consoleOutput=true,onAlert=()=>{}}={}) {
  const session=crypto.randomUUID();let lastWriteError='', handlers=false, appVersion='unknown';const bursts=new Map();
  function ensure(){fs.mkdirSync(dir,{recursive:true});}
  function filename(ext){const base=`app-${localDay(now())}`;let part=1,file;do{file=path.join(dir,base+(part===1?'':`-part${part}`)+ext);part++;}while(fs.existsSync(file)&&fs.statSync(file).size>=maxBytes);return file;}
  function cleanOldLogs(){
    try {ensure();const files=fs.readdirSync(dir).filter(f=>/^app-\d{4}-\d{2}-\d{2}(?:-part\d+)?\.(log|jsonl)$/.test(f)).map(f=>({file:path.join(dir,f),...fs.statSync(path.join(dir,f))})).sort((a,b)=>a.mtimeMs-b.mtimeMs);let total=files.reduce((s,f)=>s+f.size,0);
      for(const f of files)if(f.mtimeMs<now()-14*86400000||total>maxTotalBytes){fs.unlinkSync(f.file);total-=f.size;}
    }catch(e){lastWriteError=e.code||'LOG_CLEANUP_FAILED';}
  }
  let writes=0;
  function record(input){
    const e=normalizeEvent({...input,session,appVersion},now());
    try{ensure();if(++writes%100===0)cleanOldLogs();fs.appendFileSync(filename('.jsonl'),JSON.stringify(e)+'\n','utf8');fs.appendFileSync(filename('.log'),`[${e.timestamp}] [${e.level.toUpperCase()}] [${e.source}] [${e.code}]\n    ${e.message}\n${e.stack||''}${e.detail?'\n    Detail: '+JSON.stringify(e.detail):''}\n${'─'.repeat(80)}\n`,'utf8');lastWriteError='';}
    catch(error){lastWriteError=error.code||'LOG_WRITE_FAILED';if(consoleOutput)console.error('[LOGGER]',lastWriteError);}
    // Never send raw messages/details to the developer console.
    if(consoleOutput)console[e.level==='error'?'error':e.level==='warn'?'warn':'log'](`[${e.code}] [${e.source}] ${e.message}`);
    if(e.level==='error') {
      const prior=bursts.get(e.fingerprint), t=now();
      const burst=prior&&t-prior.start<60000?prior:{start:t,count:0,alerted:false};
      burst.count++;bursts.set(e.fingerprint,burst);
      if(burst.count>=12&&!burst.alerted){burst.alerted=true;try{onAlert({code:e.code,source:e.source,count:burst.count});}catch{}}
      if(bursts.size>1000)bursts.delete(bursts.keys().next().value);
    }
    return e;
  }
  function setupGlobalHandlers(){if(handlers)return;handlers=true;process.on('uncaughtException',e=>record({level:'error',source:'main-process',message:e.message,stack:e.stack,detail:{code:e.code}}));process.on('unhandledRejection',e=>record({level:'error',source:'main-promise',message:e?.message||String(e),stack:e?.stack}));}
  return {setVersion:value=>{appVersion=String(value).slice(0,40);},setAlertHandler:fn=>{onAlert=typeof fn==='function'?fn:()=>{};},record,logInfo:(s,m,d)=>record({level:'info',source:s,message:m,detail:d}),logWarn:(s,m,d)=>record({level:'warn',source:s,message:m,detail:d}),logError:(s,m,d)=>record({level:'error',source:s,message:m,detail:d}),
    writeRendererLog:(level,source,message)=>record({level,source,message}),getLogDir:()=>{ensure();return dir;},cleanOldLogs,setupGlobalHandlers,health:()=>({lastWriteError,session})};
}
module.exports={...createLogger(),createLogger};
