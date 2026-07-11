// ─────────────────────────────────────────────────────────────────────────
// Offline-aware query/mutation helpers
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { isOnline, runSync } from "./offlineSync";
import { cLog } from "@/lib/clientLogger";
import {
  cacheGetAll,
  cacheGetRow,
  cacheReplaceTable,
  cacheUpsertRow,
  cacheUpsertRowFromServer,
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
  const cached = (await cacheGetAll(table)) as T[];
  const online = typeof navigator !== "undefined" ? navigator.onLine : false;

  // 🚨 FIX: Agar local cache khaali hai (naya build/fresh install/IndexedDB
  // reset hui), to sirf khaali cache dikhate rehna galat hai jab net available
  // hai aur asli data Supabase pe maujood hai. Aise mein turant online se le
  // aao (thoda wait sahi hai, kyunki dikhane ke liye kuch hai hi nahi abhi).
  if (cached.length === 0 && online) {
    try {
      const rows = await fetcher();
      await cacheReplaceTable(table, rows as any[], idField);
      return rows;
    } catch (err) {
      cLog.warn("offline", `${table} — cache khaali thi aur online fetch bhi fail — khaali return kar rahe hain`, err);
      return cached;
    }
  }

  // ✅ Cache mein pehle se data hai — turant wahi do (fast), aur online ho to
  // background mein silently fresh data le aao (is call ka wait nahi karna).
  if (online) {
    fetcher()
      .then((rows) => cacheReplaceTable(table, rows as any[], idField))
      .catch((err) => cLog.warn("offline", `${table} background refresh fail — cache use ho raha hai`, err));
  }

  return cached;
}

export async function offlineFetchScoped<T = any>(
  table: string,
  fetcher: () => Promise<T[]>,
  fallbackFilter: (cachedRows: any[]) => any[],
  opts: { idField?: string } = {}
): Promise<T[]> {
  const idField = opts.idField || "id";
  const cached = await cacheGetAll(table);
  const online = typeof navigator !== "undefined" ? navigator.onLine : false;

  // 🚨 FIX: khaali cache + online = seedha fetch karo, khaali mat dikhao
  if (cached.length === 0 && online) {
    try {
      const rows = await fetcher();
      for (const row of rows as any[]) {
        if (row && row[idField] !== undefined) await cacheUpsertRowFromServer(table, row, idField);
      }
      return rows;
    } catch (err) {
      cLog.warn("offline", `${table} scoped — cache khaali thi aur online fetch bhi fail`, err);
      return fallbackFilter(cached) as T[];
    }
  }

  const scoped = fallbackFilter(cached) as T[];

  if (online) {
    fetcher()
      .then(async (rows) => {
        for (const row of rows as any[]) {
          if (row && row[idField] !== undefined) await cacheUpsertRowFromServer(table, row, idField);
        }
      })
      .catch((err) => cLog.warn("offline", `${table} scoped background refresh fail`, err));
  }

  return scoped;
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
  // 🚀 PERF: pehle yahan cacheGetAll(table) + array.find() hota tha — matlab
  // EK row update karne ke liye poori table (saare rows, JSON.parse sabka)
  // IPC se main process se laate the. 50k+ patients pe ye har edit/save par
  // dhीre ho jaata. cacheGetRow() seedha us ek row ko _key (table::rowId) se
  // SQLite PRIMARY KEY lookup karta hai — O(1) index hit, poori table nahi.
  const existing = (await cacheGetRow(table, rowId)) || { [idField]: rowId };
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
