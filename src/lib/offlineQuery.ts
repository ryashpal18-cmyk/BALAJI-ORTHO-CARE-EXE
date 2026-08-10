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
  queueGetAll,
  queueUpdate,
  tempId,
} from "./offlineDb";

// ── Per-row persistence chain ──────────────────────────────────────────
// Insert/Update ab UI ko turant return karte hain. Ye chain sirf isliye
// hai taaki agar user insert ke turant baad (milliseconds me) edit kare,
// to background writes sahi order me hi hon — race condition na ho.
const _rowPersistChain = new Map<string, Promise<any>>();
function chainPersist(key: string, fn: () => Promise<any>) {
  const prev = _rowPersistChain.get(key) || Promise.resolve();
  const next = prev.then(fn, fn).catch((err) => cLog.error("offline", `persist chain fail — ${key}`, err));
  _rowPersistChain.set(key, next);
  return next;
}

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
  const localRow = { ...payload, [idField]: payload[idField] || tempId(), _pendingSync: true };
  const key = `${table}::${localRow[idField]}`;

  // 🚀 Fire-and-forget: caller ko turant localRow milta hai, kabhi network
  // ka wait nahi. Asli SQLite/queue write background chain me hoti hai
  // (chainPersist se — taaki insert ke turant baad edit aaye to order sahi rahe).
  chainPersist(key, async () => {
    await cacheUpsertRow(table, localRow, idField);
    await queueAdd({ table, op: "insert", payload: localRow, tempId: localRow[idField] });
    if (table === "patients") await _updatePatientNameInBillingCache(localRow);
    cLog.info("offline", `${table} local save hua (background) — sync trigger`);
    if (await isOnline()) runSync();
  });

  return localRow;
}

export async function offlineUpdate(
  table: string,
  rowId: string,
  updates: any,
  opts: { idField?: string; select?: string } = {}
): Promise<any> {
  const idField = opts.idField || "id";
  const key = `${table}::${rowId}`;

  // 🚀 PERF: cacheGetRow() seedha us ek row ko SQLite PRIMARY KEY lookup se
  // laata hai — O(1) index hit, poori table nahi.
  const existing = (await cacheGetRow(table, rowId)) || { [idField]: rowId };
  const merged = { ...existing, ...updates, _pendingSync: true };

  // 🚀 Fire-and-forget: turant merged row return, background me persist.
  chainPersist(key, async () => {
    await cacheUpsertRow(table, merged, idField);

    // 🚨 FIX: row abhi bhi "local_" hai = queue me iska ek pending "insert"
    // already baitha hai. Alag "update" queue karne ke bajaye us insert ke
    // payload ME HI naya data merge karo — sync ke time Supabase ko sirf EK
    // final insert jaayega, koi blank duplicate row nahi banegi.
    if (rowId.startsWith("local_")) {
      const queue = await queueGetAll();
      const pendingInsert = queue.find((m) => m.table === table && m.op === "insert" && m.tempId === rowId);
      if (pendingInsert && pendingInsert.id !== undefined) {
        await queueUpdate(pendingInsert.id, { payload: { ...pendingInsert.payload, ...updates } });
        cLog.info("offline", `${table} pending insert (${rowId}) me update merge ho gaya`);
      } else {
        // pending insert nahi mila (rare case) — fallback normal update,
        // jise applyMutation() ka PENDING_PARENT_INSERT retry ab bhi handle karega
        await queueAdd({ table, op: "update", payload: updates, rowId });
      }
    } else {
      await queueAdd({ table, op: "update", payload: updates, rowId });
    }
    cLog.info("offline", `${table} local update hua (background) — rowId: ${rowId}`);
    if (await isOnline()) runSync();
  });

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
