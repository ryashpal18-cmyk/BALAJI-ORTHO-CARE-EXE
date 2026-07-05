// ─────────────────────────────────────────────────────────────────────────
// Offline-aware query/mutation helpers
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { isOnline } from "./offlineSync";
import { cLog } from "@/lib/clientLogger";
import {
  cacheGetAll,
  cacheReplaceTable,
  cacheUpsertRow,
  cacheDeleteRow,
  queueAdd,
  tempId,
} from "./offlineDb";

export async function offlineFetch<T = any>(
  table: string,
  fetcher: () => Promise<T[]>,
  opts: { idField?: string } = {}
): Promise<T[]> {
  const idField = opts.idField || "id";
  const online = await isOnline();

  if (!online) {
    cLog.info("offline", `${table} — offline hai, cache se data le raha hai`);
    return (await cacheGetAll(table)) as T[];
  }

  try {
    const rows = await fetcher();
    await cacheReplaceTable(table, rows as any[], idField);
    return rows;
  } catch (err) {
    cLog.error("supabase", `${table} fetch fail — cache fallback use kar raha hai`, err);
    const cached = await cacheGetAll(table);
    if (cached.length) return cached as T[];
    throw err;
  }
}

export async function offlineFetchScoped<T = any>(
  table: string,
  fetcher: () => Promise<T[]>,
  fallbackFilter: (cachedRows: any[]) => any[],
  opts: { idField?: string } = {}
): Promise<T[]> {
  const idField = opts.idField || "id";
  const online = await isOnline();

  if (!online) {
    cLog.info("offline", `${table} scoped — offline cache se data le raha hai`);
    const cached = await cacheGetAll(table);
    return fallbackFilter(cached) as T[];
  }

  try {
    const rows = await fetcher();
    for (const row of rows as any[]) {
      if (row && row[idField] !== undefined) await cacheUpsertRow(table, row, idField);
    }
    return rows;
  } catch (err) {
    cLog.error("supabase", `${table} scoped fetch fail — cache fallback`, err);
    const cached = await cacheGetAll(table);
    const fallback = fallbackFilter(cached);
    if (fallback.length) return fallback as T[];
    throw err;
  }
}

// ── Table column whitelists — sirf ye fields Supabase ko jayenge ──────────────
const TABLE_COLUMNS: Record<string, string[]> = {
  billing: ["id", "patient_id", "service", "amount", "status", "amount_paid", "payment_mode", "created_at", "updated_at"],
  patients: ["id", "name", "mobile", "age", "address", "gender", "created_at", "updated_at"],
  fracture_cases: ["id", "patient_id", "patient_type", "body_part", "side", "fracture_type", "cause", "plaster_type", "plaster_date", "followup_days", "next_followup_date", "plaster_status", "doctor_notes", "hospital_name", "doctor_name", "referral_reason", "created_at", "updated_at"],
  fracture_xrays: ["id", "fracture_case_id", "patient_id", "file_url", "image_date", "created_at"],
  appointments: ["id", "patient_id", "date", "time", "type", "status", "notes", "created_at"],
  xray_reports: ["id", "patient_id", "report_data", "notes", "created_at"],
  medicines: ["id", "name", "quantity", "unit", "price", "low_stock_alert", "created_at", "updated_at"],
  payments: ["id", "billing_id", "amount", "payment_mode", "created_at"],
};

// Supabase ke liye payload clean karo — extra/joined fields hata do
function stripPayload(table: string, payload: any): any {
  const allowed = TABLE_COLUMNS[table];
  if (!allowed) {
    // Unknown table — sirf meta fields hata do
    const cleaned = { ...payload };
    delete cleaned._pendingSync;
    delete cleaned._localOnly;
    delete cleaned.patients;
    delete cleaned.appointments;
    return cleaned;
  }
  const cleaned: any = {};
  for (const key of allowed) {
    if (payload[key] !== undefined) cleaned[key] = payload[key];
  }
  return cleaned;
}

