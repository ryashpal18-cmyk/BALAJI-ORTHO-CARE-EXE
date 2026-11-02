const canonicalId=(v:any)=>String(v||'').replace(/^local_/,'');
export function physioIdentity(row:any){
 let note:any={};try{note=JSON.parse(row.progress_notes||'{}');}catch{}
 const packaged=note.clinicTool===1&&['physio-package-plan','physio-package-session'].includes(note.kind)&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(canonicalId(note.billId));
 return {course:packaged?'package:'+canonicalId(note.billId):row.fracture_case_id?'case:'+canonicalId(row.fracture_case_id):'plan:'+(row.exercise_plan||''),marker:packaged&&note.kind==='physio-package-plan'};
}
