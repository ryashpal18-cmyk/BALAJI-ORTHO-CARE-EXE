// ─────────────────────────────────────────────────────────────────────────
// Offline-aware query/mutation helpers
//
// Ye file har table ke liye generic "cache-first, network-refresh" read aur
// "queue-if-offline, sync-later" write logic deti hai. useDatabase.ts aur
// useOrtho.ts ke andar saare hooks isi par bante hain — taaki har page
// automatically offline-capable ho jaye, bina alag-alag jagah dohrana.
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

/**
 * Offline-first list fetch: returns cached rows immediately if offline /
 * on error, otherwise fetches fresh rows, caches them, and returns them.
 *
 * `fetcher` should run the real Supabase query and return the raw rows
 * (already including any joined relations) exactly as the UI expects them.
 */
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
    // Cache replace only makes sense for plain table snapshots; callers that
    // pass filtered/joined queries still benefit from caching the rows they
    // got (keyed by id), so other filtered views can read a superset later.
    await cacheReplaceTable(table, rows as any[], idField);
    return rows;
  } catch (err) {
    // Network blip mid-request — fall back to whatever is cached so the UI
    // still shows usable data instead of an error screen.
    const cached = await cacheGetAll(table);
    if (cached.length) return cached as T[];
    throw err;
  }
}

/**
 * Like offlineFetch, but for queries scoped to a subset (e.g. "today's
 * appointments"). Caches results into the same per-table cache (upsert,
 * not full replace) so cache stays a superset across different filtered
 * views, and falls back to client-side filtering of the cache when offline.
 */
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

/**
 * Offline-first insert: tries Supabase directly when online. When offline
 * (or the request fails), saves the row locally with a temp id and queues
 * it for background sync — UI gets an immediate, usable row either way.
 */
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
      await cacheUpsertRow(table, data, idField);
      return data;
    } catch (err) {
      // fall through to offline path below so the user's work isn't lost
    }
  }

  const localRow = { ...payload, [idField]: payload[idField] || tempId(), _pendingSync: true };
  await cacheUpsertRow(table, localRow, idField);
  await queueAdd({ table, op: "insert", payload: localRow, tempId: localRow[idField] });
  return localRow;
}

/**
 * Offline-first update: tries Supabase directly when online; otherwise
 * patches the cached row locally and queues the update for later sync.
 */
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

/**
 * Offline-first delete: tries Supabase directly when online; otherwise
 * removes the row from local cache and queues the delete for later sync.
 */
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
