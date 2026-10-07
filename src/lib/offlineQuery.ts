import { queryClient } from "./queryClient";
import { withPaymentHistory } from "./paymentLedger";
import { commitMutation } from "./offlineDb";
import { ensureCloudSession } from "./localSession";
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

const refreshes = new Set<string>();
const refreshedAt = new Map<string, number>();
function refreshLocalTable(table: string, fetcher: () => Promise<any[]>, idField: string) {
  if (typeof navigator === "undefined" || !navigator.onLine || refreshes.has(table) || Date.now() - (refreshedAt.get(table) || 0) < 3000) return;
  refreshes.add(table);
  void (async () => {
    try {
      if (!(await ensureCloudSession())) return;
      const before = JSON.stringify(await cacheGetAll(table));
      const rows = await fetcher();
      for (const row of rows) if (row?.[idField] !== undefined) await cacheUpsertRowFromServer(table, row, idField);
      refreshedAt.set(table, Date.now());
      if (before !== JSON.stringify(await cacheGetAll(table))) void queryClient.invalidateQueries();
    } catch (error) { cLog.warn("offline", `${table}: background refresh delayed; local data retained`, error); }
    finally { refreshes.delete(table); }
  })();
}
export async function offlineFetch<T = any>(table: string, fetcher: () => Promise<T[]>, opts: { idField?: string } = {}): Promise<T[]> {
  const cached = await cacheGetAll(table);
  refreshLocalTable(table, fetcher, opts.idField || "id");
  return cached as T[];
}
export async function offlineFetchScoped<T = any>(table: string, fetcher: () => Promise<T[]>, fallbackFilter: (rows: any[]) => any[], opts: { idField?: string } = {}): Promise<T[]> {
  const cached = await cacheGetAll(table);
  refreshLocalTable(table, fetcher, opts.idField || "id");
  return fallbackFilter(cached) as T[];
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
