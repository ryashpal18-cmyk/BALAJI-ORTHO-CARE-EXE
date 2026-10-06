/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   SQLITE OFFLINE STORE — Main Process                             ║
 * ║   IndexedDB ki jagah — real file-based DB (better-sqlite3)       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * KYUN: IndexedDB Chromium ke andar chalta hai (LevelDB engine) jo
 * antivirus / roaming-profile / network-drive locks se corrupt ho jaata
 * hai — isi wajah se "backing store error" baar baar aata tha.
 * better-sqlite3 Node.js (main process) mein seedha ek .db file ke saath
 * kaam karta hai — Chromium ka koi lena dena nahi. WAL mode + busy_timeout
 * se transient locks (antivirus scan, backup tool) khud hi retry ho jaate
 * hain, DB "corrupt" nahi maani jaati.
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const Database = require('better-sqlite3');
const logger = require('./logger.cjs');

let db = null;

function init(dbDir) {
  if (db) return db;
  try {
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'offline_cache.db');
    db = new Database(dbPath);

    // WAL mode: readers aur writers ek dusre ko block nahi karte, aur
    // crash/power-cut ke baad bhi DB corrupt hone ka risk kaafi kam ho jaata hai.
    db.pragma('journal_mode = WAL');
    // Agar file kisi aur process (antivirus scan) dwara momentarily locked hai,
    // to turant fail hone ke bajaye 5 second tak retry karo.
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = FULL');

    db.exec(`
      CREATE TABLE IF NOT EXISTS table_cache (
        _key TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_table_cache_table ON table_cache(table_name);

      CREATE TABLE IF NOT EXISTS mutation_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        op TEXT NOT NULL,
        payload TEXT,
        rowId TEXT,
        tempId TEXT,
        selectAfter TEXT,
        createdAt TEXT NOT NULL,
        retries INTEGER NOT NULL DEFAULT 0,
        lastError TEXT
      );

      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    if (!db.prepare('PRAGMA table_info(mutation_queue)').all().some(c => c.name === 'ownerUserId')) db.exec('ALTER TABLE mutation_queue ADD COLUMN ownerUserId TEXT');

    if (!db.prepare('PRAGMA table_info(mutation_queue)').all().some(c => c.name === 'lastAttemptAt')) db.exec('ALTER TABLE mutation_queue ADD COLUMN lastAttemptAt INTEGER');

    logger.logInfo('sqlite', `Offline SQLite DB ready — ${dbPath}`);
    return db;
  } catch (e) {
    logger.logError('sqlite', `SQLite init fail: ${e.message}`);
    throw e;
  }
}

function getDb() {
  if (!db) throw new Error('sqlite-store: init() call nahi hua abhi tak');
  return db;
}

// ─── Cache ───────────────────────────────────────────────────────────────

function cacheGetAll(table) {
  const rows = getDb().prepare(`SELECT data FROM table_cache WHERE table_name = ?`).all(table);
  return rows.map((r) => JSON.parse(r.data));
}

function cacheGetRow(table, rowId) {
  const r = getDb().prepare(`SELECT data FROM table_cache WHERE _key = ?`).get(`${table}::${rowId}`);
  return r ? JSON.parse(r.data) : undefined;
}

function cacheSetRows(table, rows, idField) {
  if (!rows || !rows.length) return;
  const stmt = getDb().prepare(
    `INSERT INTO table_cache (_key, table_name, data) VALUES (@key, @table, @data)
     ON CONFLICT(_key) DO UPDATE SET data = excluded.data`
  );
  const insertMany = getDb().transaction((items) => {
    for (const row of items) {
      const rowId = row[idField];
      if (rowId === undefined || rowId === null) continue;
      stmt.run({ key: `${table}::${rowId}`, table, data: JSON.stringify(row) });
    }
  });
  insertMany(rows);
}

function cacheReplaceTable(table, rows, idField) {
  const del = getDb().prepare(`DELETE FROM table_cache WHERE table_name = ?`);
  const runAll = getDb().transaction(() => {
    const pending = cacheGetAll(table).filter(row => row._pendingSync);
    const pendingIds = new Set(pending.flatMap(row => [String(row[idField]), String(row[idField]).replace(/^local_/, '')]));
    const deleted = new Set(queueGetAll().filter(m => m.table === table && m.op === 'delete').flatMap(m => [m.rowId, m.rowId?.replace(/^local_/, '')]));
    const combined = [...pending, ...rows.filter(row => !pendingIds.has(String(row[idField])))].filter(row => !deleted.has(row[idField]));
    del.run(table);
    cacheSetRows(table, combined, idField);
  });
  runAll();
}

function cacheMergeServer(table, row, idField = 'id') {
  return getDb().transaction(() => {
    const id = String(row[idField] ?? '').replace(/^local_/, '');
    if (!id) throw new Error('Server row missing ID');
    if (queueGetAll().some(m => m.table === table && [m.rowId,m.tempId].some(v => v && v.replace(/^local_/, '') === id))) return;
    const existing = cacheGetRow(table, row[idField]) || cacheGetRow(table, 'local_' + id);
    if (existing?._pendingSync) return;
    cacheUpsertRow(table, row, idField);
  })();
}

function cacheUpsertRow(table, row, idField) {
  const rowId = row[idField];
  getDb().prepare(
    `INSERT INTO table_cache (_key, table_name, data) VALUES (?, ?, ?)
     ON CONFLICT(_key) DO UPDATE SET data = excluded.data`
  ).run(`${table}::${rowId}`, table, JSON.stringify(row));
}

function cacheDeleteRow(table, rowId) {
  getDb().prepare(`DELETE FROM table_cache WHERE _key = ?`).run(`${table}::${rowId}`);
}

function cacheReplaceRowKey(table, oldId, newRow, idField) {
  const runAll = getDb().transaction(() => {
    getDb().prepare(`DELETE FROM table_cache WHERE _key = ?`).run(`${table}::${oldId}`);
    cacheUpsertRow(table, newRow, idField);
  });
  runAll();
}

// ─── Mutation Queue ───────────────────────────────────────────────────────

function queueAdd(mutation) {
  const info = getDb().prepare(
    `INSERT INTO mutation_queue (table_name, op, payload, rowId, tempId, selectAfter, createdAt, retries, lastError, ownerUserId)
     VALUES (@table, @op, @payload, @rowId, @tempId, @selectAfter, @createdAt, 0, NULL, @ownerUserId)`
  ).run({
    ownerUserId: mutation.ownerUserId ?? null,
    table: mutation.table,
    op: mutation.op,
    payload: mutation.payload !== undefined ? JSON.stringify(mutation.payload) : null,
    rowId: mutation.rowId ?? null,
    tempId: mutation.tempId ?? null,
    selectAfter: mutation.selectAfter ?? null,
    createdAt: new Date().toISOString(),
  });
  return info.lastInsertRowid;
}

function rowToMutation(r) {
  return {
    id: r.id,
    table: r.table_name,
    ownerUserId: r.ownerUserId ?? null,
    op: r.op,
    payload: r.payload ? JSON.parse(r.payload) : undefined,
    rowId: r.rowId ?? undefined,
    tempId: r.tempId ?? undefined,
    selectAfter: r.selectAfter ?? undefined,
    createdAt: r.createdAt,
    retries: r.retries,
    lastError: r.lastError ?? undefined,
    lastAttemptAt: r.lastAttemptAt ?? undefined,
  };
}

function queueGetAll() {
  const rows = getDb().prepare(`SELECT * FROM mutation_queue ORDER BY id ASC`).all();
  return rows.map(rowToMutation);
}

function queueRemove(id) {
  const m = getDb().prepare('SELECT * FROM mutation_queue WHERE id = ?').get(id);
  if (m?.table_name === 'audit_logs' && m.op === 'insert') {
    const key = m.tempId || m.rowId;
    if (key) cacheDeleteRow('audit_logs', key);
  }
  getDb().prepare(`DELETE FROM mutation_queue WHERE id = ?`).run(id);
}

function queueUpdate(id, patch) {
  const existing = getDb().prepare(`SELECT * FROM mutation_queue WHERE id = ?`).get(id);
  if (!existing) return;
  const merged = { ...rowToMutation(existing), ...patch };
  getDb().prepare(
    `UPDATE mutation_queue SET table_name=@table, op=@op, payload=@payload, rowId=@rowId,
     tempId=@tempId, selectAfter=@selectAfter, createdAt=@createdAt, retries=@retries, lastError=@lastError, lastAttemptAt=@lastAttemptAt
     WHERE id=@id`
  ).run({
    id,
    table: merged.table,
    op: merged.op,
    payload: merged.payload !== undefined ? JSON.stringify(merged.payload) : null,
    rowId: merged.rowId ?? null,
    tempId: merged.tempId ?? null,
    selectAfter: merged.selectAfter ?? null,
    createdAt: merged.createdAt,
    retries: merged.retries ?? 0,
    lastError: merged.lastError ?? null,
    lastAttemptAt: merged.lastAttemptAt ?? null,
  });
}

// ─── Meta ─────────────────────────────────────────────────────────────────

function metaGet(key) {
  const r = getDb().prepare(`SELECT value FROM meta WHERE key = ?`).get(key);
  if (!r) return undefined;
  try { return JSON.parse(r.value); } catch (_) { return r.value; }
}

function metaSet(key, value) {
  getDb().prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, JSON.stringify(value));
}

// ─── One-time migration from old IndexedDB dump ──────────────────────────
// Renderer purani IndexedDB se data padh ke ye function ko poora dump bhejega
// (ek hi baar, app upgrade ke baad). Agar sqlite mein already data hai to
// skip kar dete hain — taaki dobara migrate na ho, purana data overwrite na ho.

function importLegacyDump(dump) {
  const already = metaGet('_legacy_migrated');
  if (already) return { skipped: true };

  const runAll = getDb().transaction(() => {
    if (dump.cache) {
      for (const [table, rows] of Object.entries(dump.cache)) {
        if (Array.isArray(rows) && rows.length) cacheSetRows(table, rows.filter(row => !cacheGetRow(table, row.id)), 'id');
      }
    }
    if (Array.isArray(dump.queue)) {
      for (const m of dump.queue) {
        queueAdd({
          table: m.table, op: m.op, payload: m.payload,
          rowId: m.rowId, tempId: m.tempId, selectAfter: m.selectAfter,
        });
      }
    }
    metaSet('_legacy_migrated', true);
  });
  runAll();
  logger.logInfo('sqlite', 'Legacy IndexedDB data SQLite mein migrate ho gaya');
  return { migrated: true };
}

function isLegacyMigrated() {
  return !!metaGet('_legacy_migrated');
}

function close() {
  if (db) {
    try { db.close(); } catch (_) {}
    db = null;
  }
}

function commitMutation(mutation, row, idField = 'id') {
  return getDb().transaction(() => {
    let saved = row;
    if (mutation.op === 'update') {
      const existing = cacheGetRow(mutation.table, mutation.rowId);
      if (!existing) throw new Error('Record not available locally; refresh before editing');
      saved = { ...existing, ...row, [idField]: mutation.rowId, _pendingSync: true };
    }
    if (mutation.op === 'delete') cacheDeleteRow(mutation.table, mutation.rowId);
    else cacheUpsertRow(mutation.table, saved, idField);
    queueAdd(mutation);
    return saved;
  })();
}
function snapshot() {
  return getDb().transaction(() => {
    const cache = {};
    for (const { table_name } of getDb().prepare('SELECT DISTINCT table_name FROM table_cache').all())
      cache[table_name] = cacheGetAll(table_name);
    return { cache, queue: queueGetAll(), meta: getDb().prepare('SELECT * FROM meta').all() };
  })();
}
function restoreSnapshot(dump) {
  if (!dump || !dump.cache || !Array.isArray(dump.queue)) throw new Error('Invalid backup');
  return getDb().transaction(() => {
    if (queueGetAll().length || getDb().prepare('SELECT count(*) AS n FROM table_cache').get().n)
      throw new Error('Restore requires an empty test/new database; existing data was not changed');
    for (const [table, rows] of Object.entries(dump.cache)) cacheSetRows(table, rows, 'id');
    for (const m of dump.queue) { const id = queueAdd(m); queueUpdate(id, { ...m, id }); }
    for (const m of dump.meta || []) getDb().prepare('INSERT OR REPLACE INTO meta VALUES (?, ?)').run(m.key,m.value);
    metaSet("_legacy_migrated", true);
    return true;
  })();
}
function adjustStock(args) {
  return getDb().transaction(() => {
    const medicine = cacheGetRow('medicines', args.medicineId);
    if (!medicine) throw new Error('Medicine not found; refresh inventory');
    const qty = Number(args.changeQty);
    const next = Number(medicine.stock_quantity || 0) + qty;
    if (!Number.isFinite(qty) || qty === 0 || next < 0) throw new Error('Insufficient stock or invalid quantity');
    const movement = { id: args.id, medicine_id: args.medicineId, medicine_name: medicine.name,
      change_qty: qty, reason: args.reason || 'manual', note: args.note || null,
      created_by: args.actorName || 'Unknown', created_at: new Date().toISOString(), _pendingSync: true };
    cacheUpsertRow('medicines', { ...medicine, stock_quantity: next, _pendingSync: true }, 'id');
    cacheUpsertRow('stock_movements', movement, 'id');
    queueAdd({ ownerUserId: args.ownerUserId, table: 'stock_movements', op: 'stock_adjust', payload: movement, tempId: movement.id });
    return { ...medicine, stock_quantity: next, _pendingSync: true };
  })();
}
module.exports = {
  commitMutation, snapshot, restoreSnapshot, adjustStock, cacheMergeServer,
  init, close,
  cacheGetAll, cacheGetRow, cacheSetRows, cacheReplaceTable, cacheUpsertRow, cacheDeleteRow, cacheReplaceRowKey,
  queueAdd, queueGetAll, queueRemove, queueUpdate,
  metaGet, metaSet,
  importLegacyDump, isLegacyMigrated,
};