export async function offlineInsert(
  table: string,
  payload: any,
  opts: { idField?: string } = {}
): Promise<any> {
  const idField = opts.idField || "id";
  const online = await isOnline();

  // Supabase ke liye clean payload — joined fields/meta fields hata do
  const supabasePayload = stripPayload(table, payload);

  if (online) {
    try {
      const { data, error } = await supabase.from(table as any).insert(supabasePayload).select().single();
      if (error) throw error;
      await cacheUpsertRow(table, data, idField);
      if (table === "patients") await _updatePatientNameInBillingCache(data);
      cLog.info("online", `${table} insert OK — online Supabase mein save hua`);
      return data;
    } catch (err) {
      cLog.error("supabase", `${table} online insert fail — offline queue mein daal raha hai`, err);
      // fall through to offline path
    }
  }

  // Offline path — cache mein full payload rakho (patients name display ke liye)
  const localRow = { ...payload, [idField]: payload[idField] || tempId(), _pendingSync: true };
  await cacheUpsertRow(table, localRow, idField);
  // Queue mein sirf clean payload dalo
  await queueAdd({ table, op: "insert", payload: supabasePayload, tempId: localRow[idField] });
  if (table === "patients") await _updatePatientNameInBillingCache(localRow);
  cLog.info("offline", `${table} offline save hua — baad mein sync hoga`);
  return localRow;
}

export async function offlineUpdate(
  table: string,
  rowId: string,
  updates: any,
  opts: { idField?: string; select?: string } = {}
): Promise<any> {
  const idField = opts.idField || "id";
  const online = await isOnline();

  // Supabase ke liye clean — joined/meta fields hata do
  const supabaseUpdates = stripPayload(table, updates);

  if (online && !rowId.startsWith("local_")) {
    try {
      const { data, error } = await supabase.from(table as any).update(supabaseUpdates).eq(idField, rowId).select().single();
      if (error) throw error;
      await cacheUpsertRow(table, data, idField);
      cLog.info("online", `${table} update OK — rowId: ${rowId}`);
      return data;
    } catch (err) {
      cLog.error("supabase", `${table} online update fail — offline queue mein daal raha hai`, err);
      // fall through to offline path
    }
  }

  const cached = await cacheGetAll(table);
  const existing = cached.find((r: any) => r[idField] === rowId) || { [idField]: rowId };
  const merged = { ...existing, ...updates, _pendingSync: true };
  await cacheUpsertRow(table, merged, idField);
  await queueAdd({ table, op: "update", payload: supabaseUpdates, rowId });
  cLog.info("offline", `${table} update offline queue mein daal diya — rowId: ${rowId}`);
  return merged;
}

export async function offlineDelete(table: string, rowId: string): Promise<void> {
  const online = await isOnline();

  if (online && !rowId.startsWith("local_")) {
    try {
      const { error } = await supabase.from(table as any).delete().eq("id", rowId);
      if (error) throw error;
      await cacheDeleteRow(table, rowId);
      cLog.info("online", `${table} delete OK — rowId: ${rowId}`);
      return;
    } catch (err) {
      cLog.error("supabase", `${table} online delete fail`, err);
      // fall through to offline path
    }
  }

  await cacheDeleteRow(table, rowId);
  await queueAdd({ table, op: "delete", rowId });
  cLog.info("offline", `${table} offline delete queue mein daal diya — rowId: ${rowId}`);
}

// ── Billing cache mein patient naam inject karo ──────────────────────────
async function _updatePatientNameInBillingCache(patient: any) {
  try {
    const patientId = patient?.id;
    if (!patientId) return;
    const billingRows = await cacheGetAll("billing");
    for (const bill of billingRows) {
      if (bill.patient_id === patientId) {
        await cacheUpsertRow("billing", {
          ...bill,
          patients: {
            name: patient.name || "",
            mobile: patient.mobile || "",
            address: patient.address || "",
          },
        }, "id");
      }
    }
  } catch (err) {
    cLog.warn("cache", "Billing cache mein patient naam update fail", err);
  }
}
