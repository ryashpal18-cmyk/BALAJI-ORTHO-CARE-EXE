'use strict';
const {randomUUID,createHash}=require('crypto');
const {familyNumber}=require('./family-profile.cjs');
const CLINIC='Balaji Digital X-Ray & Ortho Care Center';
const FESTIVALS=[['diwali','दीपावली','दीयों का उजाला आपके जीवन में सुख, समृद्धि और खुशियाँ लाए।'],['holi','होली','खुशियों के रंगों से आपका जीवन सदा रंगीन रहे।'],['rakhi','रक्षाबंधन','स्नेह और विश्वास का यह बंधन सदा अटूट रहे।'],['navratri','नवरात्रि','माँ दुर्गा आपके परिवार को सुख, शक्ति और अच्छा स्वास्थ्य दें।'],['dussehra','दशहरा','यह पर्व आपके जीवन में नई आशा और खुशियाँ लाए।'],['dhanteras','धनतेरस','आपके घर में सुख, समृद्धि और अच्छे स्वास्थ्य का वास हो।'],['bhaidooj','भाई दूज','भाई-बहन का स्नेह जीवन में खुशियाँ भरता रहे।'],['janmashtami','जन्माष्टमी','श्रीकृष्ण की कृपा से आपके घर में आनंद और शांति बनी रहे।'],['ganesh','गणेश चतुर्थी','श्रीगणेश आपके जीवन में मंगल और खुशियाँ लाएँ।'],['sankranti','मकर संक्रांति','यह पर्व आपके जीवन में नई उमंग और खुशियाँ लाए।'],['newyear','नव वर्ष','नया साल आपके लिए नई उम्मीदें और अच्छा स्वास्थ्य लेकर आए।'],['eid','ईद','आपके परिवार में अमन, खुशियाँ और बरकत बनी रहे।'],['christmas','क्रिसमस','आपके जीवन में प्रेम, शांति और खुशियाँ बनी रहें।'],['custom','अन्य त्योहार','']].map(([id,name,line])=>({id,name,whatsapp:`🙏 आप और आपके परिवार को ${name} की हार्दिक शुभकामनाएँ!\n\n${line}\nआप सभी स्वस्थ रहें और मुस्कुराते रहें।\n\nसादर,\n${CLINIC}`,sms:`आप और आपके परिवार को ${name} की हार्दिक शुभकामनाएँ। सुख, शांति और अच्छे स्वास्थ्य की मंगलकामनाएँ। — ${CLINIC}`}));
const indiaDate=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
function createFestivalService({store,allowed,whatsapp,sendSMS,now=Date.now,intervalMs=30000}){
 const key='festival:campaigns',blockKey='festival:excluded';let busy=false,nextSend=0,gateway=null;
 const list=()=>store.metaGet(key)||[],save=rows=>store.metaSet(key,rows);
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
 function audience(){
  const raw=store.patientDirectoryRows().filter(p=>!p.deleted_at),blocked=new Set(exclusions()),seen=new Set(),rows=[];let invalid=0,duplicates=0,excluded=0;
  for(const p of raw){const mobile=familyNumber(p.mobile);if(!mobile){invalid++;continue;}if(seen.has(mobile)){duplicates++;continue;}seen.add(mobile);if(blocked.has(mobile)){excluded++;continue;}rows.push({mobile,name:String(p.name||'परिवार'),patientId:p.id});}
  rows.sort((a,b)=>a.mobile.localeCompare(b.mobile));return{rows,invalid,duplicates,excluded};
 }
 function estimate(messageCount,scheduledAt){
  const start=Math.max(now(),Date.parse(scheduledAt)),minimumSeconds=Math.max(0,messageCount-1)*intervalMs/1000;
  const earliestFinishAt=new Date(start+minimumSeconds*1000).toISOString(),day=indiaDate(Date.parse(scheduledAt)),dayEnd=Date.parse(day+'T23:59:59.999+05:30');
  const backlog=list().filter(c=>c.state==='active').reduce((n,c)=>n+c.jobs.filter(j=>['queued','sending'].includes(j.state)).length,0);
  return{messageCount,minimumSeconds,earliestFinishAt,dayEnd:new Date(dayEnd).toISOString(),fitsDay:start+minimumSeconds*1000<=dayEnd,otherPending:backlog};
 }
 function preview(input){assert();const data=inputData(input),a=audience();const fingerprint=createHash('sha256').update(JSON.stringify([data,a.rows,exclusions()])).digest('hex');return{...data,...a,count:a.rows.length,fingerprint,estimate:estimate(a.rows.length*data.channels.length,data.scheduledAt)};}
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
 function configureSMS(config){assert();gateway={apiUrl:String(config?.apiUrl||''),apiKey:String(config?.apiKey||''),deviceId:String(config?.deviceId||'')};}
 function status(){assert();return{festivals:FESTIVALS,exclusions:exclusions(),smsReady:!!(gateway?.apiUrl&&gateway.apiKey&&gateway.deviceId),campaigns:list().slice().reverse().map(c=>({...c,estimate:estimate(c.jobs.filter(j=>['queued','sending'].includes(j.state)).length,c.scheduledAt),counts:c.jobs.reduce((a,j)=>(a[j.state]=(a[j.state]||0)+1,a),{}),jobs:c.jobs}))};}
 async function tick(){
  if(busy||!allowed()||now()<nextSend)return;busy=true;
  try{
   const due=list().filter(c=>c.state==='active'&&Date.parse(c.scheduledAt)<=now());
   const eligible=new Set(audience().rows.map(p=>p.mobile));
   let selected;
   for(const c of due){if(c.date!==indiaDate(now())){for(const j of c.jobs)if(j.state==='queued')patchJob(c.id,j.id,{state:'expired',error:'त्योहार का चुना हुआ दिन समाप्त हो गया।'});continue;}for(const j of c.jobs){if(j.state!=='queued'||j.retryAt>now())continue;
    if(exclusions().includes(j.mobile)){patchJob(c.id,j.id,{state:'cancelled',error:'इस नंबर पर शुभकामनाएँ बंद हैं।'});continue;}
    if(!eligible.has(j.mobile)){patchJob(c.id,j.id,{state:'cancelled',error:'नंबर मरीज सूची से हट गया है।'});continue;}
    if(j.channel==='sms'&&!(gateway?.apiUrl&&gateway.apiKey&&gateway.deviceId))continue;
    if(j.channel==='whatsapp'&&!whatsapp.status().ready)continue;
    selected={c,j};break;
   }if(selected)break;}
   if(!selected)return;
   const {c,j}=selected;patchJob(c.id,j.id,{state:'sending',attempts:j.attempts+1,error:''});nextSend=now()+intervalMs;
   // Number lookup is asynchronous: cancel/pause/exclusion changes must be checked
   // again immediately before WhatsApp hands the message to the paired client.
   const validate=()=>{
    if(!allowed())return 'cancelled';
    const current=list().find(x=>x.id===c.id),job=current?.jobs.find(x=>x.id===j.id);
    if(!current||current.state==='cancelled'||job?.state!=='sending'||current.date!==indiaDate(now())||exclusions().includes(j.mobile)||!audience().rows.some(p=>p.mobile===j.mobile))return 'cancelled';
    return current.state==='active'?true:'wait';
   };
   let result;
   try{result=j.channel==='whatsapp'?await whatsapp.sendText(j.mobile,c.messages.whatsapp,validate):await sendSMS({...gateway,requestId:'festival-'+j.id,mobile:j.mobile,message:c.messages.sms});}
   catch{result={ok:false,uncertain:true,error:'भेजने का परिणाम अनिश्चित है; चैट/gateway जाँचें।'};}
   patchJob(c.id,j.id,{state:result.ok?'sent':result.cancelled?'cancelled':result.uncertain?'unconfirmed':result.permanent?'failed':'queued',error:result.ok?'':result.error||'कनेक्शन की प्रतीक्षा में',retryAt:now()+60000,...(result.ok?{sentAt:new Date(now()).toISOString()}:{} )});
  }finally{busy=false;}
 }
 return{preview,create,status,change,review,setExclusions,configureSMS,tick};
}
module.exports={createFestivalService,FESTIVALS,indiaDate};
