import { withPaymentHistory } from "./paymentLedger";
import { commitMutation } from "./offlineDb";
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

// Read/merge/write belongs to the same chain; errors reach the Save caller.
const chains = new Map<string, Promise<any>>();
function serialize<T>(key: string, action: () => Promise<T>): Promise<T> {
  const next = (chains.get(key) || Promise.resolve()).then(action, action);
  chains.set(key, next);
  next.then(() => { if (chains.get(key) === next) chains.delete(key); }, () => { if (chains.get(key) === next) chains.delete(key); });
  return next;
}
function syncLater() { void isOnline().then(online => { if (online) return runSync(); }).catch(e => cLog.warn("sync", "Background sync failed", e)); }

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
      for (const row of rows as any[]) await cacheUpsertRowFromServer(table, row, idField);
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
      .then(async (rows) => { for (const row of rows as any[]) await cacheUpsertRowFromServer(table, row, idField); })
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

export async function offlineInsert(table: string, payload: any, opts: { idField?: string } = {}) {
  const idField = opts.idField || "id";
  const rowId = payload[idField] || tempId();
  return serialize(`${table}::${rowId}`, async () => {
    let row = { created_at: new Date().toISOString(), ...payload, [idField]: rowId, _pendingSync: true };
    if (["patients", "billing", "appointments"].includes(table) && !row.branch_id) {
      const parent = row.patient_id ? await cacheGetRow("patients", row.patient_id) : null;
      const branches = (await cacheGetAll("branches")).filter(b => b.is_active);
      row.branch_id = parent?.branch_id || localStorage.getItem("bocc_selected_branch") || (branches.length === 1 ? branches[0].id : null);
      if (!row.branch_id) throw new Error("Select a branch before saving this record");
    }
    if (table === "billing") row = withPaymentHistory({ id: rowId, amount_paid: 0 }, row, tempId().slice(6), row.created_at);
    const saved = await commitMutation({ table, op: "insert", payload: row, tempId: rowId }, row, idField);
    syncLater(); return saved;
  });
}
export async function offlineUpdate(table: string, rowId: string, updates: any, opts: { idField?: string; select?: string } = {}) {
  return serialize(`${table}::${rowId}`, async () => {
    const existing = await cacheGetRow(table, rowId);
    if (!existing) throw new Error("Record not available locally; refresh before editing");
    let changes = { ...updates };
    if (table === "billing") changes = withPaymentHistory(existing, changes, tempId().slice(6), new Date().toISOString());
    const saved = await commitMutation({ table, op: "update", rowId, payload: changes }, changes, opts.idField || "id");
    syncLater(); return saved;
  });
}
export async function offlineDelete(table: string, rowId: string) {
  await serialize(`${table}::${rowId}`, () => commitMutation({ table, op: "delete", rowId }, null));
  syncLater();
}
