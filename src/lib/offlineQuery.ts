// ─────────────────────────────────────────────────────────────────────────
// Offline-aware query/mutation helpers
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { isOnline, runSync } from "./offlineSync";
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

export async function offlineInsert(
  table: string,
  payload: any,
  opts: { idField?: string } = {}
): Promise<any> {
  const idField = opts.idField || "id";

  // ✅ HAMESHA local-first — chahe net ho ya na ho, turant IndexedDB mein
  // save hota hai (instant, kabhi network ka wait nahi). Net ho to turant
  // background mein cloud sync trigger ho jaata hai (non-blocking).
  const localRow = { ...payload, [idField]: payload[idField] || tempId(), _pendingSync: true };
  await cacheUpsertRow(table, localRow, idField);
  await queueAdd({ table, op: "insert", payload: localRow, tempId: localRow[idField] });
  if (table === "patients") await _updatePatientNameInBillingCache(localRow);
  cLog.info("offline", `${table} local save hua (instant) — background sync trigger`);

  isOnline().then((online) => { if (online) runSync(); });

  return localRow;
}

export async function offlineUpdate(
  table: string,
  rowId: string,
  updates: any,
  opts: { idField?: string; select?: string } = {}
): Promise<any> {
  const idField = opts.idField || "id";

  // ✅ HAMESHA local-first
  const cached = await cacheGetAll(table);
  const existing = cached.find((r: any) => r[idField] === rowId) || { [idField]: rowId };
  const merged = { ...existing, ...updates, _pendingSync: true };
  await cacheUpsertRow(table, merged, idField);
  await queueAdd({ table, op: "update", payload: updates, rowId });
  cLog.info("offline", `${table} local update hua (instant) — background sync trigger — rowId: ${rowId}`);

  isOnline().then((online) => { if (online) runSync(); });

  return merged;
}

export async function offlineDelete(table: string, rowId: string): Promise<void> {
  // ✅ HAMESHA local-first
  await cacheDeleteRow(table, rowId);
  await queueAdd({ table, op: "delete", rowId });
  cLog.info("offline", `${table} local delete hua (instant) — background sync trigger — rowId: ${rowId}`);

  isOnline().then((online) => { if (online) runSync(); });
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
