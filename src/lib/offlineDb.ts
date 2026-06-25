// ─────────────────────────────────────────────────────────────────────────
// Offline-first data engine (IndexedDB cache + mutation sync queue)
// ─────────────────────────────────────────────────────────────────────────

import { cLog } from "@/lib/clientLogger";

const DB_NAME    = "balaji_ortho_offline_db";
const DB_VERSION = 1;

const CACHE_STORE = "table_cache";
const QUEUE_STORE = "mutation_queue";
const META_STORE  = "meta";

export type QueuedMutation = {
  id?: number;
  table: string;
  op: "insert" | "update" | "delete" | "sms" | "xray_upload";
  payload?: any;
  rowId?: string;
  tempId?: string;
  selectAfter?: string;
  createdAt: string;
  retries: number;
  lastError?: string;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CACHE_STORE))
        db.createObjectStore(CACHE_STORE, { keyPath: "_key" });
      if (!db.objectStoreNames.contains(QUEUE_STORE))
        db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains(META_STORE))
        db.createObjectStore(META_STORE, { keyPath: "key" });
    };
    req.onsuccess = () => {
      cLog.info("indexeddb", "Database successfully khul gayi");
      resolve(req.result);
    };
    req.onerror = () => {
      cLog.error("indexeddb", "Database kholne mein fail", req.error);
      reject(req.error);
    };
  });
  return dbPromise;
}

function tx(db: IDBDatabase, stores: string[], mode: IDBTransactionMode) {
  return db.transaction(stores, mode);
}

function reqToPromise<T = any>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror  = () => reject(req.error);
  });
}

// ─── Cache ───────────────────────────────────────────────────────────────

export async function cacheGetAll(table: string): Promise<any[]> {
  try {
    const db    = await openDb();
    const t     = tx(db, [CACHE_STORE], "readonly");
    const all: any[] = await reqToPromise(t.objectStore(CACHE_STORE).getAll());
    const prefix = `${table}::`;
    return all.filter((r) => typeof r._key === "string" && r._key.startsWith(prefix)).map((r) => r.data);
  } catch (err) {
    cLog.error("indexeddb", `${table} cache read fail`, err);
    return [];
  }
}

export async function cacheSetRows(table: string, rows: any[], idField = "id") {
  if (!rows || !rows.length) return;
  try {
    const db    = await openDb();
    const t     = tx(db, [CACHE_STORE], "readwrite");
    const store = t.objectStore(CACHE_STORE);
    for (const row of rows) {
      const rowId = row[idField];
      if (rowId === undefined || rowId === null) continue;
      store.put({ _key: `${table}::${rowId}`, data: row });
    }
    await new Promise((res, rej) => { t.oncomplete = () => res(true); t.onerror = () => rej(t.error); });
  } catch (err) {
    cLog.error("indexeddb", `${table} cacheSetRows fail`, err);
  }
}

export async function cacheReplaceTable(table: string, rows: any[], idField = "id") {
  try {
    const db    = await openDb();
    const t     = tx(db, [CACHE_STORE], "readwrite");
    const store = t.objectStore(CACHE_STORE);
    const all: any[] = await reqToPromise(store.getAll());
    const prefix = `${table}::`;
    for (const r of all.filter((r) => r._key.startsWith(prefix))) store.delete(r._key);
    for (const row of rows) {
      const rowId = row[idField];
      if (rowId === undefined || rowId === null) continue;
      store.put({ _key: `${table}::${rowId}`, data: row });
    }
    await new Promise((res, rej) => { t.oncomplete = () => res(true); t.onerror = () => rej(t.error); });
    cLog.info("indexeddb", `${table} cache replace — ${rows.length} rows save ho gayi`);
  } catch (err) {
    cLog.error("indexeddb", `${table} cacheReplaceTable fail`, err);
  }
}

export async function cacheUpsertRow(table: string, row: any, idField = "id") {
  try {
    const db    = await openDb();
    const t     = tx(db, [CACHE_STORE], "readwrite");
    const rowId = row[idField];
    t.objectStore(CACHE_STORE).put({ _key: `${table}::${rowId}`, data: row });
    await new Promise((res, rej) => { t.oncomplete = () => res(true); t.onerror = () => rej(t.error); });
  } catch (err) {
    cLog.error("indexeddb", `${table} cacheUpsertRow fail`, err);
  }
}

export async function cacheDeleteRow(table: string, rowId: string) {
  try {
    const db = await openDb();
    const t  = tx(db, [CACHE_STORE], "readwrite");
    t.objectStore(CACHE_STORE).delete(`${table}::${rowId}`);
    await new Promise((res, rej) => { t.oncomplete = () => res(true); t.onerror = () => rej(t.error); });
  } catch (err) {
    cLog.error("indexeddb", `${table} cacheDeleteRow fail — rowId: ${rowId}`, err);
  }
}

