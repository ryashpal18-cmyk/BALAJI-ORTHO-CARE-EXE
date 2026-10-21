'use strict';
const {familyLink,normId} = require('./family-profile.cjs');
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function invoiceDocument(bill, patient, qr) {
  const numbers = [bill.amount, bill.discount ?? 0, bill.amount_paid ?? 0].map(Number);
  if (!numbers.every(n=>Number.isFinite(n)&&n>=0) || numbers[1]>numbers[0]) throw Error('Bill amounts need correction');
  const [gross,discount,paid] = numbers, due=Math.max(0,gross-discount-paid);
  if (!/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(qr)) throw Error('QR image unavailable');
  const money = n => '₹'+n.toLocaleString('en-IN',{maximumFractionDigits:2});
  const services=String(bill.service||'Service').split('|').map((s,i)=>{const parts=s.split(':');const amount=Number(parts.at(-1));return `<tr><td>${i+1}</td><td>${escape(parts.length>1?parts.slice(0,-1).join(':'):s)}</td><td>${parts.length>1&&Number.isFinite(amount)?money(amount):''}</td></tr>`;}).join('');
  const date = new Date(bill.created_at), dateText=Number.isFinite(date.getTime())?date.toLocaleDateString('en-IN'):'';
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:14px 'Segoe UI',Arial,sans-serif;color:#19334b;margin:0}header{padding:20px;background:#163e60;color:white;border-radius:10px}h1{font-size:22px;margin:0 0 8px}h2{font-size:18px}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{padding:10px;border-bottom:1px solid #dbe3eb;text-align:left}td:last-child,th:last-child{text-align:right}.totals{margin-left:auto;width:55%}.qr{display:flex;align-items:center;gap:20px;padding:16px;background:#f0f6fa;border-radius:10px}.muted{color:#546a7e;font-size:12px}</style></head><body>
  <header><h1>Balaji Digital X-Ray &amp; Ortho Care Center</h1><div>Bill / Payment statement</div></header>
  <h2>${escape(patient.name)}</h2><div>Mobile: ${escape(patient.mobile)} · Patient ID: ${escape(normId(patient.id))}</div>
  <p>Bill: ${escape(normId(bill.id))}<br>Date: ${escape(dateText)}</p><table><thead><tr><th>#</th><th>Service</th><th>Amount</th></tr></thead><tbody>${services}</tbody></table>
  <table class="totals"><tr><td>कुल बिल</td><td>${money(gross)}</td></tr><tr><td>Discount</td><td>${money(discount)}</td></tr><tr><td>जमा</td><td>${money(paid)}</td></tr><tr><th>बकाया</th><th>${money(due)}</th></tr></table>
  <div class="qr"><img src="${qr}" width="128" height="128" alt="Clinic family profile QR"><div><strong>Family Profile QR</strong><p>Clinic software में login के बाद खोलें।</p><p class="muted">इस QR से records सार्वजनिक नहीं होते।<br>${escape(familyLink(patient.id))}</p></div></div></body></html>`;
}
module.exports={invoiceDocument};
