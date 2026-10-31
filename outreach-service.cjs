'use strict';
const {createMessagingLog}=require('./messaging-log.cjs');
const {randomUUID,createHash}=require('crypto'),{familyNumber,normId}=require('./family-profile.cjs');
const clinic='Balaji Digital X-Ray & Ortho Care Center';
function createOutreachService({store,allowed,whatsapp,sendSMS,now=Date.now,intervalMs=30000,logger}){
 const report=createMessagingLog(logger,'outreach-service',now);
 const key='outreach:v1';let busy=false,nextSend=0,gateway=null;
 const initial=()=>({settings:{channels:['whatsapp','sms'],enabled:true},seen:[],campaigns:[]});
 const read=()=>store.metaGet(key)||initial(),save=s=>store.metaSet(key,s),assert=()=>{if(!allowed())throw Error('Administrator login required');};
 const token=(bill,r)=>normId(bill.id)+':'+r.id;
 const old=store.metaGet(key);
 if(!old){const state=initial();state.seen=store.cacheGetAll('billing').flatMap(b=>(b.payment_history||[]).map(r=>token(b,r)));save(state);}
 else {old.campaigns=old.campaigns.map(c=>({...c,jobs:c.jobs.map(j=>j.state==='sending'?{...j,state:j.channel==='sms'?'queued':'unconfirmed',error:'App बंद होने पर भेजने का परिणाम अनिश्चित था।'}:j)}));save(old);}
 const patients=()=>store.patientDirectoryRows().filter(p=>!p.deleted_at);
 function inputData(input){const ids=input?.patientIds;if(!Array.isArray(ids)||!ids.length||ids.length>100000||ids.some(x=>typeof x!=='string'))throw Error('मरीजों की सही सूची चुनें।');
  const channels=['whatsapp','sms'].filter(c=>input.channels?.includes(c));if(!channels.length)throw Error('WhatsApp या SMS चुनें।');
  const messages={};for(const ch of channels){const text=String(input[ch]||'').trim();if(!text||text.length>1500)throw Error('संदेश 1 से 1500 अक्षर का होना चाहिए।');messages[ch]=text;}
  if(!/^[a-zA-Z0-9_-]{10,100}$/.test(String(input.requestId||'')))throw Error('फिर preview खोलें।');
  return{requestId:input.requestId,patientIds:[...new Set(ids.map(normId))].sort(),channels,messages,title:String(input.title||'गाँव / चुने हुए मरीज').trim().slice(0,100)};
 }
 function previewBulk(input){assert();const data=inputData(input),selected=new Set(data.patientIds),seen=new Set(),rows=[];let invalid=0,duplicates=0;const all=patients(),allIds=new Set(all.map(p=>normId(p.id)));if(data.patientIds.some(id=>!allIds.has(id)))throw Error('मरीजों की सूची बदली है; Refresh करें।');
  const blocked=new Set(store.metaGet('festival:excluded')||[]);
  let excluded=0;for(const p of all.filter(p=>selected.has(normId(p.id)))){const mobile=familyNumber(p.mobile);if(!mobile){invalid++;continue;}if(seen.has(mobile)){duplicates++;continue;}seen.add(mobile);if(blocked.has(mobile)){excluded++;continue;}rows.push({patientId:normId(p.id),name:p.name||'परिवार',mobile});}rows.sort((a,b)=>a.mobile.localeCompare(b.mobile));
  if(rows.some(r=>data.channels.some(ch=>data.messages[ch].replace(/\[NAME\]/g,()=>r.name).length>1500)))throw Error('नाम जोड़ने के बाद संदेश लंबा हो रहा है; संदेश छोटा करें।');
  const fingerprint=createHash('sha256').update(JSON.stringify([data,rows,blocked.size?[...blocked].sort():[]])).digest('hex');return{...data,rows,count:rows.length,invalid,duplicates,excluded,fingerprint,samples:Object.fromEntries(data.channels.map(ch=>[ch,data.messages[ch].replace(/\[NAME\]/g,()=>rows[0]?.name||'मित्र')])),durationSeconds:Math.max(0,rows.length*data.channels.length-1)*intervalMs/1000};
 }
 function enqueueBulk(input){assert();const p=previewBulk(input);if(input.fingerprint!==p.fingerprint)throw Error('संदेश या नंबर बदले हैं; फिर preview देखें।');if(!p.count)throw Error('भेजने के लिए सही नंबर नहीं है।');const s=read(),same=s.campaigns.find(c=>c.kind==='bulk'&&c.fingerprint===p.fingerprint&&c.state!=='cancelled');if(same)return same.id;
  const c={id:randomUUID(),kind:'bulk',title:p.title,fingerprint:p.fingerprint,state:'active',createdAt:new Date(now()).toISOString(),jobs:p.rows.flatMap(r=>p.channels.map(channel=>({id:randomUUID(),...r,channel,message:p.messages[channel].replace(/\[NAME\]/g,()=>r.name),state:'queued',error:'',attempts:0})))};s.campaigns.push(c);save(s);return c.id;
 }
 function configureSMS(value){assert();gateway={apiUrl:String(value?.apiUrl||''),apiKey:String(value?.apiKey||''),deviceId:String(value?.deviceId||'')};}
 function setReceiptSettings(input){assert();if(typeof input?.enabled!=='boolean'||!Array.isArray(input.channels)||input.channels.some(c=>!['whatsapp','sms'].includes(c)))throw Error('सही notification settings चुनें।');if(input.enabled&&!input.channels.length)throw Error('कम से कम एक माध्यम चुनें।');const s=read();s.settings={enabled:input.enabled,channels:[...new Set(input.channels)]};if(!input.enabled)for(const c of s.campaigns.filter(c=>c.kind==='receipt'))for(const j of c.jobs)if(j.state==='queued')j.state='cancelled';save(s);return status();}
 function status(){assert();const s=read();return{settings:s.settings,smsReady:!!(gateway?.apiUrl&&gateway.apiKey&&gateway.deviceId),whatsappReady:!!whatsapp.status().ready,campaigns:s.campaigns.slice().reverse().map(c=>({...c,counts:c.jobs.reduce((a,j)=>(a[j.state]=(a[j.state]||0)+1,a),{})}))};}
 function patch(cid,jid,values){const s=read(),j=s.campaigns.find(c=>c.id===cid)?.jobs.find(j=>j.id===jid);if(j)Object.assign(j,values);save(s);}
 function change(id,action){assert();const s=read(),c=s.campaigns.find(c=>c.id===id);if(!c)throw Error('अभियान नहीं मिला।');if(action==='pause'&&c.state==='active')c.state='paused';else if(action==='resume'&&c.state==='paused')c.state='active';else if(action==='cancel'){c.state='cancelled';for(const j of c.jobs)if(j.state==='queued')j.state='cancelled';}else throw Error('कार्रवाई उपलब्ध नहीं है।');save(s);}
 function review(id,jobId,action){assert();const s=read(),j=s.campaigns.find(c=>c.id===id)?.jobs.find(j=>j.id===jobId);if(!j||!['unconfirmed','failed'].includes(j.state)||!['sent','cancel'].includes(action))throw Error('जाँच उपलब्ध नहीं है।');j.state=action==='sent'?'sent':'cancelled';j.error='';save(s);}
 function scanReceipts(){const s=read(),seen=new Set(s.seen),people=patients();let changed=false;
  for(const bill of store.cacheGetAll('billing')){let collected=0;for(const r of bill.payment_history||[]){collected+=Number(r.amount||0);const identity=token(bill,r);if(seen.has(identity))continue;seen.add(identity);changed=true;
    if(r.payment_mode==='Account Credit')continue;
    if(store.metaGet('outreach:receipt-origin:'+identity)!==true||typeof r.id!=='string'||!Number.isFinite(Date.parse(bill.created_at))||!s.settings.enabled||r.legacy||String(r.id).startsWith('reclass:')||!(Number(r.amount)>0)||!Number.isFinite(Date.parse(r.paid_at))||Date.parse(r.paid_at)<=Date.parse(bill.created_at)||['cancelled','canceled','deleted','void'].includes(String(bill.status).toLowerCase()))continue;
    const person=people.find(p=>normId(p.id)===normId(bill.patient_id)),mobile=familyNumber(person?.mobile);const remaining=Math.max(Number(bill.amount||0)-Number(bill.discount||0)-collected,0);
    const date=new Date(r.paid_at).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'});
    const message=`नमस्ते ${person?.name||'मित्र'} जी, ${date} को आपका ₹${Number(r.amount).toLocaleString('en-IN')} भुगतान जमा हुआ। बिल INV-${normId(bill.id).toUpperCase()}। इस भुगतान के बाद शेष बकाया ₹${Math.round(remaining*100)/100}। धन्यवाद — ${clinic}`;
    s.campaigns.push({id:'receipt:'+identity,kind:'receipt',title:'बकाया भुगतान पुष्टि',state:'active',createdAt:new Date(now()).toISOString(),billId:normId(bill.id),receiptId:r.id,jobs:s.settings.channels.map(channel=>({id:randomUUID(),patientId:normId(person?.id),name:person?.name||'',mobile:mobile||'',channel,message,state:mobile?'queued':'failed',error:mobile?'':'मरीज का सही मोबाइल नंबर उपलब्ध नहीं है।',attempts:0}))});
  }}if(changed){s.seen=[...seen];save(s);}
 }
 async function tick(){if(busy||!allowed())return;busy=true;
  try{scanReceipts();const state=read(),ordered=state.campaigns.filter(c=>c.state==='active').sort((a,b)=>Number(b.kind==='receipt')-Number(a.kind==='receipt'));const people=patients();let selected;
   for(const c of ordered){if(c.kind==='bulk'&&now()<nextSend)continue;for(const j of c.jobs){if(j.state!=='queued'||j.retryAt>now())continue;
    const person=people.find(p=>normId(p.id)===j.patientId);if(!person||familyNumber(person.mobile)!==j.mobile){patch(c.id,j.id,{state:'cancelled',error:'मरीज या उसका नंबर बदला है; पुराना संदेश रोका गया।'});continue;}
    if(c.kind==='bulk'&&(store.metaGet('festival:excluded')||[]).includes(j.mobile)){patch(c.id,j.id,{state:'cancelled',error:'इस नंबर पर सामूहिक संदेश बंद हैं।'});continue;}
    if(person.workflow_data?.[j.channel]===false || c.kind==='bulk' && person.workflow_data?.marketing===false){patch(c.id,j.id,{state:'cancelled',error:'मरीज की संपर्क पसंद के अनुसार संदेश रोका गया।'});continue;}
    if(j.channel==='sms'&&!(gateway?.apiUrl&&gateway.apiKey&&gateway.deviceId)||j.channel==='whatsapp'&&!whatsapp.status().ready)continue;
    selected={c,j};break;
   }if(selected)break;}if(!selected)return;
   const{c,j}=selected;patch(c.id,j.id,{state:'sending',attempts:j.attempts+1,error:''});if(c.kind==='bulk')nextSend=now()+intervalMs;
   const validate=()=>{const current=read().campaigns.find(x=>x.id===c.id);if(!current||current.state==='cancelled')return 'cancelled';if(current.state!=='active')return 'wait';const person=patients().find(p=>normId(p.id)===j.patientId);if(!person||familyNumber(person.mobile)!==j.mobile||person.workflow_data?.[j.channel]===false||c.kind==='bulk'&&person.workflow_data?.marketing===false)return 'cancelled';if(c.kind==='bulk'&&(store.metaGet('festival:excluded')||[]).includes(j.mobile))return 'cancelled';if(c.kind==='receipt'){const bill=store.cacheGetAll('billing').find(b=>normId(b.id)===c.billId);if(!bill||['cancelled','canceled','deleted','void'].includes(String(bill.status).toLowerCase())||!bill.payment_history?.some(r=>r.id===c.receiptId))return 'cancelled';}return true;};
   let result,transportFailed=false;try{result=j.channel==='whatsapp'?await whatsapp.sendText(j.mobile,j.message,validate,{jobId:j.id,campaignId:c.id,kind:c.kind||'festival',attempt:j.attempts+1}):await sendSMS({...gateway,requestId:'outreach-'+j.id,mobile:j.mobile,message:j.message});}catch(e){transportFailed=true;report('MSG-011','Campaign transport',e,{jobId:j.id,campaignId:c.id,kind:c.kind||'festival',channel:j.channel,attempt:j.attempts+1,deliveryState:'unconfirmed'});result={ok:false,uncertain:true,error:'भेजने का परिणाम अनिश्चित है; चैट/gateway जाँचें।'};}
   if(!transportFailed&&j.channel==='sms'&&!result.ok&&!result.cancelled)report('MSG-011','Campaign SMS result',result.error||'SMS gateway did not accept request',{jobId:j.id,campaignId:c.id,kind:c.kind||'festival',channel:'sms',attempt:j.attempts+1,deliveryState:result.uncertain?'unconfirmed':'queued',level:result.uncertain?'warn':undefined});
   patch(c.id,j.id,{state:result.ok?'sent':result.cancelled?'cancelled':result.uncertain?'unconfirmed':result.permanent?'failed':'queued',error:result.ok?'':result.error||'कनेक्शन की प्रतीक्षा',retryAt:now()+60000,...(result.ok?{sentAt:new Date(now()).toISOString()}: {})});
  }finally{busy=false;}
 }
 return{status,previewBulk,enqueueBulk,configureSMS,setReceiptSettings,change,review,tick};
}
module.exports={createOutreachService};