export async function cacheReplaceRowKey(table: string, oldId: string, newRow: any, idField = "id") {
  try {
    const db    = await openDb();
    const t     = tx(db, [CACHE_STORE], "readwrite");
    const store = t.objectStore(CACHE_STORE);
    store.delete(`${table}::${oldId}`);
    store.put({ _key: `${table}::${newRow[idField]}`, data: newRow });
    await new Promise((res, rej) => { t.oncomplete = () => res(true); t.onerror = () => rej(t.error); });
    cLog.info("indexeddb", `${table} temp key replace — ${oldId} → ${newRow[idField]}`);
  } catch (err) {
    cLog.error("indexeddb", `${table} cacheReplaceRowKey fail`, err);
  }
}

// ─── Mutation Queue ───────────────────────────────────────────────────────

export async function queueAdd(mutation: Omit<QueuedMutation, "id" | "createdAt" | "retries">): Promise<number> {
  try {
    const db    = await openDb();
    const t     = tx(db, [QUEUE_STORE], "readwrite");
    const store = t.objectStore(QUEUE_STORE);
    const full: QueuedMutation = { ...mutation, createdAt: new Date().toISOString(), retries: 0 };
    const id    = await reqToPromise<number>(store.add(full));
    await new Promise((res, rej) => { t.oncomplete = () => res(true); t.onerror = () => rej(t.error); });
    cLog.info("queue", `Queue mein add hua — op: ${mutation.op}, table: ${mutation.table}`);
    notifyQueueChanged();
    return id;
  } catch (err) {
    cLog.error("queue", `queueAdd fail — op: ${mutation.op}, table: ${mutation.table}`, err);
    return -1;
  }
}

export async function queueGetAll(): Promise<QueuedMutation[]> {
  try {
    const db = await openDb();
    const t  = tx(db, [QUEUE_STORE], "readonly");
    return reqToPromise(t.objectStore(QUEUE_STORE).getAll());
  } catch (err) {
    cLog.error("queue", "queueGetAll fail", err);
    return [];
  }
}

export async function queueRemove(id: number) {
  try {
    const db = await openDb();
    const t  = tx(db, [QUEUE_STORE], "readwrite");
    t.objectStore(QUEUE_STORE).delete(id);
    await new Promise((res, rej) => { t.oncomplete = () => res(true); t.onerror = () => rej(t.error); });
    notifyQueueChanged();
  } catch (err) {
    cLog.error("queue", `queueRemove fail — id: ${id}`, err);
  }
}

export async function queueUpdate(id: number, patch: Partial<QueuedMutation>) {
  try {
    const db    = await openDb();
    const t     = tx(db, [QUEUE_STORE], "readwrite");
    const store = t.objectStore(QUEUE_STORE);
    const existing = await reqToPromise<QueuedMutation>(store.get(id));
    if (existing) store.put({ ...existing, ...patch });
    await new Promise((res, rej) => { t.oncomplete = () => res(true); t.onerror = () => rej(t.error); });
    if (patch.lastError) {
      cLog.warn("queue", `Retry ${patch.retries}/${8} — id: ${id}, error: ${patch.lastError}`);
    }
  } catch (err) {
    cLog.error("queue", `queueUpdate fail — id: ${id}`, err);
  }
}

export async function queueCount(): Promise<number> {
  const all = await queueGetAll();
  return all.length;
}

// ─── Meta ─────────────────────────────────────────────────────────────────

export async function metaGet(key: string): Promise<any> {
  try {
    const db = await openDb();
    const t  = tx(db, [META_STORE], "readonly");
    const r  = await reqToPromise<any>(t.objectStore(META_STORE).get(key));
    return r ? r.value : undefined;
  } catch (err) {
    cLog.error("indexeddb", `metaGet fail — key: ${key}`, err);
    return undefined;
  }
}

export async function metaSet(key: string, value: any) {
  try {
    const db = await openDb();
    const t  = tx(db, [META_STORE], "readwrite");
    t.objectStore(META_STORE).put({ key, value });
    await new Promise((res, rej) => { t.oncomplete = () => res(true); t.onerror = () => rej(t.error); });
  } catch (err) {
    cLog.error("indexeddb", `metaSet fail — key: ${key}`, err);
  }
}

// ─── Queue change listeners ───────────────────────────────────────────────

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

export function onQueueChange(fn: Listener) {
  listeners.add(fn);
  queueCount().then(fn);
  return () => listeners.delete(fn);
}

function notifyQueueChanged() {
  queueCount().then((c) => listeners.forEach((fn) => fn(c)));
}

export function tempId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
