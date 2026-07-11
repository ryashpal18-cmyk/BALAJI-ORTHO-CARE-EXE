// ─────────────────────────────────────────────────────────────────────────
// Offline-first data engine (SQLite cache + mutation sync queue)
// ─────────────────────────────────────────────────────────────────────────
// ✅ IndexedDB HATA DIYA GAYA HAI. Ab saara offline data ek real SQLite file
// (C:\Balaji_Health_Backup\offline_cache.db) mein rehta hai, jo Electron ke
// MAIN process (Node.js, better-sqlite3) mein chalta hai — Chromium ke
// IndexedDB/LevelDB engine ka yahan koi role nahi hai. Isi wajah se woh
// "backing store corrupt" wali error ab structurally hi nahi aa sakti,
// kyunki hum us engine ko use hi nahi kar rahe.
//
// Is file ke saare exported function naam/signature PEHLE JAISE HI hain
// (cacheGetAll, cacheSetRows, queueAdd, etc.) — taaki baaki 25+ files jo
// inhe import karte hain, unmein EK LINE bhi change na karni pade.

import { cLog } from "@/lib/clientLogger";

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

function electronOffline() {
  const w = window as any;
  return w.electron?.offline as
    | {
        cacheGetAll: (table: string) => Promise<{ success: boolean; data: any[] }>;
        cacheGetRow: (table: string, rowId: string) => Promise<{ success: boolean; data: any }>;
        cacheSetRows: (table: string, rows: any[], idField?: string) => Promise<{ success: boolean }>;
        cacheReplaceTable: (table: string, rows: any[], idField?: string) => Promise<{ success: boolean }>;
        cacheUpsertRow: (table: string, row: any, idField?: string) => Promise<{ success: boolean }>;
        cacheDeleteRow: (table: string, rowId: string) => Promise<{ success: boolean }>;
        cacheReplaceRowKey: (table: string, oldId: string, newRow: any, idField?: string) => Promise<{ success: boolean }>;
        queueAdd: (mutation: any) => Promise<{ success: boolean; id: number }>;
        queueGetAll: () => Promise<{ success: boolean; data: QueuedMutation[] }>;
        queueRemove: (id: number) => Promise<{ success: boolean }>;
        queueUpdate: (id: number, patch: any) => Promise<{ success: boolean }>;
        metaGet: (key: string) => Promise<{ success: boolean; value: any }>;
        metaSet: (key: string, value: any) => Promise<{ success: boolean }>;
        isLegacyMigrated: () => Promise<{ success: boolean; migrated: boolean }>;
        importLegacyDump: (dump: any) => Promise<{ success: boolean }>;
      }
    | undefined;
}

// ── In-memory fallback (sirf browser/dev-preview mode ke liye, jab Electron
// bridge available nahi ho — jaise `vite preview` seedhe browser mein) ──
// Production EXE mein hamesha window.electron.offline available rahega.
const memCache = new Map<string, any>();
const memQueue: QueuedMutation[] = [];
let memQueueId = 1;
const memMeta = new Map<string, any>();
let _warnedNoBridge = false;
function warnNoBridge() {
  if (_warnedNoBridge) return;
  _warnedNoBridge = true;
  cLog.warn("sqlite", "Electron offline bridge nahi mila — in-memory fallback use ho raha hai (sirf browser preview mein expected)");
}

// ─── Cache ───────────────────────────────────────────────────────────────

export async function cacheGetAll(table: string): Promise<any[]> {
  const bridge = electronOffline();
  if (!bridge) {
    warnNoBridge();
    const prefix = `${table}::`;
    return Array.from(memCache.entries())
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v);
  }
  try {
    const res = await bridge.cacheGetAll(table);
    return res?.data ?? [];
  } catch (err) {
    cLog.error("sqlite", `${table} cache read fail`, err);
    return []; // ✅ data disk pe SQLite file mein intact rehta hai, sirf is call ka result khaali hai
  }
}

export async function cacheGetRow(table: string, rowId: string): Promise<any> {
  const bridge = electronOffline();
  if (!bridge) {
    warnNoBridge();
    return memCache.get(`${table}::${rowId}`);
  }
  try {
    const res = await bridge.cacheGetRow(table, rowId);
    return res?.data;
  } catch (err) {
    cLog.error("sqlite", `${table} cacheGetRow fail — rowId: ${rowId}`, err);
    return undefined;
  }
}

export async function cacheSetRows(table: string, rows: any[], idField = "id") {
  if (!rows || !rows.length) return;
  const bridge = electronOffline();
  if (!bridge) {
    warnNoBridge();
    for (const row of rows) {
      const rowId = row[idField];
      if (rowId === undefined || rowId === null) continue;
      memCache.set(`${table}::${rowId}`, row);
    }
    return;
  }
  try {
    await bridge.cacheSetRows(table, rows, idField);
  } catch (err) {
    cLog.error("sqlite", `${table} cacheSetRows fail`, err);
  }
}

