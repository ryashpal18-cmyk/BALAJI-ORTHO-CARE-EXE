'use strict';
const {randomUUID,createHash}=require('crypto');
const key=x=>String(x||'').replace(/^local_/,'');
const cents=n=>{n=Number(n);if(!Number.isFinite(n)||!Number.isSafeInteger(Math.round(n*100)))throw Error('सही राशि भरें');return Math.round(n*100);};
const due=b=>String(b.status).toLowerCase()==='cancelled'?0:Math.max(cents(b.amount)-cents(b.discount||0)-cents(b.amount_paid||0),0);
function financePreview(store,patientId){
 const patient=store.cacheGetAll('patients').find(p=>key(p.id)===key(patientId));if(!patient)throw Error('मरीज उपलब्ध नहीं है');
 const unique=new Map();
 for(const bill of store.cacheGetAll('billing').filter(b=>key(b.patient_id)===key(patientId))){
  const id=key(store.metaGet('alias:billing:'+bill.id)||bill.id),old=unique.get(id);
  if(old && ['amount','discount','amount_paid'].some(k=>Number(old[k]||0)!==Number(bill[k]||0)))throw Error('एक bill की local/cloud copies अलग हैं। पहले Sync और मिलान करें।');
  if(!old || !String(bill.id).startsWith('local_'))unique.set(id,bill);
 }
 const bills=[...unique.values()].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))||key(a.id).localeCompare(key(b.id)));
 const account=patient.workflow_data?.account||[];const credit=account.reduce((s,e)=>s+cents(e.amount),0);if(credit<0)throw Error('Advance ledger असंगत है; पहले जाँचें');
 const fingerprint=createHash('sha256').update(JSON.stringify([patient.workflow_data||{},bills.map(b=>[b.id,b.amount,b.discount,b.amount_paid,b.payment_history,b.status])])).digest('hex');
 return{patient,bills,credit:credit/100,due:bills.reduce((s,b)=>s+due(b),0)/100,fingerprint};
}
function financeApply(store,input,actor='Admin',ownerUserId=null){
 if(!input||!['collect','deposit','apply','refund-advance','refund-bill','cancel'].includes(input.action)||!input.requestId||!/^[0-9a-f-]{36}$/i.test(input.requestId))throw Error('Invalid finance request');
 const previous=store.metaGet('finance:done:'+input.requestId);if(previous)return previous;
 const p=financePreview(store,input.patientId);if(input.fingerprint!==p.fingerprint)throw Error('हिसाब बदल गया है। फिर preview करें।');
 const now=new Date().toISOString(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 if(store.cacheGetAll('cash_book_days').some(d=>d.entry_date===day&&d.status==='closed'))throw Error('आज का cash day पहले reopen करें');
 const amount=input.action==='cancel'?0:cents(input.amount);if(input.action!=='cancel'&&amount<=0)throw Error('राशि शून्य से अधिक हो');
 if(input.split&&input.action!=='collect')throw Error('Split केवल नई जमा में उपलब्ध है');
 const mode=input.mode||'Cash';if(!['Cash','UPI','Card','Bank Transfer'].includes(mode))throw Error('सही भुगतान माध्यम चुनें');
 if(['deposit','refund-advance'].includes(input.action)&&!['Cash','UPI'].includes(mode))throw Error('Advance के लिए Cash या UPI चुनें');
 const items=[],result={requestId:input.requestId,action:input.action,amount:amount/100,paid_at:now,patient:p.patient.name,receipts:[]};
 const patchBill=(b,delta,receiptMode)=>{
   const id=randomUUID(),history=Array.isArray(b.payment_history)?b.payment_history.map(r=>({...r})):Number(b.amount_paid)?[{id:'legacy-'+b.id,amount:Number(b.amount_paid),paid_at:b.created_at,payment_mode:b.payment_mode||'Cash',legacy:true}]:[];
   const paid=cents(b.amount_paid||0)+delta;if(paid<0)throw Error('जमा राशि से अधिक वापसी नहीं हो सकती');
   history.push({id,amount:delta/100,paid_at:now,payment_mode:receiptMode,reason:input.reason||input.action,group_id:input.requestId});
   const status=b.status==='Cancelled'?'Cancelled':paid>=cents(b.amount)-cents(b.discount||0)?'Paid':paid?'Partial':'Pending';
   const row={amount_paid:paid/100,payment_history:history,payment_mode:receiptMode,status,updated_at:now};
   items.push({mutation:{table:'billing',op:'update',rowId:b.id,expectedPaid:Number(b.amount_paid||0),payload:row},row});
   result.receipts.push({billId:b.id,id,amount:delta/100,mode:receiptMode});Object.assign(b,row);
 };
 if(['collect','apply'].includes(input.action)){
   if(amount>Math.round(p.due*100)||input.action==='apply'&&amount>Math.round(p.credit*100))throw Error('राशि उपलब्ध बकाया / advance से अधिक है');
   const eligible=input.billId?p.bills.filter(b=>key(b.id)===key(input.billId)):p.bills;
   if(amount>eligible.reduce((s,b)=>s+due(b),0))throw Error('राशि चुने हुए bills के बकाया से अधिक है');
   const cash=input.split?cents(input.split.cash):amount;if(cash<0||cash>amount)throw Error('Cash हिस्सा सही भरें');
   const parts=input.split?[{amount:cash,mode:'Cash'},{amount:amount-cash,mode:'UPI'}]:[{amount,mode:input.action==='apply'?'Account Credit':mode}];
   for(const payment of parts){let remaining=payment.amount;for(const b of eligible){const part=Math.min(remaining,due(b));if(part){patchBill(b,part,payment.mode);remaining-=part;}if(!remaining)break;}}

 } else if(input.action==='refund-bill'){
   if(!String(input.reason||'').trim())throw Error('वापसी का कारण लिखें');
   const bill=p.bills.find(b=>key(b.id)===key(input.billId));if(!bill||amount>cents(bill.amount_paid||0))throw Error('सही bill और वापसी की राशि चुनें');patchBill(bill,-amount,mode);
 } else if(input.action==='cancel'){
   const bill=p.bills.find(b=>key(b.id)===key(input.billId));if(!bill||Number(bill.amount_paid)>0||!String(input.reason||'').trim())throw Error('Cancel से पहले जमा रकम वापस करें और कारण लिखें');
   const row={status:'Cancelled',workflow_data:{...bill.workflow_data,cancel_reason:input.reason,cancelled_at:now},updated_at:now};items.push({mutation:{table:'billing',op:'update',rowId:bill.id,expectedPaid:0,payload:row},row});
 }
 if(['deposit','apply','refund-advance'].includes(input.action)){
   if(input.action==='refund-advance'&&(amount>Math.round(p.credit*100)||!String(input.reason||'').trim()))throw Error('सही वापसी राशि और कारण भरें');
   const event={id:input.requestId,amount:(input.action==='deposit'?amount:-amount)/100,kind:input.action,mode,paid_at:now,reason:String(input.reason||'')};
   const row={workflow_data:{...p.patient.workflow_data,account:[...(p.patient.workflow_data?.account||[]),event]},updated_at:now};
   items.push({mutation:{table:'patients',op:'update',rowId:p.patient.id,expectedWorkflow:p.patient.workflow_data||{},payload:row},row});
   if(input.action!=='apply'){
     const id=randomUUID(),refund=input.action==='refund-advance';
     const row={id,entry_date:day,entry_type:mode==='UPI'?'upi_in':refund?'expense':'cash_in',amount:(refund&&mode==='UPI'?-amount:amount)/100,party_name:p.patient.name,note:'Advance '+input.action+' · '+input.requestId,created_by:actor,created_at:now};
     items.push({mutation:{table:'cash_book_entries',op:'insert',tempId:id,payload:row},row});
   }
 }
 const audit={id:randomUUID(),actor_name:actor,actor_role:'admin',action:'update',module:'billing',record_id:p.patient.id,description:JSON.stringify(result),created_at:now};items.push({mutation:{table:'audit_logs',op:'insert',tempId:audit.id,payload:audit},row:audit});
 if(items.length>450)throw Error('एक बार में कम bills चुनें');
 store.commitFinance(items,input.requestId,result,ownerUserId);return result;
}
module.exports={financePreview,financeApply};
