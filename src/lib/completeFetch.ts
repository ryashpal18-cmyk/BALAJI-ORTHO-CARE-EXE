import { supabase } from "@/integrations/supabase/client";
/** A small page size also works with a server row cap below Supabase's default. */
export async function fetchCompleteTable(table: string, select = "*"): Promise<any[]> {
  const rows: any[] = [];
  const pageSize = 100;
  for (let offset = 0; ; ) {
    const { data, error } = await supabase.from(table as any).select(select).order("id", { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error(`Invalid response for ${table}`);
    rows.push(...data);
    if (data.length === 0) return rows;
    offset += data.length;
  }
}
export const OPERATIONAL_TABLES = ["patients", "billing", "appointments", "prescriptions", "physiotherapy_sessions", "beds", "xray_reports", "fracture_cases", "fracture_xrays", "hospitals", "stock_movements", "audit_logs", "insurance_claims", "branches", "booking_requests", "medicines", "medicine_entries", "invoice_medicine_mapping", "cash_book_entries", "cash_book_days", "payments", "medical_history", "report_payments", "sms_logs", "patient_medicines"];