export async function cacheReplaceTable(table: string, rows: any[], idField = "id") {
  // 🚨 FIX: "payment update karo, ek baar dikhe, phir wapas gayab" bug —
  // jab bhi koi local change (payment update, waghera) hua, wo turant
  // cache mein save hota hai (_pendingSync: true) aur background mein
  // server ko sync bhejta hai. Lekin USI WAQT agar koi doosri query
  // Supabase se STALE (purana) data background mein fetch kar rahi thi
  // (sync poora hone se pehle), to ye function poori table ko us purane
  // data se REPLACE kar deta tha — abhi-abhi kiya gaya change reset ho
  // jaata tha. Ab jab tak local change server ko confirm-sync nahi ho
  // jaata (_pendingSync saaf nahi hota), tab tak us row ko background
  // server-refresh se overwrite nahi karenge — local change hi jeetega.
  try {
    const existing = await cacheGetAll(table);

    // 🚨 PRODUCTION-AUDIT FIX: same class of bug already fixed in main.js
    // (writeJSONSafe) — agar server se aaya naya data khaali [] hai LEKIN
    // local cache mein pehle se real records hain, to ye silently poori
    // table khaali kar deta tha. Ye khaali result ek genuine "no data"
    // state ki wajah se nahi, balki transient RLS/auth glitch ki wajah se
    // bhi ho sakta hai (Supabase aise mein error throw nahi karta, sirf
    // empty array deta hai) — jo error-catch guard ko bypass kar deta hai.
    // Fix: agar naya data khaali hai AUR local cache mein pehle se records
    // hain, to overwrite skip karo (genuine empty state — jaise fresh
    // install — abhi bhi sahi se likhi jaati hai, kyunki tab cache khud
    // khaali hoti hai).
    if (Array.isArray(rows) && rows.length === 0 && existing.length > 0) {
      cLog.warn(
        "sqlite",
        `${table} cacheReplaceTable — server se 0 records aaye lekin local cache mein ${existing.length} records hain, overwrite SKIP kiya (data-loss guard)`
      );
      return;
    }

    const pendingRows = existing.filter((r) => r && r._pendingSync);
    const pendingIds = new Set(pendingRows.map((r) => String(r[idField])));

    const finalRows = [
      ...pendingRows,
      ...rows.filter((row) => !pendingIds.has(String(row[idField]))),
    ];

    const bridge = electronOffline();
    if (!bridge) {
      warnNoBridge();
      const prefix = `${table}::`;
      for (const k of Array.from(memCache.keys())) {
        if (k.startsWith(prefix)) memCache.delete(k);
      }
      await cacheSetRows(table, finalRows, idField);
    } else {
      await bridge.cacheReplaceTable(table, finalRows, idField);
    }
    cLog.info("sqlite", `${table} cache replace — ${rows.length} rows save ho gayi${pendingIds.size ? ` (${pendingIds.size} pending local rows preserved)` : ""}`);
  } catch (err) {
    cLog.error("sqlite", `${table} cacheReplaceTable fail`, err);
  }
}

export async function cacheUpsertRowFromServer(table: string, row: any, idField = "id") {
  try {
    const rowId = row[idField];
    const existing = await cacheGetRow(table, rowId);
    // Agar is row mein abhi unsynced local change hai, to server ki purani
    // copy se use overwrite mat karo (same wajah jo upar cacheReplaceTable mein hai).
    if (existing && existing._pendingSync) return;
    await cacheUpsertRow(table, row, idField);
  } catch (err) {
    cLog.error("sqlite", `${table} cacheUpsertRowFromServer fail`, err);
  }
}

export async function cacheUpsertRow(table: string, row: any, idField = "id") {
  const bridge = electronOffline();
  const rowId = row[idField];
  if (!bridge) {
    warnNoBridge();
    memCache.set(`${table}::${rowId}`, row);
    return;
  }
  try {
    await bridge.cacheUpsertRow(table, row, idField);
  } catch (err) {
    cLog.error("sqlite", `${table} cacheUpsertRow fail`, err);
  }
}

export async function cacheDeleteRow(table: string, rowId: string) {
  const bridge = electronOffline();
  if (!bridge) {
    warnNoBridge();
    memCache.delete(`${table}::${rowId}`);
    return;
  }
  try {
    await bridge.cacheDeleteRow(table, rowId);
  } catch (err) {
    cLog.error("sqlite", `${table} cacheDeleteRow fail — rowId: ${rowId}`, err);
  }
}

