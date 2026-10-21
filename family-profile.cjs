'use strict';
const normId = value => String(value || '').replace(/^local_/, '');
function familyNumber(value) {
  let number = String(value || '').replace(/\D/g, '');
  if (number.length === 11 && number.startsWith('0')) number = number.slice(1);
  if (number.length === 12 && number.startsWith('91')) number = number.slice(2);
  return /^[6-9]\d{9}$/.test(number) && !/^(\d)\1{9}$/.test(number) ? number : null;
}
function familyLink(id) {
  const value = normId(id);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw Error('Invalid patient reference');
  return 'balajiclinic://family/' + value;
}
function parseFamilyLink(value) {
  if(typeof value!=='string')return null;
  return value.match(/^balajiclinic:\/\/family\/([a-zA-Z0-9_-]{1,100})$/)?.[1] || null;
}

function uniqueRows(rows) {
  const seen=new Set();return [...rows].sort((a,b)=>Number(!!b._pendingSync)-Number(!!a._pendingSync)||Number(String(a.id).startsWith('local_'))-Number(String(b.id).startsWith('local_'))).filter(row=>{const id=normId(row.id);if(!id||seen.has(id))return false;seen.add(id);return true;});
}
function familyMembers(patients, anchorId) {
  patients=uniqueRows(patients);
  const anchor = patients.find(p => normId(p.id) === normId(anchorId));
  if (!anchor) return [];
  const mobile = familyNumber(anchor.mobile), seen = new Set();
  return patients.filter(p => mobile ? familyNumber(p.mobile) === mobile : normId(p.id) === normId(anchor.id)).filter(p => {const id=normId(p.id); if(seen.has(id))return false;seen.add(id);return true;});
}
module.exports = { normId, familyNumber, familyLink, parseFamilyLink, familyMembers };
function familyGroups(patients){
  const groups=new Map();
  for(const p of uniqueRows(patients)){const key=familyNumber(p.mobile)||'patient:'+normId(p.id);if(!groups.has(key))groups.set(key,{id:p.id,mobile:familyNumber(p.mobile),members:[]});const group=groups.get(key);if(!group.members.some(m=>normId(m.id)===normId(p.id)))group.members.push(p);}
  return [...groups.values()];
}
function familyRecords(store,id){
  const members=familyMembers(store.cacheGetAll('patients'),id);
  const bills=uniqueRows(store.cacheGetAll('billing')),reports=uniqueRows(store.cacheGetAll('xray_reports')),images=uniqueRows(store.cacheGetAll('fracture_xrays')),cases=uniqueRows(store.cacheGetAll('fracture_cases'));
  return members.map(patient=>({patient,bills:bills.filter(b=>normId(b.patient_id)===normId(patient.id)),xrays:[...reports,...images].filter(r=>normId(r.patient_id)===normId(patient.id)||cases.some(c=>normId(c.id)===normId(r.fracture_case_id)&&normId(c.patient_id)===normId(patient.id)))}));
}
module.exports.familyGroups=familyGroups;module.exports.familyRecords=familyRecords;
