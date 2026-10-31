'use strict';
const {randomUUID,createHash}=require('crypto');
const key=x=>String(x||'').replace(/^local_/,'');
const tables=['billing','appointments','prescriptions','physiotherapy_sessions','xray_reports','fracture_cases','fracture_xrays','beds','insurance_claims','patient_medicines','medical_history'];
function mergePreview(store,sourceId,targetId){
 const people=store.cacheGetAll('patients'),source=people.find(p=>key(p.id)===key(sourceId)),target=people.find(p=>key(p.id)===key(targetId));
 if(!source||!target||key(source.id)===key(target.id)||source.branch_id!==target.branch_id)throw Error('एक branch के दो अलग records चुनें');
 const mobile=p=>String(p.mobile||'').replace(/\D/g,'').slice(-10),name=p=>String(p.name||'').trim().toLocaleLowerCase();
 if(!mobile(source)||mobile(source)!==mobile(target)||name(source)!==name(target))throw Error('नाम और मोबाइल दोनों समान होने पर ही merge उपलब्ध है। परिवार के अलग सदस्य नहीं जोड़ेंगे।');
 if(source.workflow_data?.merged_into||target.workflow_data?.merged_into)throw Error('पहले से merged record है');
 const rows=tables.flatMap(table=>store.cacheGetAll(table).filter(r=>key(r.patient_id)===key(source.id)).map(row=>({table,row})));
 if(rows.length>440)throw Error('इस मरीज में अधिक records हैं; अलग migration जाँच चाहिए');
 const fingerprint=createHash('sha256').update(JSON.stringify([source,target,rows])).digest('hex');
 return{source,target,rows,fingerprint,count:rows.length};
}
function mergeApply(store,input,actor='Admin',owner=null){
 const previous=store.metaGet('finance:done:'+input.requestId);if(previous)return previous;
 const p=mergePreview(store,input.sourceId,input.targetId);if(p.fingerprint!==input.fingerprint||input.confirm!==p.target.registration_number)throw Error('दोबारा preview करें और सही target BAOR नंबर भरें');
 const sourceAccount=p.source.workflow_data?.account||[],targetAccount=p.target.workflow_data?.account||[],seen=new Map(targetAccount.map(e=>[e.id,e]));
 for(const e of sourceAccount){if(seen.has(e.id)&&JSON.stringify(seen.get(e.id))!==JSON.stringify(e))throw Error('Advance history conflict');seen.set(e.id,e);}
 const preferences=Object.fromEntries(['sms','whatsapp','marketing'].filter(k=>p.source.workflow_data?.[k]===false||p.target.workflow_data?.[k]===false).map(k=>[k,false]));
 const now=new Date().toISOString(),items=p.rows.map(({table,row})=>{const patch={patient_id:p.target.id};return{mutation:{table,op:'update',rowId:row.id,expectedPatient:row.patient_id,...(table==='billing'?{expectedPaid:Number(row.amount_paid||0),expectedBill:Object.fromEntries(['amount','discount','amount_paid','status','patient_id','payment_history'].map(k=>[k,row[k]??null]))}:{}),payload:patch},row:patch};});
 for(const [person,data]of [[p.source,{...p.source.workflow_data,archived:true,merged_into:p.target.id,account:[]}],[p.target,{...p.target.workflow_data,...preferences,account:[...seen.values()]}]]){const patch={workflow_data:data,updated_at:now};items.push({mutation:{table:'patients',op:'update',rowId:person.id,expectedWorkflow:person.workflow_data||{},payload:patch},row:patch});}
 const audit={id:randomUUID(),actor_name:actor,actor_role:'admin',action:'update',module:'patients',record_id:p.source.id,description:JSON.stringify({source:p.source.id,target:p.target.id,records:p.count,operation:'merge'}),created_at:now};items.push({mutation:{table:'audit_logs',op:'insert',tempId:audit.id,payload:audit},row:audit});
 const result={requestId:input.requestId,count:p.count,targetId:p.target.id};store.commitFinance(items,input.requestId,result,owner);return result;
}
module.exports={mergePreview,mergeApply};
