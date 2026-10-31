'use strict';
const crypto=require('crypto');
const {normId}=require('./family-profile.cjs');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=cents=>'₹'+(cents/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
function cents(value,label){const n=Number(value??0);const result=Math.round(n*100);if(!Number.isFinite(n)||n<0||!Number.isSafeInteger(result))throw Error('STATEMENT-002: '+label+' में गलत राशि है; bill ठीक करके फिर statement निकालें।');return result;}
function signedCents(value){const n=Number(value);const result=Math.round(n*100);if(!Number.isFinite(n)||!Number.isSafeInteger(result))return null;return result;}
function add(a,b){const n=a+b;if(!Number.isSafeInteger(n))throw Error('STATEMENT-002: Amount exceeds supported range');return n;}
function date(value){const d=new Date(value);return value&&Number.isFinite(d.getTime())?d.toLocaleDateString('en-IN'):'तारीख उपलब्ध नहीं';}
function buildStatement({patient,bills,lastSyncAt},now=Date.now()){
  if(!patient?.id)throw Error('STATEMENT-001: मरीज इस PC पर उपलब्ध नहीं है।');
  const warnings=[],excluded=[],rows=[],payments=[];
  // Main store resolves legacy aliases; latest pending row takes precedence over a server alias.
  const unique=new Map();
  for(const b of [...bills].sort((a,b)=>Number(!!b._pendingSync)-Number(!!a._pendingSync)||Number(String(a.id).startsWith('local_'))-Number(String(b.id).startsWith('local_'))))if(!unique.has(normId(b._statementId||b.id)))unique.set(normId(b._statementId||b.id),b);
  for(const b of [...unique.values()].sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||''))||normId(a.id).localeCompare(normId(b.id)))){
    if(['cancelled','canceled','void','deleted'].includes(String(b.status||'').trim().toLowerCase())){excluded.push({id:normId(b._statementId||b.id),status:b.status});continue;}
    const gross=cents(b.amount,'Bill total'),discount=cents(b.discount,'Discount'),paid=cents(b.amount_paid,'Paid amount');
    if(discount>gross)throw Error('STATEMENT-002: Discount bill total से अधिक है।');
    const net=gross-discount,due=Math.max(net-paid,0),credit=Math.max(paid-net,0),id=normId(b._statementId||b.id);
    if(!id)throw Error('STATEMENT-002: Bill reference missing');
    rows.push({id,date:b.created_at||null,service:String(b.service||'Service'),gross,discount,net,paid,due,credit,pending:!!b._pendingSync});
    if(Array.isArray(b.payment_history)){
      let ledger=0;const seen=new Set();let invalid=false;
      for(const r of b.payment_history){
        const amount=signedCents(r?.amount);
        if(amount===null||!r?.id||seen.has(r.id)){invalid=true;continue;}seen.add(r.id);ledger=add(ledger,amount);
        payments.push({id:String(r.id),billId:id,amount,date:r.legacy?null:r.paid_at||null,mode:String(r.payment_mode||'Not recorded'),legacy:!!r.legacy});
      }
      if(invalid||ledger!==paid)warnings.push('INV-'+id.toUpperCase()+': अलग receipt history अधूरी/असंगत है; totals में bill की जमा राशि ली गई है।');
    }else if(paid){payments.push({id:'legacy-'+id,billId:id,amount:paid,date:null,mode:String(b.payment_mode||'Not recorded'),legacy:true});}
  }
  const totals=rows.reduce((t,r)=>{for(const key of ['gross','discount','net','paid','due','credit'])t[key]=add(t[key],r[key]);return t;},{gross:0,discount:0,net:0,paid:0,due:0,credit:0});
  payments.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||a.id.localeCompare(b.id));
  let wallet=0;const account=(patient.workflow_data?.account||[]).map(e=>{const amount=signedCents(e.amount);if(amount===null)throw Error('STATEMENT-002: Advance ledger amount invalid');wallet=add(wallet,amount);return{...e,amount,balance:wallet};});
  const result={wallet,account,patient:{id:normId(patient.id),name:String(patient.name||''),mobile:String(patient.mobile||'')},rows,payments,totals,warnings,excluded,pending:rows.filter(r=>r.pending).length,lastSyncAt:lastSyncAt||null};
  // Generation time is deliberately excluded: the same data revision must not be sent twice.
  const revision={wallet,account,patient:result.patient,rows:rows.map(({pending,...row})=>row),payments,totals,warnings,excluded};
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify(revision)).digest('hex');
  return {...result,fingerprint,generatedAt:new Date(now).toISOString(),scope:'इस PC पर उपलब्ध इस मरीज के सभी bills; family members का हिसाब अलग है।'};
}
function statementForPatient(store,id,now=Date.now()) {return buildStatement(store.patientStatementRows(id),now);}
function statementSummary(s){return{patient:s.patient,billCount:s.rows.length,paymentCount:s.payments.length,totals:s.totals,wallet:s.wallet||0,warnings:s.warnings,pending:s.pending,excluded:s.excluded.length,fingerprint:s.fingerprint,scope:s.scope,generatedAt:s.generatedAt};}
function statementDocument(s){
  const inv=id=>'INV-'+String(id).toUpperCase();
  const rows=s.rows.map(r=>`<tr><td>${escape(date(r.date))}</td><td class="reference">${escape(inv(r.id))}<div class="service">${escape(r.service)}</div></td>${['gross','discount','net','paid','due'].map(k=>`<td class="amount">${money(r[k])}</td>`).join('')}</tr>`).join('');
  const payments=s.payments.map(r=>`<tr><td>${escape(date(r.date))}${r.legacy?'<div class="muted">पुराना संयुक्त जमा; अलग तारीख उपलब्ध नहीं</div>':''}</td><td class="reference">${escape(inv(r.billId))}<div class="muted">Receipt: ${escape(r.id)}</div></td><td>${escape(r.mode)}</td><td class="amount">${money(r.amount)}</td></tr>`).join('');
  return `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>Patient Statement</title><style>
  @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:12px 'Segoe UI',Arial,sans-serif;color:#18364c;margin:0}header{background:#173f60;color:white;padding:17px;border-radius:8px}h1{font-size:21px;margin:0 0 6px}h2{font-size:17px;margin:20px 0 10px}p{line-height:1.6}.muted,.service{font-size:10px;color:#546b7b}.summary{display:flex;gap:10px;margin:16px 0}.summary>div{flex:1;border:1px solid #d8e3ec;padding:10px;border-radius:6px}.summary strong{display:block;font-size:18px;margin-top:7px}.due{background:#fff4e8}table{width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th,td{text-align:left;padding:7px 5px;border-bottom:1px solid #dbe5ed;vertical-align:top;overflow-wrap:anywhere}th{background:#edf3f7}.amount{text-align:right;white-space:nowrap}.reference{overflow-wrap:anywhere}.note{padding:10px;background:#fff8e9;border:1px solid #edcf89;margin:12px 0;white-space:pre-wrap}.footer{margin-top:18px;border-top:1px solid #d8e3ec;padding-top:9px;font-size:10px;color:#546b7b}</style></head><body>
  <header><h1>Balaji Digital X-Ray &amp; Ortho Care Center</h1><div>Patient Account Statement / मरीज का पूरा हिसाब</div></header>
  <h2>${escape(s.patient.name)}</h2><p>Mobile: ${escape(s.patient.mobile||'Not recorded')}<br>Patient ID: ${escape(s.patient.id)}<br>Statement date: ${escape(new Date(s.generatedAt).toLocaleString('en-IN'))}</p>
  <div class="summary"><div>Discount के बाद कुल<strong>${money(s.totals.net)}</strong></div><div>कुल जमा<strong>${money(s.totals.paid)}</strong></div><div class="due">कुल बकाया<strong>${money(s.totals.due)}</strong></div></div>
  <p class="muted">कुल bill: ${s.rows.length} · कुल मूल राशि: ${money(s.totals.gross)} · कुल discount: ${money(s.totals.discount)}${s.totals.credit?' · अतिरिक्त जमा: '+money(s.totals.credit)+' (दूसरे bill में अपने आप समायोजित नहीं)':''}</p>
  <p>उपलब्ध Advance: ${money(s.wallet||0)}</p><h2>Advance जमा / उपयोग / वापसी</h2><table><thead><tr><th>Date / Ref</th><th>कार्रवाई / कारण</th><th>माध्यम</th><th>रकम</th><th>Balance</th></tr></thead><tbody>${(s.account||[]).map(e=>`<tr><td>${escape(date(e.paid_at))}<br>${escape(e.id)}</td><td>${escape(e.kind)}<br>${escape(e.reason)}</td><td>${escape(e.kind==='apply'?'Account Credit':e.mode)}</td><td>${money(e.amount)}</td><td>${money(e.balance)}</td></tr>`).join('')||'<tr><td colspan="5">Advance का कोई transaction नहीं है</td></tr>'}</tbody></table><h2>सभी Bills</h2><table><colgroup><col style="width:13%"><col style="width:27%">${'<col style="width:12%">'.repeat(5)}</colgroup><thead><tr><th>Date</th><th>Bill / Service</th><th class="amount">Total</th><th class="amount">Discount</th><th class="amount">Net</th><th class="amount">Paid</th><th class="amount">Due</th></tr></thead><tbody>${rows||'<tr><td colspan="7">इस PC पर इस मरीज का कोई सक्रिय bill उपलब्ध नहीं है।</td></tr>'}</tbody></table>
  <h2>जमा Payments / Receipt History</h2><table><colgroup><col style="width:22%"><col style="width:40%"><col style="width:20%"><col style="width:18%"></colgroup><thead><tr><th>Date</th><th>Bill / Receipt</th><th>Payment mode</th><th class="amount">Amount</th></tr></thead><tbody>${payments||'<tr><td colspan="4">अलग भुगतान रिकॉर्ड उपलब्ध नहीं है।</td></tr>'}</tbody></table>
  ${s.warnings.length?'<div class="note">Receipt history review:\n'+s.warnings.map(escape).join('\n')+'</div>':''}
  ${s.excluded.length?'<div class="note">रद्द/void/deleted bills totals में शामिल नहीं हैं: '+s.excluded.map(r=>escape(inv(r.id)+' ('+r.status+')')).join(', ')+'</div>':''}
  <div class="footer">${escape(s.scope)}<br>${s.pending?'इनमें '+s.pending+' bill(s) cloud sync के लिए pending हैं।':'Cloud और दूसरे devices के साथ पूरी समानता इस report से verify नहीं होती।'}<br>Legacy जमा को नए payment की तरह न जोड़ें। Mode correction/refund entries में negative राशि भी हो सकती है।<br>Statement reference: ${escape(s.fingerprint.slice(0,16))} · यह account summary है; नई payment receipt नहीं।</div>${s.totals.due>0?'<section style="break-before:page;text-align:center"><h1>Payment on QR</h1><img style="width:105mm;height:auto" alt="Balaji Clinic Google Pay payment QR" src="data:image/png;base64,'+require('fs').readFileSync(require('path').join(__dirname,'src/assets/payment-qr.png')).toString('base64')+'"><p>भुगतान के बाद क्लिनिक से रसीद लें।</p></section>':''}</body></html>`;
}
module.exports={buildStatement,statementForPatient,statementSummary,statementDocument,money};
