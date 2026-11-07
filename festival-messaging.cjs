'use strict';
const {createMessagingLog}=require('./messaging-log.cjs');
const {randomUUID,createHash}=require('crypto');
const {familyNumber}=require('./family-profile.cjs');
const CLINIC='Balaji Digital X-Ray & Ortho Care Center';
const FESTIVALS=[['diwali','दीपावली','दीयों का उजाला आपके जीवन में सुख, समृद्धि और खुशियाँ लाए।'],['holi','होली','खुशियों के रंगों से आपका जीवन सदा रंगीन रहे।'],['rakhi','रक्षाबंधन','स्नेह और विश्वास का यह बंधन सदा अटूट रहे।'],['navratri','नवरात्रि','माँ दुर्गा आपके परिवार को सुख, शक्ति और अच्छा स्वास्थ्य दें।'],['dussehra','दशहरा','यह पर्व आपके जीवन में नई आशा और खुशियाँ लाए।'],['dhanteras','धनतेरस','आपके घर में सुख, समृद्धि और अच्छे स्वास्थ्य का वास हो।'],['bhaidooj','भाई दूज','भाई-बहन का स्नेह जीवन में खुशियाँ भरता रहे।'],['janmashtami','जन्माष्टमी','श्रीकृष्ण की कृपा से आपके घर में आनंद और शांति बनी रहे।'],['ganesh','गणेश चतुर्थी','श्रीगणेश आपके जीवन में मंगल और खुशियाँ लाएँ।'],['sankranti','मकर संक्रांति','यह पर्व आपके जीवन में नई उमंग और खुशियाँ लाए।'],['newyear','नव वर्ष','नया साल आपके लिए नई उम्मीदें और अच्छा स्वास्थ्य लेकर आए।'],['eid','ईद','आपके परिवार में अमन, खुशियाँ और बरकत बनी रहे।'],['christmas','क्रिसमस','आपके जीवन में प्रेम, शांति और खुशियाँ बनी रहें।'],['custom','अन्य त्योहार','']].map(([id,name,line])=>({id,name,whatsapp:`🙏 आप और आपके परिवार को ${name} की हार्दिक शुभकामनाएँ!\n\n${line}\nआप सभी स्वस्थ रहें और मुस्कुराते रहें।\n\nसादर,\n${CLINIC}`,sms:`आप और आपके परिवार को ${name} की हार्दिक शुभकामनाएँ। सुख, शांति और अच्छे स्वास्थ्य की मंगलकामनाएँ। — ${CLINIC}`}));
const indiaDate=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
function createFestivalService({store,allowed,whatsapp,sendSMS,smsReady=()=>false,now=Date.now,intervalMs=30000,workerPollMs=5000,logger}){
 const report=createMessagingLog(logger,'festival-messaging',now),pollMs=Math.max(1,Number(workerPollMs)||5000);
 const key='festival:campaigns',blockKey='festival:excluded';let busy=false,lastCampaignId=null,nextSend={whatsapp:0,sms:0};
 const list=()=>store.metaGet(key)||[],save=rows=>store.metaSet(key,rows);
 const pendingJobs=campaigns=>campaigns.filter(c=>c.state==='active').flatMap(c=>(c.jobs||[]).filter(j=>['queued','sending'].includes(j.state)));
 const pendingCount=campaigns=>pendingJobs(campaigns).length;
 const pendingByChannel=campaigns=>pendingJobs(campaigns).reduce((counts,j)=>(counts[j.channel]=(counts[j.channel]||0)+1,counts),{});
 const assert=()=>{if(!allowed())throw Error('Administrator login required');};
 save(list().map(c=>({...c,jobs:c.jobs.map(j=>j.state==='sending'?{...j,state:j.channel==='whatsapp'?'unconfirmed':'queued',error:'पिछली बार app बंद होने पर भेजने का परिणाम अनिश्चित था।'}:j)})));
 const exclusions=()=>store.metaGet(blockKey)||[];
 function inputData(input){
  if(!input||!FESTIVALS.some(f=>f.id===input.festival))throw Error('त्योहार चुनें।');
  const title=String(input.title||'').trim();if(!title||title.length>80)throw Error('त्योहार का नाम भरें (अधिकतम 80 अक्षर)।');
  const at=Date.parse(input.scheduledAt);if(!Number.isFinite(at)||!/(Z|[+-]\d{2}:\d{2})$/.test(input.scheduledAt))throw Error('सही तारीख और समय चुनें।');
  const channels=['whatsapp','sms'].filter(c=>input.channels?.includes(c));if(!channels.length)throw Error('WhatsApp या SMS चुनें।');
  const messages={};for(const c of channels){const text=String(input[c]||'').trim();if(!text||text.length>1500)throw Error('संदेश 1 से 1500 अक्षर का होना चाहिए।');messages[c]=text;}
  return{festival:input.festival,title,scheduledAt:new Date(at).toISOString(),date:indiaDate(at),channels,messages};
 }
 function buildAudience(raw,blockedNumbers){
  const blocked=new Set(blockedNumbers),seen=new Set(),rows=[];let invalid=0,duplicates=0,excluded=0;
  for(const p of raw){if(p.deleted_at||p.workflow_data?.archived||p.workflow_data?.marketing===false)continue;const mobile=familyNumber(p.mobile);if(!mobile){invalid++;continue;}if(seen.has(mobile)){duplicates++;continue;}seen.add(mobile);if(blocked.has(mobile)){excluded++;continue;}rows.push({mobile,name:String(p.name||'परिवार'),patientId:p.id});}
  rows.sort((a,b)=>a.mobile.localeCompare(b.mobile));return{rows,invalid,duplicates,excluded};
 }
 function audience(){return buildAudience(store.patientDirectoryRows(),exclusions());}
 function estimate(messageCount,scheduledAt,campaigns=list(),channelCounts={},excludeCampaignId){
  const start=Math.max(now(),Date.parse(scheduledAt)),day=indiaDate(Date.parse(scheduledAt));
  const backlogCampaigns=(excludeCampaignId?campaigns.filter(c=>c.id!==excludeCampaignId):campaigns).filter(c=>c.date===day);
  const backlogCounts=pendingByChannel(backlogCampaigns),counts={};
  for(const channel of ['whatsapp','sms'])counts[channel]=(channelCounts[channel]||0)+(backlogCounts[channel]||0);
  const activeChannels=['whatsapp','sms'].filter(channel=>counts[channel]>0).sort((a,b)=>counts[b]-counts[a]||a.localeCompare(b));
  const total=activeChannels.reduce((sum,channel)=>sum+counts[channel],0),gateSlots=Math.ceil(intervalMs/pollMs);
  const completionSlots=Math.max(0,total-1,...activeChannels.map((channel,index)=>index+Math.max(0,counts[channel]-1)*gateSlots));
  const elapsed=completionSlots*pollMs;
  const earliestFinishAt=new Date(start+elapsed).toISOString(),dayEnd=Date.parse(day+'T23:59:59.999+05:30');
  return{messageCount,minimumSeconds:elapsed/1000,earliestFinishAt,dayEnd:new Date(dayEnd).toISOString(),fitsDay:start+elapsed<=dayEnd,otherPending:pendingCount(backlogCampaigns),pendingByChannel:backlogCounts};
 }
 function preview(input){assert();const data=inputData(input),a=audience(),campaigns=list();const fingerprint=createHash('sha256').update(JSON.stringify([data,a.rows,exclusions()])).digest('hex');const channelCounts=Object.fromEntries(data.channels.map(channel=>[channel,a.rows.length]));return{...data,...a,count:a.rows.length,fingerprint,estimate:estimate(a.rows.length*data.channels.length,data.scheduledAt,campaigns,channelCounts)};}
 function create(input){
  assert();const p=preview(input);if(input.fingerprint!==p.fingerprint)throw Error('संदेश या नंबरों की सूची बदली है; फिर preview देखें।');if(!p.count)throw Error('भेजने के लिए सही मोबाइल नंबर नहीं हैं।');if(!p.estimate.fitsDay)throw Error('इतने संदेश चुने दिन में पूरे नहीं हो पाएँगे। समय पहले रखें या माध्यम/सूची कम करें।');
  if(Date.parse(p.scheduledAt)<now()-60000)throw Error('बीता हुआ समय नहीं चुन सकते।');
  const old=list();if(old.some(c=>c.festival===p.festival&&(p.festival!=='custom'||c.title===p.title)&&c.date===p.date&&c.channels.some(ch=>p.channels.includes(ch))&&(c.state!=='cancelled'||c.jobs.some(j=>['sent','sending','unconfirmed'].includes(j.state)))))throw Error('इस त्योहार/दिन और माध्यम का अभियान पहले से है। उसी की स्थिति देखें।');
  const campaign={id:randomUUID(),festival:p.festival,title:p.title,date:p.date,scheduledAt:p.scheduledAt,channels:p.channels,messages:p.messages,state:'active',createdAt:new Date(now()).toISOString(),jobs:p.rows.flatMap(r=>p.channels.map(channel=>({id:randomUUID(),...r,channel,state:'queued',attempts:0,error:''})))};
  save([...old,campaign]);return campaign.id;
 }
 function patchJob(cid,jid,patch){const all=list(),c=all.find(x=>x.id===cid),j=c?.jobs.find(x=>x.id===jid);if(j)Object.assign(j,patch);save(all);}
 function change(id,action){assert();const all=list(),c=all.find(x=>x.id===id);if(!c)throw Error('अभियान नहीं मिला।');
  if(action==='pause'&&c.state==='active')c.state='paused';else if(action==='resume'&&c.state==='paused')c.state='active';else if(action==='cancel'){c.state='cancelled';c.jobs=c.jobs.map(j=>j.state==='queued'?{...j,state:'cancelled'}:j);}else throw Error('यह कार्रवाई उपलब्ध नहीं है।');save(all);
 }
 function review(cid,jid,action){assert();const all=list(),c=all.find(x=>x.id===cid),j=c?.jobs.find(x=>x.id===jid);if(!j||!['unconfirmed','failed'].includes(j.state))throw Error('इस संदेश की जाँच उपलब्ध नहीं है।');if(action==='sent')j.state='sent';else if(action==='cancel')j.state='cancelled';else throw Error('पहले WhatsApp/gateway में परिणाम जाँचें।');j.error='';save(all);}
 function setExclusions(numbers){assert();if(typeof numbers!=='string'||numbers.length>100000)throw Error('मोबाइल नंबरों की सूची सही नहीं है।');const values=numbers.split(/[\s,;]+/).filter(Boolean);const normalized=values.map(familyNumber);if(normalized.some(x=>!x))throw Error('हर नंबर 10 अंक या +91 के साथ लिखें; एक लाइन में एक नंबर।');store.metaSet(blockKey,[...new Set(normalized)].sort());}
 function status(includeJobs=true){assert();const campaigns=list();return{festivals:FESTIVALS,exclusions:exclusions(),smsReady:!!smsReady(),campaigns:campaigns.slice().reverse().map(c=>{const {jobs=[],messages,...summary}=c;const pending=jobs.filter(j=>['queued','sending'].includes(j.state));const channelCounts=pending.reduce((counts,j)=>(counts[j.channel]=(counts[j.channel]||0)+1,counts),{});return{...summary,estimate:estimate(pending.length,c.scheduledAt,campaigns,channelCounts,c.id),counts:jobs.reduce((a,j)=>(a[j.state]=(a[j.state]||0)+1,a),{}),...(includeJobs?{messages,jobs}:{})};})};}
 function campaignJobs(id){assert();const campaign=list().find(c=>c.id===id);if(!campaign)throw Error('अभियान नहीं मिला।');return campaign.jobs||[];}
 async function tick(){
  if(busy||!allowed())return;busy=true;
  try{
   const tickNow=now(),all=list(),due=all.filter(c=>c.state==='active'&&Date.parse(c.scheduledAt)<=tickNow);
   if(!due.length)return;
   const pivot=lastCampaignId?due.findIndex(c=>c.id===lastCampaignId):-1;
   const ordered=pivot<0?due:[...due.slice(pivot+1),...due.slice(0,pivot+1)];
   const blockedNumbers=exclusions(),blocked=new Set(blockedNumbers),directory=store.patientDirectoryRows(),eligible=new Set(buildAudience(directory,blockedNumbers).rows.map(p=>p.mobile));
   const contacts=new Map(directory.map(p=>[String(p.id).replace(/^local_/,''),p]));let whatsappAvailable;
   let selected,dirty=false;
   for(const c of ordered){
    if(c.date!==indiaDate(tickNow)){for(const j of c.jobs)if(j.state==='queued'){Object.assign(j,{state:'expired',error:'त्योहार का चुना हुआ दिन समाप्त हो गया।'});dirty=true;}continue;}
    for(const j of c.jobs){
     if(j.state!=='queued'||j.retryAt>tickNow||tickNow<(nextSend[j.channel]||0))continue;
     if(blocked.has(j.mobile)){Object.assign(j,{state:'cancelled',error:'इस नंबर पर शुभकामनाएँ बंद हैं।'});dirty=true;continue;}
     if(!eligible.has(j.mobile)){Object.assign(j,{state:'cancelled',error:'नंबर मरीज सूची से हट गया है।'});dirty=true;continue;}
     const contact=contacts.get(String(j.patientId).replace(/^local_/,''));if(contact?.workflow_data?.[j.channel]===false){Object.assign(j,{state:'cancelled',error:'मरीज की संपर्क पसंद के अनुसार रोका गया'});dirty=true;continue;}
     if(j.channel==='sms'&&(!smsReady()||typeof sendSMS.canSend==='function'&&!sendSMS.canSend()))continue;
     if(j.channel==='whatsapp'){
      if(whatsappAvailable===undefined)whatsappAvailable=typeof whatsapp.canSendText==='function'?whatsapp.canSendText():!!whatsapp.status().ready;
      if(!whatsappAvailable)continue;
     }
     selected={c,j};break;
    }
    if(selected)break;
   }
   if(!selected){if(dirty)save(all);return;}
   const {c,j}=selected;lastCampaignId=c.id;j.state='sending';j.attempts=(j.attempts||0)+1;j.error='';save(all);
   nextSend[j.channel]=now()+intervalMs;
   // Re-read once immediately before WhatsApp handoff so pause, cancellation,
   // exclusions and patient preferences can still stop an in-flight lookup.
   const validate=()=>{
    if(!allowed())return 'cancelled';
    const campaigns=list(),current=campaigns.find(x=>x.id===c.id),job=current?.jobs.find(x=>x.id===j.id);
    const currentBlocked=exclusions(),currentDirectory=store.patientDirectoryRows(),person=currentDirectory.find(p=>String(p.id).replace(/^local_/,'')===String(j.patientId).replace(/^local_/,''));
    if(person?.workflow_data?.[j.channel]===false||person?.workflow_data?.marketing===false)return 'cancelled';
    if(!current||current.state==='cancelled'||job?.state!=='sending'||current.date!==indiaDate(now())||currentBlocked.includes(j.mobile)||!buildAudience(currentDirectory,currentBlocked).rows.some(p=>p.mobile===j.mobile))return 'cancelled';
    return current.state==='active'?true:'wait';
   };
   let result,transportFailed=false;
   try{result=j.channel==='whatsapp'?await whatsapp.sendText(j.mobile,c.messages.whatsapp,validate,{jobId:j.id,campaignId:c.id,kind:c.kind||'festival',attempt:j.attempts}):await sendSMS({requestId:'festival-'+j.id,mobile:j.mobile,message:c.messages.sms});}
   catch(e){transportFailed=true;report('MSG-011','Campaign transport',e,{jobId:j.id,campaignId:c.id,kind:'festival',channel:j.channel,attempt:j.attempts,deliveryState:'unconfirmed'});result={ok:false,uncertain:true,error:'भेजने का परिणाम अनिश्चित है; चैट/gateway जाँचें।'};}
   if(!transportFailed&&j.channel==='sms'&&!result.ok&&!result.cancelled)report('MSG-011','Campaign SMS result',result.error||'SMS gateway did not accept request',{jobId:j.id,campaignId:c.id,kind:c.kind||'festival',channel:'sms',attempt:j.attempts,deliveryState:result.uncertain?'unconfirmed':'queued',level:result.uncertain?'warn':undefined});
   patchJob(c.id,j.id,{state:result.ok?'sent':result.cancelled?'cancelled':result.uncertain?'unconfirmed':result.permanent?'failed':'queued',error:result.ok?'':result.error||'कनेक्शन की प्रतीक्षा में',retryAt:now()+60000,...(result.ok?{sentAt:new Date(now()).toISOString()}:{} )});
  }finally{busy=false;}
 }
 return{preview,create,status,campaignJobs,change,review,setExclusions,tick};
}
module.exports={createFestivalService,FESTIVALS,indiaDate};