export async function cacheReplaceRowKey(table: string, oldId: string, newRow: any, idField = "id") {
  const bridge = electronOffline();
  if (!bridge) {
    warnNoBridge();
    memCache.delete(`${table}::${oldId}`);
    memCache.set(`${table}::${newRow[idField]}`, newRow);
    return;
  }
  try {
    await bridge.cacheReplaceRowKey(table, oldId, newRow, idField);
    cLog.info("sqlite", `${table} temp key replace — ${oldId} → ${newRow[idField]}`);
  } catch (err) {
    cLog.error("sqlite", `${table} cacheReplaceRowKey fail`, err);
  }
}

// ─── Mutation Queue ───────────────────────────────────────────────────────

export async function queueAdd(mutation: Omit<QueuedMutation, "id" | "createdAt" | "retries">): Promise<number> {
  const bridge = electronOffline();
  if (!bridge) {
    warnNoBridge();
    const id = memQueueId++;
    memQueue.push({ ...mutation, id, createdAt: new Date().toISOString(), retries: 0 });
    notifyQueueChanged();
    return id;
  }
  try {
    const res = await bridge.queueAdd(mutation);
    cLog.info("queue", `Queue mein add hua — op: ${mutation.op}, table: ${mutation.table}`);
    notifyQueueChanged();
    return res?.id ?? -1;
  } catch (err) {
    cLog.error("queue", `queueAdd fail — op: ${mutation.op}, table: ${mutation.table}`, err);
    return -1;
  }
}

export async function queueGetAll(): Promise<QueuedMutation[]> {
  const bridge = electronOffline();
  if (!bridge) {
    warnNoBridge();
    return [...memQueue];
  }
  try {
    const res = await bridge.queueGetAll();
    return res?.data ?? [];
  } catch (err) {
    cLog.error("queue", "queueGetAll fail — SQLite problem", err);
    return []; // app crash mat karo — empty return karo
  }
}

export async function queueRemove(id: number) {
  const bridge = electronOffline();
  if (!bridge) {
    warnNoBridge();
    const idx = memQueue.findIndex((m) => m.id === id);
    if (idx >= 0) memQueue.splice(idx, 1);
    notifyQueueChanged();
    return;
  }
  try {
    await bridge.queueRemove(id);
    notifyQueueChanged();
  } catch (err) {
    cLog.error("queue", `queueRemove fail — id: ${id}`, err);
  }
}

export async function queueUpdate(id: number, patch: Partial<QueuedMutation>) {
  const bridge = electronOffline();
  if (!bridge) {
    warnNoBridge();
    const m = memQueue.find((x) => x.id === id);
    if (m) Object.assign(m, patch);
    return;
  }
  try {
    await bridge.queueUpdate(id, patch);
    if (patch.lastError) {
      cLog.warn("queue", `Retry ${patch.retries}/${8} — id: ${id}, error: ${patch.lastError}`);
    }
  } catch (err) {
    cLog.error("queue", `queueUpdate fail — id: ${id}`, err);
  }
}

// ✅ FIX: "queueRemapRowId is not exported" build error — ye function pehle
// missing thi. Jab koi temp-ID (local_...) row insert hoke server pe sync ho
// jaata hai, uske baad queue mein pading kisi bhi doosre mutation (update/
// delete) ka rowId agar wahi purana temp-ID reference kar raha ho, to use
// naye real server ID pe shift karna zaroori hai — warna wo baad wale
// mutations "PENDING_PARENT_INSERT" ya wrong-id error dekar fail ho jaate.
export async function queueRemapRowId(table: string, oldRowId: string, newRowId: string) {
  try {
    const all = await queueGetAll();
    for (const m of all) {
      if (m.table === table && m.rowId === oldRowId && m.id !== undefined) {
        await queueUpdate(m.id, { rowId: newRowId });
      }
    }
    cLog.info("queue", `${table} queue rowId remap — ${oldRowId} → ${newRowId}`);
  } catch (err) {
    cLog.error("queue", `queueRemapRowId fail — table: ${table}, old: ${oldRowId}, new: ${newRowId}`, err);
  }
}

export async function queueCount(): Promise<number> {
  const all = await queueGetAll();
  return all.length;
}

// ─── Meta ─────────────────────────────────────────────────────────────────

export async function metaGet(key: string): Promise<any> {
  const bridge = electronOffline();
  if (!bridge) {
    warnNoBridge();
    return memMeta.get(key);
  }
  try {
    const res = await bridge.metaGet(key);
    return res?.value;
  } catch (err) {
    cLog.error("sqlite", `metaGet fail — key: ${key}`, err);
    return undefined;
  }
}

