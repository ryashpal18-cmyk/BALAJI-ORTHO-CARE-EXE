// ─────────────────────────────────────────────────────────────────────────
// Offline-first data engine (IndexedDB cache + mutation sync queue)
// ─────────────────────────────────────────────────────────────────────────

import { cLog } from "@/lib/clientLogger";

const DB_NAME    = "balaji_ortho_offline_db";
const DB_VERSION = 3; // ✅ v3 bump — v2 corrupt DB wale PCs pe auto-delete + fresh start

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

// ── DB Error Rate Limiter ────────────────────────────────────────────────
// IndexedDB UnknownError aane par ye counter track karta hai.
// 3 se zyada baar fail ho to LOG band kar do (lekin [] return karte raho)
// Warna ek corrupt DB ek din mein 9000+ errors flood kar deta hai.
let _dbConsecutiveErrors = 0;
let _dbSilenced = false;
function _dbErrorLog(msg: string, err?: unknown) {
  _dbConsecutiveErrors++;
  if (_dbConsecutiveErrors <= 3) {
    cLog.error("indexeddb", msg, err);
  } else if (!_dbSilenced) {
    cLog.warn("indexeddb", `IndexedDB baar baar fail ho rahi hai (${_dbConsecutiveErrors}x) — logs mute kar diye, app chal raha hai`);
    _dbSilenced = true;
  }
}
function _dbReset() {
  _dbConsecutiveErrors = 0;
  _dbSilenced = false;
}

// ✅ Corrupt DB ko delete karke fresh banata hai
function deleteDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror   = () => resolve();
    req.onblocked = () => resolve();
  });
}

function createStores(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(CACHE_STORE))
    db.createObjectStore(CACHE_STORE, { keyPath: "_key" });
  if (!db.objectStoreNames.contains(QUEUE_STORE))
    db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
  if (!db.objectStoreNames.contains(META_STORE))
    db.createObjectStore(META_STORE, { keyPath: "key" });
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(async (resolve, reject) => {
    const tryOpen = (afterDelete = false): Promise<IDBDatabase> =>
      new Promise((res, rej) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = req.result;
          // Purane version ke stores clean karo
          if ((e as any).oldVersion > 0) {
            for (const s of [CACHE_STORE, QUEUE_STORE, META_STORE]) {
              try { if (db.objectStoreNames.contains(s)) db.deleteObjectStore(s); } catch (_) {}
            }
          }
          createStores(db);
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => { db.close(); dbPromise = null; };
          cLog.info("indexeddb", afterDelete ? "Fresh DB banayi — corrupt thi" : "Database successfully khul gayi");
          res(db);
        };
        req.onerror = () => rej(req.error);
        req.onblocked = () => cLog.warn("indexeddb", "DB blocked");
      });

    try {
      const db = await tryOpen();
      resolve(db);
    } catch (err) {
      cLog.error("indexeddb", "Database kholne mein fail — corrupt DB delete karke retry", err);
      dbPromise = null;
      try {
        await deleteDb();
        const db2 = await tryOpen(true);
        dbPromise = Promise.resolve(db2);
        resolve(db2);
      } catch (err2) {
        cLog.error("indexeddb", "Fresh DB bhi nahi khuli", err2);
        reject(err2);
      }
    }
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
    cLog.error("indexeddb", `${table} cache read fail — DB corrupt, delete + reset`, err);
    dbPromise = null;
    try {
      await deleteDb();
      await openDb(); // fresh DB banaao
    } catch (_) {}
    return []; // fresh start — data Supabase se reload hoga
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

// ── queueGetAll fix: IndexedDB UnknownError pe infinite error loop hota tha ──
// Problem: har 30s mein runSync -> queueGetAll fail -> deleteDb -> openDb -> loop
// Result: 9000+ errors/day log flood
// Fix: 
//   1. Pehli baar fail hone par deleteDb + fresh open karo (original behavior)
//   2. Agar fresh DB bhi fail ho to SIRF [] return karo — aur doosri baar deleteDb mat karo
//   3. Rate limiter se repeated logging band karo
let _queueDbResetDone = false; // Sirf ek baar nuclear reset allow karo per session

export async function queueGetAll(): Promise<QueuedMutation[]> {
  try {
    const db = await openDb();
    const t  = tx(db, [QUEUE_STORE], "readonly");
    const result = await reqToPromise<QueuedMutation[]>(t.objectStore(QUEUE_STORE).getAll());
    // Success hone par error counter reset karo
    _dbReset();
    return result;
  } catch (err) {
    _dbErrorLog("queueGetAll fail — DB problem", err);

    // ── Sirf pehli baar nuclear reset karo ──
    // Agar pehle se reset ho chuka hai to seedha [] return karo
    // (Warna infinite delete+open+fail loop banta hai)
    if (_queueDbResetDone) {
      return []; // silent return — app chal raha hai
    }

    _queueDbResetDone = true;
    dbPromise = null;
    try {
      await deleteDb();
      cLog.info("queue", "Corrupt IndexedDB delete ho gayi — fresh DB ban rahi hai");
      const db2 = await openDb();
      const t2  = tx(db2, [QUEUE_STORE], "readonly");
      const result = await reqToPromise<QueuedMutation[]>(t2.objectStore(QUEUE_STORE).getAll());
      cLog.info("queue", "Fresh DB se queueGetAll success — queue empty se start");
      _dbReset();
      _queueDbResetDone = false; // Reset flag so next session can try again if needed
      return result;
    } catch (err2) {
      _dbErrorLog("Fresh DB bhi fail — IndexedDB environment problem, empty return kar raha hai", err2);
      return []; // app crash mat karo — empty return karo
    }
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
  // ✅ Real UUID use karo (local_ prefix ke saath) — isse sync ke time
  // upsert(id) karke duplicate-safe (idempotent) retry ho sakta hai.
  const uuid = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${Math.random().toString(36).slice(2, 9)}`;
  return `local_${uuid}`;
}
