import {escapeHtml} from './safeReportHtml';
export const PRESCRIPTION_DOCTOR_NAME='Dr. S. S. Rathore';
// Matches the final clinic letterpad supplied by the clinic.
export const PRESCRIPTION_DOCTOR_QUALIFICATION='BPT, MPT, DMRT';
export type PrescriptionPrintInput={
 patient:{name:string;registration_number?:string|null;mobile?:string|null;age?:number|null;gender?:string|null};
 diagnosis:string;medicines:{name:string;dose:string;duration:string}[];advice:string;followupDate:string;date:string;
};
const dateText=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('/'):'—';
export function buildPrescriptionHtml(input:PrescriptionPrintInput):string{
 const p=input.patient,esc=escapeHtml;
 const medicines=input.medicines.filter(m=>m.name.trim());
 const rows=medicines.map((m,i)=>`<tr><td>${i+1}</td><td>${esc(m.name)}</td><td>${esc(m.dose||'—')}</td><td>${esc(m.duration||'—')}</td></tr>`).join('');
 return `<!doctype html><html lang="hi"><head><meta charset="utf-8"><title>Prescription</title><style>
 @page{size:A4;margin:12mm}*{box-sizing:border-box}html{background:white;color:#172f46}body{margin:0;font:14px Arial,'Nirmala UI',sans-serif;line-height:1.5}header{border-bottom:2px solid #075b8b;padding-bottom:12px;text-align:center}h1{font-size:24px;color:#075b8b;margin:0 0 5px}p{margin:3px 0}h2{font-size:16px;color:#075b8b;margin:20px 0 6px;break-after:avoid}.patient{margin:16px 0;padding:12px;border:1px solid #bed5e5;border-radius:6px;break-inside:avoid}.patient strong{font-size:18px}.details{display:flex;flex-wrap:wrap;gap:4px 20px}.text{white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #c7d6e2;text-align:left;vertical-align:top;padding:9px;overflow-wrap:anywhere}th{background:#edf5fa}thead{display:table-header-group}tr{break-inside:avoid}.followup{margin-top:22px;break-inside:avoid}.signature{text-align:right;margin-top:35px;break-inside:avoid}.muted{color:#52687a}@media screen{body{width:186mm;margin:12mm}}
 </style></head><body><header><h1>Balaji Ortho Care Center</h1><p>${esc(PRESCRIPTION_DOCTOR_NAME)} · ${esc(PRESCRIPTION_DOCTOR_QUALIFICATION)}</p><p class="muted">Orthopedic &amp; Physiotherapy Consultant</p></header>
 <section class="patient"><strong>${esc(p.name)}</strong><div class="details"><span>Reg. No.: ${esc(p.registration_number||'उपलब्ध नहीं')}</span><span>Date: ${esc(dateText(input.date))}</span></div><div class="details"><span>Age: ${esc(p.age==null?'—':String(p.age)+' years')}</span><span>Sex: ${esc(p.gender||'—')}</span><span>Mobile: ${esc(p.mobile||'—')}</span></div></section>
 ${input.diagnosis.trim()?`<h2>Diagnosis</h2><div class="text">${esc(input.diagnosis)}</div>`:''}
 ${rows?`<h2>Medicines / दवाइयाँ</h2><table><colgroup><col style="width:7%"><col style="width:43%"><col style="width:25%"><col style="width:25%"></colgroup><thead><tr><th>#</th><th>Medicine</th><th>Dose</th><th>Duration</th></tr></thead><tbody>${rows}</tbody></table>`:''}
 ${input.advice.trim()?`<h2>Advice / Instructions</h2><div class="text">${esc(input.advice)}</div>`:''}
 ${input.followupDate?`<p class="followup"><strong>Next follow-up:</strong> ${esc(dateText(input.followupDate))}</p>`:''}
 <div class="signature">${esc(PRESCRIPTION_DOCTOR_NAME)}<br><span class="muted">${esc(PRESCRIPTION_DOCTOR_QUALIFICATION)}</span></div></body></html>`;
}
