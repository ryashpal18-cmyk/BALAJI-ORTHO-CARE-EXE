const sorted=(v:any):any=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v??null;
export function differingFields(table:string,a:any,b:any) {
  const fields=table==='patients'?['name','mobile','registration_number','workflow_data']:table==='billing'?['amount','discount','amount_paid','status','patient_id','payment_history','workflow_data']:['status'];
  return fields.filter(k=>JSON.stringify(sorted(a[k]))!==JSON.stringify(sorted(b[k])));
}
