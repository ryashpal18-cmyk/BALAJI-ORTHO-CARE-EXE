// ─────────────────────────────────────────────────────────────────────────
// Offline-aware query/mutation helpers
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { isOnline } from "./offlineSync";
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
    return (await cacheGetAll(table)) as T[];
  }

  try {
    const rows = await fetcher();
    await cacheReplaceTable(table, rows as any[], idField);
    return rows;
  } catch (err) {
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
    const cached = await cacheGetAll(table);
    const fallback = fallbackFilter(cached);
    if (fallback.length) return fallback as T[];
    throw err;
  }
}

export async function offlineInsert(
  table: string,
  payload: any,
  opts: { idField?: string } = {}
): Promise<any> {
  const idField = opts.idField || "id";
  const online = await isOnline();

  if (online) {
    try {
      const { data, error } = await supabase.from(table as any).insert(payload).select().single();
      if (error) throw error;

      // ✅ FIX: Agar patient insert hua to billing cache mein bhi patient naam update karo
      await cacheUpsertRow(table, data, idField);
      if (table === "patients") {
        await _updatePatientNameInBillingCache(data);
      }

      return data;
    } catch (err) {
      // fall through to offline path
    }
  }

  const localRow = { ...payload, [idField]: payload[idField] || tempId(), _pendingSync: true };
  await cacheUpsertRow(table, localRow, idField);
  await queueAdd({ table, op: "insert", payload: localRow, tempId: localRow[idField] });

  // ✅ FIX: Offline patient insert pe bhi billing cache update karo
  if (table === "patients") {
    await _updatePatientNameInBillingCache(localRow);
  }

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

  if (online && !rowId.startsWith("local_")) {
    try {
      const { data, error } = await supabase.from(table as any).update(updates).eq(idField, rowId).select().single();
      if (error) throw error;
      await cacheUpsertRow(table, data, idField);
      return data;
    } catch (err) {
      // fall through to offline path
    }
  }

  const cached = await cacheGetAll(table);
  const existing = cached.find((r: any) => r[idField] === rowId) || { [idField]: rowId };
  const merged = { ...existing, ...updates, _pendingSync: true };
  await cacheUpsertRow(table, merged, idField);
  await queueAdd({ table, op: "update", payload: updates, rowId });
  return merged;
}

export async function offlineDelete(table: string, rowId: string): Promise<void> {
  const online = await isOnline();

  if (online && !rowId.startsWith("local_")) {
    try {
      const { error } = await supabase.from(table as any).delete().eq("id", rowId);
      if (error) throw error;
      await cacheDeleteRow(table, rowId);
      return;
    } catch (err) {
      // fall through to offline path
    }
  }

  await cacheDeleteRow(table, rowId);
  await queueAdd({ table, op: "delete", rowId });
}

// ─────────────────────────────────────────────────────────────────────────
// ✅ HELPER: Billing cache mein patient naam inject karo
// Jab bhi naya patient aaye — cached billing rows mein uska naam daal do
// taaki offline billing mein naam dikh sake
// ─────────────────────────────────────────────────────────────────────────
async function _updatePatientNameInBillingCache(patient: any) {
  try {
    const patientId = patient?.id;
    if (!patientId) return;

    const billingRows = await cacheGetAll("billing");
    for (const bill of billingRows) {
      if (bill.patient_id === patientId) {
        // billing row mein patients joined object inject karo
        const updatedBill = {
          ...bill,
          patients: {
            name: patient.name || "",
            mobile: patient.mobile || "",
            address: patient.address || "",
          },
        };
        await cacheUpsertRow("billing", updatedBill, "id");
      }
    }
  } catch {
    // helper failure kabhi UI rok nahi sakta
  }
}
