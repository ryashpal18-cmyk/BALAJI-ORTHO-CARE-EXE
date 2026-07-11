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
    db.pragma('synchronous = NORMAL');

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
    del.run(table);
    cacheSetRows(table, rows, idField);
  });
  runAll();
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
    `INSERT INTO mutation_queue (table_name, op, payload, rowId, tempId, selectAfter, createdAt, retries, lastError)
     VALUES (@table, @op, @payload, @rowId, @tempId, @selectAfter, @createdAt, 0, NULL)`
  ).run({
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
    op: r.op,
    payload: r.payload ? JSON.parse(r.payload) : undefined,
    rowId: r.rowId ?? undefined,
    tempId: r.tempId ?? undefined,
    selectAfter: r.selectAfter ?? undefined,
    createdAt: r.createdAt,
    retries: r.retries,
    lastError: r.lastError ?? undefined,
  };
}

function queueGetAll() {
  const rows = getDb().prepare(`SELECT * FROM mutation_queue ORDER BY id ASC`).all();
  return rows.map(rowToMutation);
}

function queueRemove(id) {
  getDb().prepare(`DELETE FROM mutation_queue WHERE id = ?`).run(id);
}

function queueUpdate(id, patch) {
  const existing = getDb().prepare(`SELECT * FROM mutation_queue WHERE id = ?`).get(id);
  if (!existing) return;
  const merged = { ...rowToMutation(existing), ...patch };
  getDb().prepare(
    `UPDATE mutation_queue SET table_name=@table, op=@op, payload=@payload, rowId=@rowId,
     tempId=@tempId, selectAfter=@selectAfter, createdAt=@createdAt, retries=@retries, lastError=@lastError
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
        if (Array.isArray(rows) && rows.length) cacheSetRows(table, rows, 'id');
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

module.exports = {
  init, close,
  cacheGetAll, cacheGetRow, cacheSetRows, cacheReplaceTable, cacheUpsertRow, cacheDeleteRow, cacheReplaceRowKey,
  queueAdd, queueGetAll, queueRemove, queueUpdate,
  metaGet, metaSet,
  importLegacyDump, isLegacyMigrated,
};
