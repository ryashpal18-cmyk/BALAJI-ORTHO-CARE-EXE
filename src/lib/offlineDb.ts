// ─────────────────────────────────────────────────────────────────────────
// Offline-first data engine (IndexedDB cache + mutation sync queue)
//
// Sab data IndexedDB me cache hota hai. Internet na ho to wahi se padhega
// aur likhega (queue me daal dega). Jab internet wapas aaye to background
// me automatic Supabase ke saath sync ho jata hai.
// ─────────────────────────────────────────────────────────────────────────

const DB_NAME = "balaji_ortho_offline_db";
const DB_VERSION = 1;

const CACHE_STORE = "table_cache";   // key: `${table}::${rowId}`  value: row data
const QUEUE_STORE  = "mutation_queue"; // key: auto-increment        value: queued mutation
const META_STORE   = "meta";          // key: string                value: any (e.g. last sync time per table)

export type QueuedMutation = {
  id?: number;
  table: string;
  op: "insert" | "update" | "delete" | "sms" | "xray_upload";
  // For insert/update: payload to send. For delete: not needed (rowId is enough).
  payload?: any;
  rowId?: string;          // primary key value (real or temp)
  tempId?: string;         // if this row was created offline, its temp id
  selectAfter?: string;    // select string to use on insert/update (kept simple, optional)
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
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: "_key" });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db: IDBDatabase, stores: string[], mode: IDBTransactionMode) {
  return db.transaction(stores, mode);
}

function reqToPromise<T = any>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

// ─── Cache: store / read rows per table ───

export async function cacheGetAll(table: string): Promise<any[]> {
  const db = await openDb();
  const t = tx(db, [CACHE_STORE], "readonly");
  const store = t.objectStore(CACHE_STORE);
  const all: any[] = await reqToPromise(store.getAll());
  const prefix = `${table}::`;
  return all
    .filter((r) => typeof r._key === "string" && r._key.startsWith(prefix))
    .map((r) => r.data);
}

export async function cacheSetRows(table: string, rows: any[], idField = "id") {
  if (!rows || !rows.length) return;
  const db = await openDb();
  const t = tx(db, [CACHE_STORE], "readwrite");
  const store = t.objectStore(CACHE_STORE);
  for (const row of rows) {
    const rowId = row[idField];
    if (rowId === undefined || rowId === null) continue;
    store.put({ _key: `${table}::${rowId}`, data: row });
  }
  await new Promise((res, rej) => {
    t.oncomplete = () => res(true);
    t.onerror = () => rej(t.error);
  });
}

export async function cacheReplaceTable(table: string, rows: any[], idField = "id") {
  // Replace entire cached snapshot for a table (used after a successful full fetch),
  // but keep any rows that are still pending in the sync queue (not yet synced).
  const db = await openDb();
  const t = tx(db, [CACHE_STORE], "readwrite");
  const store = t.objectStore(CACHE_STORE);
  const all: any[] = await reqToPromise(store.getAll());
  const prefix = `${table}::`;
  const existingKeys = all.filter((r) => r._key.startsWith(prefix)).map((r) => r._key);
  for (const key of existingKeys) store.delete(key);
  for (const row of rows) {
    const rowId = row[idField];
    if (rowId === undefined || rowId === null) continue;
    store.put({ _key: `${table}::${rowId}`, data: row });
  }
  await new Promise((res, rej) => {
    t.oncomplete = () => res(true);
    t.onerror = () => rej(t.error);
  });
}

export async function cacheUpsertRow(table: string, row: any, idField = "id") {
  const db = await openDb();
  const t = tx(db, [CACHE_STORE], "readwrite");
  const rowId = row[idField];
  t.objectStore(CACHE_STORE).put({ _key: `${table}::${rowId}`, data: row });
  await new Promise((res, rej) => {
    t.oncomplete = () => res(true);
    t.onerror = () => rej(t.error);
  });
}

export async function cacheDeleteRow(table: string, rowId: string) {
  const db = await openDb();
  const t = tx(db, [CACHE_STORE], "readwrite");
  t.objectStore(CACHE_STORE).delete(`${table}::${rowId}`);
  await new Promise((res, rej) => {
    t.oncomplete = () => res(true);
    t.onerror = () => rej(t.error);
  });
}

export async function cacheReplaceRowKey(table: string, oldId: string, newRow: any, idField = "id") {
  const db = await openDb();
  const t = tx(db, [CACHE_STORE], "readwrite");
  const store = t.objectStore(CACHE_STORE);
  store.delete(`${table}::${oldId}`);
  store.put({ _key: `${table}::${newRow[idField]}`, data: newRow });
  await new Promise((res, rej) => {
    t.oncomplete = () => res(true);
    t.onerror = () => rej(t.error);
  });
}

// ─── Mutation queue ───

export async function queueAdd(mutation: Omit<QueuedMutation, "id" | "createdAt" | "retries">): Promise<number> {
  const db = await openDb();
  const t = tx(db, [QUEUE_STORE], "readwrite");
  const store = t.objectStore(QUEUE_STORE);
  const full: QueuedMutation = { ...mutation, createdAt: new Date().toISOString(), retries: 0 };
  const id = await reqToPromise<number>(store.add(full));
  await new Promise((res, rej) => {
    t.oncomplete = () => res(true);
    t.onerror = () => rej(t.error);
  });
  notifyQueueChanged();
  return id;
}

export async function queueGetAll(): Promise<QueuedMutation[]> {
  const db = await openDb();
  const t = tx(db, [QUEUE_STORE], "readonly");
  return reqToPromise(t.objectStore(QUEUE_STORE).getAll());
}

export async function queueRemove(id: number) {
  const db = await openDb();
  const t = tx(db, [QUEUE_STORE], "readwrite");
  t.objectStore(QUEUE_STORE).delete(id);
  await new Promise((res, rej) => {
    t.oncomplete = () => res(true);
    t.onerror = () => rej(t.error);
  });
  notifyQueueChanged();
}

export async function queueUpdate(id: number, patch: Partial<QueuedMutation>) {
  const db = await openDb();
  const t = tx(db, [QUEUE_STORE], "readwrite");
  const store = t.objectStore(QUEUE_STORE);
  const existing = await reqToPromise<QueuedMutation>(store.get(id));
  if (existing) store.put({ ...existing, ...patch });
  await new Promise((res, rej) => {
    t.oncomplete = () => res(true);
    t.onerror = () => rej(t.error);
  });
}

export async function queueCount(): Promise<number> {
  const all = await queueGetAll();
  return all.length;
}

// ─── Meta (last-sync timestamps etc.) ───

export async function metaGet(key: string): Promise<any> {
  const db = await openDb();
  const t = tx(db, [META_STORE], "readonly");
  const r = await reqToPromise<any>(t.objectStore(META_STORE).get(key));
  return r ? r.value : undefined;
}

export async function metaSet(key: string, value: any) {
  const db = await openDb();
  const t = tx(db, [META_STORE], "readwrite");
  t.objectStore(META_STORE).put({ key, value });
  await new Promise((res, rej) => {
    t.oncomplete = () => res(true);
    t.onerror = () => rej(t.error);
  });
}

// ─── Pending-queue change listeners (for UI sync badge) ───

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

// Local temp-id generator for offline-created rows
export function tempId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