export async function metaSet(key: string, value: any) {
  const bridge = electronOffline();
  if (!bridge) {
    warnNoBridge();
    memMeta.set(key, value);
    return;
  }
  try {
    await bridge.metaSet(key, value);
  } catch (err) {
    cLog.error("sqlite", `metaSet fail — key: ${key}`, err);
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

// ─── Real disk safety-backup ──────────────────────────────────────────────
// SQLite khud ek disk file hai, lekin extra safety ke liye har critical table
// ka JSON snapshot bhi C:\Balaji_Health_Backup\*.json mein likh dete hain.
const BACKUP_TABLES = ["patients", "billing", "fracture_cases", "fracture_xrays"];

export async function backupCacheToDisk(): Promise<void> {
  try {
    const w = window as any;
    if (!w.electron?.writeBackupSnapshot) return; // browser mode — skip
    const tables: Record<string, any[]> = {};
    for (const t of BACKUP_TABLES) {
      tables[t] = await cacheGetAll(t);
    }
    await w.electron.writeBackupSnapshot(tables);
  } catch (err) {
    cLog.error("sqlite", "backupCacheToDisk fail", err);
  }
}

export function tempId() {
  // ✅ Real UUID use karo (local_ prefix ke saath) — isse sync ke time
  // upsert(id) karke duplicate-safe (idempotent) retry ho sakta hai.
  const uuid = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${Math.random().toString(36).slice(2, 9)}`;
  return `local_${uuid}`;
}

// ─── One-time legacy IndexedDB → SQLite migration ─────────────────────────
// Purane users ke PC pe abhi bhi purani IndexedDB mein data pada ho sakta hai
// (patients, bills, pending queue). App upgrade ke baad ye function EK BAAR
// chalti hai: purani IndexedDB se sab kuch padhti hai, SQLite mein bhej deti
// hai, aur phir purani IndexedDB permanently delete kar deti hai — taaki
// aage se app kabhi bhi IndexedDB ko touch na kare.
const LEGACY_DB_NAME = "balaji_ortho_offline_db";

function readLegacyIndexedDb(): Promise<{ cache: Record<string, any[]>; queue: any[] } | null> {
  return new Promise((resolve) => {
    try {
      if (!("indexedDB" in window)) { resolve(null); return; }
      const req = indexedDB.open(LEGACY_DB_NAME);
      req.onerror = () => resolve(null);
      req.onupgradeneeded = () => {
        // Koi purani DB thi hi nahi (fresh install) — is upgrade ko turant abort
        // karo taaki galti se khaali DB create na ho jaaye.
        try { req.transaction?.abort(); } catch (_) {}
      };
      req.onsuccess = () => {
        const db = req.result;
        try {
          const storeNames = Array.from(db.objectStoreNames);
          if (!storeNames.includes("table_cache") && !storeNames.includes("mutation_queue")) {
            db.close();
            resolve(null);
            return;
          }
          const cache: Record<string, any[]> = {};
          const queue: any[] = [];
          const tx = db.transaction(storeNames, "readonly");
          let pending = storeNames.length;
          const done = () => { pending--; if (pending <= 0) { db.close(); resolve({ cache, queue }); } };

          if (storeNames.includes("table_cache")) {
            const r = tx.objectStore("table_cache").getAll();
            r.onsuccess = () => {
              for (const rec of r.result || []) {
                const key = rec?._key;
                if (typeof key !== "string") continue;
                const idx = key.indexOf("::");
                if (idx < 0) continue;
                const table = key.slice(0, idx);
                if (!cache[table]) cache[table] = [];
                cache[table].push(rec.data);
              }
              done();
            };
            r.onerror = done;
          }
          if (storeNames.includes("mutation_queue")) {
            const r = tx.objectStore("mutation_queue").getAll();
            r.onsuccess = () => { queue.push(...(r.result || [])); done(); };
            r.onerror = done;
          }
          if (storeNames.length === 0) resolve({ cache, queue });
        } catch (e) {
          try { db.close(); } catch (_) {}
          resolve(null);
        }
      };
    } catch (e) {
      resolve(null);
    }
  });
}

function deleteLegacyIndexedDb(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(LEGACY_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

export async function migrateLegacyIndexedDbIfNeeded(): Promise<void> {
  const bridge = electronOffline();
  if (!bridge) return; // browser/dev mode — kuch nahi karna
  try {
    const status = await bridge.isLegacyMigrated();
    if (status?.migrated) return; // already migrate ho chuka hai

    const dump = await readLegacyIndexedDb();
    if (dump) {
      await bridge.importLegacyDump(dump);
      cLog.info("sqlite", "Purana IndexedDB data SQLite mein migrate ho gaya");
    } else {
      // Purani DB thi hi nahi (fresh install) — sirf flag set karne ke liye
      // ek khaali dump bhej do taaki dobara har baar check na ho.
      await bridge.importLegacyDump({ cache: {}, queue: [] });
    }
    // Migration ke baad purani IndexedDB permanently hata do — ab kabhi use nahi hogi.
    await deleteLegacyIndexedDb();
  } catch (err) {
    cLog.error("sqlite", "Legacy IndexedDB migration fail — app SQLite ke saath fresh start karega", err);
  }
}
