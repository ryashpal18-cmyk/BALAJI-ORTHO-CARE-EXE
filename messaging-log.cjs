'use strict';
const {reference}=require('./diagnostic-utils.cjs');

// Use the application's rotating, redacted log files. Logging never changes delivery state.
function createMessagingLog(logger,source,now=Date.now){
  const recent=new Map();
  return function report(code,stage,error,context={}){
    try{
      if(typeof logger?.record!=='function')return;
      const reason=String(error?.message||error||'Unknown messaging error').replace(/data:[^\s]+/g,'[file data]').slice(0,1200);
      const jobRef=context.jobId?reference(context.jobId):undefined;
      const campaignRef=context.campaignId?reference(context.campaignId):undefined;
      const key=reference([code,stage,reason,jobRef,campaignRef,context.kind].join('|'));
      const previous=recent.get(key),time=now();
      if(previous&&time-previous.at<60000){previous.suppressed++;return;}
      recent.set(key,{at:time,suppressed:0});
      if(recent.size>1000)recent.delete(recent.keys().next().value);
      logger.record({level:context.level==='warn'?'warn':'error',source,code,
        message:`${stage}: ${reason}`,stack:String(error?.stack||'').replace(/data:[^\s]+/g,'[file data]'),
        detail:{stage,jobRef,campaignRef,kind:context.kind,channel:context.channel,
          attempt:context.attempt,deliveryState:context.deliveryState,nativeCode:error?.code||error?.cause?.code,
          nativeCause:error?.cause?{name:error.cause.name,message:error.cause.message,code:error.cause.code}:undefined,
          suppressedRepeats:previous?.suppressed||0}});
    }catch{/* A broken/full log disk must not interrupt billing or trigger a resend. */}
  };
}
module.exports={createMessagingLog};
