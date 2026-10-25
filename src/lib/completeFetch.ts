import { supabase } from "@/integrations/supabase/client";
const schemaCooldown=new Map<string,{until:number;error:any}>();
export function resetCloudSchemaBackoff(){schemaCooldown.clear();}
function missingSchema(error:any){return ['PGRST202','PGRST204','PGRST205','42P01','42703'].includes(error?.code)||/could not find.*schema cache|relation .*does not exist/i.test(error?.message||'');}
/** Complete scalar pages also work when a legacy server has no patient relationship. */
export async function fetchCompleteTable(table:string,select="*"):Promise<any[]>{
 const paused=schemaCooldown.get(table);
 if(paused&&paused.until>Date.now())throw Object.assign(new Error(paused.error.message),{code:paused.error.code,cachedSchemaFailure:true});
 const rows:any[]=[],pageSize=100;let columns=select;
 try{
  for(let offset=0;;){
   let result=await supabase.from(table as any).select(columns).order("id",{ascending:true}).range(offset,offset+pageSize-1);
   if(result.error&&['PGRST200','PGRST201'].includes(result.error.code)&&columns.includes('patients(')){
    columns=columns.replace(/,?\s*patients\([^)]*\)/g,'').trim()||'*';
    result=await supabase.from(table as any).select(columns).order("id",{ascending:true}).range(offset,offset+pageSize-1);
   }
   if(result.error)throw result.error;
   if(!Array.isArray(result.data))throw Error(`Invalid response for ${table}`);
   rows.push(...result.data);if(!result.data.length){schemaCooldown.delete(table);return rows;}offset+=result.data.length;
  }
 }catch(error:any){if(missingSchema(error))schemaCooldown.set(table,{until:Date.now()+30*60*1000,error});throw error;}
}
export const OPERATIONAL_TABLES = ["patients", "billing", "appointments", "prescriptions", "physiotherapy_sessions", "beds", "xray_reports", "fracture_cases", "fracture_xrays", "hospitals", "stock_movements", "audit_logs", "insurance_claims", "branches", "booking_requests", "medicines", "medicine_entries", "invoice_medicine_mapping", "cash_book_entries", "cash_book_days", "payments", "medical_history", "report_payments", "sms_logs", "patient_medicines", "doctors"];
