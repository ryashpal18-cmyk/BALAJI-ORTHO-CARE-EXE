'use strict';
const crypto=require('crypto');
const {buildStatement,money}=require('./patient-statement.cjs');
const {normId}=require('./family-profile.cjs');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function day(value){if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;const d=new Date(value);if(!value||!Number.isFinite(d.getTime()))return '';return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function monthKey(value=Date.now()){return day(value).slice(0,7);}
function validMonth(value){if(typeof value!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value))throw Error('MONTHLY-001: सही महीना चुनें।');return value;}
function shiftMonth(month,delta){validMonth(month);const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);}
function readyMonths(start,now,limit=12){validMonth(start);const date=day(now);let end=shiftMonth(monthKey(now),-1);const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hourCycle:'h23'}).format(new Date(now)));if(date.endsWith('-01')&&hour<9)end=shiftMonth(end,-1);const result=[];for(let m=start;m<=end&&result.length<Math.min(limit,1200);m=shiftMonth(m,1))result.push(m);return result;}
function buildMonthly({patients,bills},month,now=Date.now()){
  validMonth(month);if(month>monthKey(now))throw Error('MONTHLY-001: भविष्य का महीना नहीं चुन सकते।');
  const rows=[],receipts=[],warnings=[],billRows=[];
  const grouped=new Map(patients.map(p=>[normId(p.id),{patient:p,bills:[]}]));
  for(const b of bills){const id=normId(b.patient_id);if(!grouped.has(id)){grouped.set(id,{patient:{id:id||'missing-patient',name:'Patient record उपलब्ध नहीं',mobile:''},bills:[]});warnings.push('कुछ bills का patient record इस PC पर नहीं मिला।');}grouped.get(id).bills.push(b);}
  let undatedPaid=0,cancelledBills=0,pending=0,unallocatedPaid=0;
  for(const {patient,bills:sourceItems} of grouped.values()){
    const selected=new Map();for(const b of [...sourceItems].sort((a,b)=>Number(!!b._pendingSync)-Number(!!a._pendingSync)||Number(String(a.id).startsWith('local_'))-Number(String(b.id).startsWith('local_')))){const id=normId(b._statementId||b.id);if(!selected.has(id))selected.set(id,b);}const items=[...selected.values()];
    if(!items.length)continue;
    // Validate/derive detailed receipts even for cancelled bills: a cancellation is not proof of refund.
    const all=buildStatement({patient,bills:items.map(b=>({...b,status:''}))},now);
    const cancelled=new Set(items.filter(b=>['cancelled','canceled','void','deleted'].includes(String(b.status||'').trim().toLowerCase())).map(b=>normId(b._statementId||b.id)));
    const active=all.rows.filter(b=>!cancelled.has(b.id));cancelledBills+=cancelled.size;pending+=active.filter(b=>b.pending).length;
    const monthlyBills=active.filter(b=>monthKey(b.date)===month),monthlyReceipts=all.payments.filter(p=>monthKey(p.date)===month);
    const unknown=all.payments.filter(p=>!day(p.date)).reduce((n,p)=>n+p.amount,0);
    const gap=all.totals.paid-all.payments.reduce((n,p)=>n+p.amount,0);
    undatedPaid+=unknown;unallocatedPaid+=gap;
    const row={patientId:all.patient.id,name:all.patient.name,mobile:all.patient.mobile,monthBillCount:monthlyBills.length,monthNet:monthlyBills.reduce((n,b)=>n+b.net,0),received:monthlyReceipts.reduce((n,p)=>n+p.amount,0),currentDue:active.reduce((n,b)=>n+b.due,0),currentCredit:active.reduce((n,b)=>n+b.credit,0),undatedPaid:unknown,unallocatedPaid:gap,cancelledReceiptAmount:monthlyReceipts.filter(p=>cancelled.has(p.billId)).reduce((n,p)=>n+p.amount,0)};
    if(monthlyBills.length||monthlyReceipts.length||row.currentDue||row.currentCredit||unknown||gap)rows.push(row);
    for(const b of monthlyBills){const {pending:pendingFlag,...financial}=b;billRows.push({...financial,patientId:all.patient.id,name:all.patient.name});}
    for(const p of monthlyReceipts)receipts.push({...p,patientId:all.patient.id,name:all.patient.name,cancelledBill:cancelled.has(p.billId)});
    warnings.push(...all.warnings);
  }
  rows.sort((a,b)=>a.name.localeCompare(b.name)||a.patientId.localeCompare(b.patientId));
  receipts.sort((a,b)=>String(a.date).localeCompare(String(b.date))||a.billId.localeCompare(b.billId)||a.id.localeCompare(b.id));
  billRows.sort((a,b)=>String(a.date).localeCompare(String(b.date))||a.id.localeCompare(b.id));
  const totals=rows.reduce((t,r)=>{for(const k of ['monthNet','received','currentDue','currentCredit']){t[k]+=r[k];if(!Number.isSafeInteger(t[k]))throw Error('MONTHLY-002: Amount exceeds supported range');}return t;},{monthNet:0,received:0,currentDue:0,currentCredit:0});
  const byMode=Object.create(null);for(const p of receipts)byMode[p.mode]=(byMode[p.mode]||0)+p.amount;
  if(undatedPaid||unallocatedPaid)warnings.push('अलग तारीख के बिना पुरानी जमा/असंगत ledger रकम किसी महीने की प्राप्ति में अनुमान से नहीं जोड़ी गई है।');
  if(receipts.some(p=>p.cancelledBill))warnings.push('रद्द bill पर दर्ज receipts प्राप्ति में दिखती हैं; bill cancel होना refund का प्रमाण नहीं है।');
  const result={month,rows,receipts,bills:billRows,totals,byMode,undatedPaid,unallocatedPaid,cancelledBills,pending,warnings:[...new Set(warnings)],asOf:new Date(now).toISOString(),partial:month===monthKey(now)};
  const {asOf,pending:pendingCount,...revision}=result;result.fingerprint=crypto.createHash('sha256').update(JSON.stringify(revision)).digest('hex');return result;
}
function monthlyForStore(store,month,now=Date.now()){return buildMonthly(store.monthlyAccountRows(),month,now);}
function monthlySummary(r){return{month:r.month,totals:r.totals,patientCount:r.rows.length,billCount:r.bills.length,receiptCount:r.receipts.length,byMode:r.byMode,undatedPaid:r.undatedPaid,unallocatedPaid:r.unallocatedPaid,warnings:r.warnings,pending:r.pending,asOf:r.asOf,partial:r.partial,fingerprint:r.fingerprint};}
function monthlyDocument(r){const date=v=>day(v)||'तारीख उपलब्ध नहीं';return `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Monthly Clinic Account</title><style>@page{size:A4;margin:13mm}body{font:11px 'Segoe UI',Arial,sans-serif;color:#17354c}header{background:#173f60;color:white;padding:17px;border-radius:8px}h1{font-size:20px;margin:0}h2{font-size:16px;margin:20px 0 10px}table{width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}td,th{padding:7px 4px;border-bottom:1px solid #dbe5ed;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#edf3f7}.amount{text-align:right}.summary{display:flex;gap:10px;margin:16px 0}.summary div{flex:1;padding:10px;border:1px solid #cddce7}.summary strong{display:block;font-size:17px;margin-top:6px}.note{background:#fff7df;padding:10px;white-space:pre-wrap}.muted{font-size:9px;color:#5e7180}</style></head><body><header><h1>Balaji Digital X-Ray &amp; Ortho Care Center</h1><p>मासिक हिसाब / Monthly Account — ${esc(r.month)}${r.partial?' (चालू महीना — आंशिक)':''}</p></header>
  <p>Report बनी: ${esc(new Date(r.asOf).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}))} IST</p>
  <div class="summary"><div>महीने के bills का Net<strong>${money(r.totals.monthNet)}</strong></div><div>महीने की प्राप्ति / Net entries<strong>${money(r.totals.received)}</strong></div><div>वर्तमान कुल बकाया<strong>${money(r.totals.currentDue)}</strong></div></div>
  <p class="note">प्राप्ति केवल इस महीने की उपलब्ध dated receipts से है—पुराने bills पर इस महीने जमा रकम भी शामिल है। बकाया report बनने के समय सभी सक्रिय bills का है; यह महीने के अंत का ऐतिहासिक balance नहीं है। यह bank settlement verification नहीं है।</p>
  <h2>मरीजवार हिसाब</h2><table><colgroup><col style="width:31%"><col style="width:23%"><col style="width:23%"><col style="width:23%"></colgroup><thead><tr><th>मरीज / नंबर</th><th class="amount">महीने के bill Net</th><th class="amount">महीने में प्राप्त</th><th class="amount">वर्तमान बकाया</th></tr></thead><tbody>${r.rows.map(p=>`<tr><td>${esc(p.name)}<br>${esc(p.mobile||'नंबर उपलब्ध नहीं')}<div class="muted">ID: ${esc(p.patientId)}</div></td><td class="amount">${money(p.monthNet)}</td><td class="amount">${money(p.received)}</td><td class="amount">${money(p.currentDue)}${p.currentCredit?'<div class="muted">अतिरिक्त जमा '+money(p.currentCredit)+'</div>':''}</td></tr>`).join('')||'<tr><td colspan="4">उपलब्ध records में कोई संबंधित entry नहीं है।</td></tr>'}</tbody></table>
  <h2>महीने की Receipts / Payments</h2><table><thead><tr><th>Date / मरीज</th><th>Bill / Receipt</th><th>माध्यम</th><th class="amount">रकम</th></tr></thead><tbody>${r.receipts.map(p=>`<tr><td>${esc(date(p.date))}<br>${esc(p.name)}</td><td>INV-${esc(p.billId.toUpperCase())}<div class="muted">${esc(p.id)}${p.cancelledBill?' · Cancelled bill':''}</div></td><td>${esc(p.mode)}</td><td class="amount">${money(p.amount)}</td></tr>`).join('')||'<tr><td colspan="4">इस महीने की dated receipts उपलब्ध नहीं हैं।</td></tr>'}</tbody></table>
  <h2>महीने के Bills</h2><table><thead><tr><th>Date / मरीज</th><th>Bill / Service</th><th class="amount">Gross</th><th class="amount">Discount</th><th class="amount">Net</th></tr></thead><tbody>${r.bills.map(b=>`<tr><td>${esc(date(b.date))}<br>${esc(b.name)}</td><td>INV-${esc(b.id.toUpperCase())}<div class="muted">${esc(b.service)}</div></td><td class="amount">${money(b.gross)}</td><td class="amount">${money(b.discount)}</td><td class="amount">${money(b.net)}</td></tr>`).join('')||'<tr><td colspan="5">इस महीने के सक्रिय bills उपलब्ध नहीं हैं।</td></tr>'}</tbody></table>
  <h2>माध्यमवार Net Entries</h2><p>${Object.entries(r.byMode).map(([k,v])=>esc(k)+': '+money(v)).join(' · ')||'—'}</p>
  <p>अज्ञात तारीख की पुरानी जमा: ${money(r.undatedPaid)} · Ledger से न मिल सकी जमा: ${money(r.unallocatedPaid)} · रद्द bills: ${r.cancelledBills} · Sync-pending bills: ${r.pending}</p>
  ${r.warnings.length?'<div class="note">'+r.warnings.map(esc).join('\n')+'</div>':''}<p class="muted">सिर्फ इस PC के उपलब्ध records। दूसरे devices/cloud की पूरी समानता verify नहीं है। Negative correction/reclassification entries भी net में शामिल हैं। Patients के नाम और नंबर वाली यह clinic account report है। Ref: ${esc(r.fingerprint.slice(0,16))}</p></body></html>`;}
module.exports={monthKey,validMonth,shiftMonth,readyMonths,buildMonthly,monthlyForStore,monthlySummary,monthlyDocument};
