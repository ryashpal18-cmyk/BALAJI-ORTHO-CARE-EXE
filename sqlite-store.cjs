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

let canonicalVillage=value=>value, VILLAGE_REVISION='disabled';
function setVillageNormalizer(fn,revision){if(typeof fn!=='function')throw Error('Village normalizer required');canonicalVillage=fn;VILLAGE_REVISION=revision;}
function villageRow(table,row){return table==='patients' && typeof row?.address==='string' ? {...row,address:canonicalVillage(row.address)} : row;}
const path = require('path');
const fs   = require('fs');
const Database = require('better-sqlite3');
const logger = require('./logger.cjs');
const registration = (() => {
// A primary clinic PC allocates offline numbers only after one complete,
// numbered cloud snapshot has initialized its durable high-water mark.
const KEY = 'patient-registration:last-number';
const serial = value => /^BAOR\d{4,}$/.test(String(value || '')) ? Number(String(value).slice(4)) : 0;
const format = n => 'BAOR' + String(n).padStart(4, '0');
function observe(store, rows, complete = false) {
  const previous = store.metaGet(KEY);
  const maximum = Math.max(Number(previous || 0), ...rows.map(p => serial(p.registration_number)), 0);
  if (previous !== undefined || (complete && rows.length && rows.every(p => serial(p.registration_number)))) store.metaSet(KEY, maximum);
}
function allocate(store, row) {
  const existing = store.cacheGetRow('patients', row.id);
  if (existing?.registration_number) return { ...row, registration_number: existing.registration_number };
  const scope = store.metaGet('patient-registration:scope');
  const leases = store.metaGet('patient-registration:leases') || [];
  for (const lease of leases.filter(l => l.scope === scope)) {
    const key = 'patient-registration:used:' + lease.requestId;
    const used = Number(store.metaGet(key) || 0);
    for (let i = used; i < lease.numbers.length; i++) {
      const candidate = lease.numbers[i];
      store.metaSet(key, i + 1);
      if (!serial(candidate) || store.cacheGetAll('patients').some(p => p.registration_number === candidate)) continue;
      return { ...row, registration_number: candidate };
    }
  }
  return { ...row, registration_number: null }; // No invented max+1 number on another device.
}
return { KEY, serial, format, observe, allocate };
})();

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
  rowId = metaGet('alias:' + table + ':' + rowId) || rowId;
  if (String(rowId).startsWith('local_') && getDb().prepare('SELECT 1 FROM table_cache WHERE _key=?').get(`${table}::${String(rowId).slice(6)}`)) rowId = String(rowId).slice(6);
  const r = getDb().prepare(`SELECT data FROM table_cache WHERE _key = ?`).get(`${table}::${rowId}`);
  return r ? JSON.parse(r.data) : undefined;
}

function cacheSetRows(table, rows, idField) {
  rows = rows?.map(row=>villageRow(table,row));
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
    const previous = cacheGetAll(table);
    if (table === 'patients') {
      registration.observe(module.exports, rows, true);
      // Import only the authoritative registration field into pending edits.
      const byId = new Map(rows.map(r => [String(r.id).replace(/^local_/, ''), r]));
      for (const old of previous) {
        const server = byId.get(String(old.id).replace(/^local_/, ''));
        if (server?.registration_number && !old.registration_number) old.registration_number = server.registration_number;
      }
      // Patients saved before initialization can now receive numbers atomically.
      for (const m of queueGetAll().filter(m => m.table === 'patients' && m.op === 'insert')) {
        const old = previous.find(p => p.id === m.tempId);
        if (!old) continue;
        if (old.registration_number) queueUpdate(m.id, { payload: { ...m.payload, registration_number: old.registration_number } });
      }
    }
    rows = rows.map(row => { const old = previous.find(r => r[idField] === row[idField]); return old?._localFileUrl ? { ...row, _localFileUrl: old._localFileUrl } : row; });
    const pending = previous.filter(row => row._pendingSync);
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
    if (table === 'patients' && row.registration_number) {
      const old = cacheGetRow(table, row[idField]) || cacheGetRow(table, 'local_' + id);
      if (old && !old.registration_number) cacheUpsertRow(table, { ...old, registration_number: row.registration_number }, idField);
    }
    if (queueGetAll().some(m => m.table === table && [m.rowId,m.tempId].some(v => v && v.replace(/^local_/, '') === id))) return;
    const existing = cacheGetRow(table, row[idField]) || cacheGetRow(table, 'local_' + id);
    if (existing?._pendingSync) return;
    cacheUpsertRow(table, { ...existing, ...row }, idField);
  })();
}

function cacheUpsertRow(table, row, idField) {
  row = villageRow(table,row);
  const rowId = row[idField];
  if (table === 'patients') registration.observe(module.exports, [row]);
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
    const newId = newRow[idField];
    if (oldId !== newId) {
      metaSet('alias:' + table + ':' + oldId, newId);
      const referenceKeys = { patients: ['patient_id','patientId'], fracture_cases: ['fracture_case_id','caseId'], medicines: ['medicine_id'], medicine_entries: ['entry_id'], billing: ['billing_id'], branches: ['branch_id'], doctors: ['doctor_id'] }[table] || [];
      const remap = value => {
        if (!value || typeof value !== 'object') return value;
        const out = { ...value };
        for (const key of referenceKeys) if (out[key] === oldId) out[key] = newId;
        return out;
      };
      for (const item of getDb().prepare('SELECT * FROM table_cache').all()) {
        const row = JSON.parse(item.data), mapped = remap(row);
        if (JSON.stringify(row) !== JSON.stringify(mapped)) cacheUpsertRow(item.table_name, mapped, 'id');
      }
      for (const mutation of queueGetAll()) {
        const patch = { payload: remap(mutation.payload) };
        if (mutation.table === table && mutation.rowId === oldId) patch.rowId = newId;
        queueUpdate(mutation.id, patch);
      }
    }
  });
  runAll();
}

// ─── Mutation Queue ───────────────────────────────────────────────────────

function queueAdd(mutation) {
  mutation={...mutation,payload:villageRow(mutation.table,mutation.payload)};
  if(mutation.op==='update' && (mutation.expectedPaid!==undefined || mutation.expectedWorkflow)) mutation.payload={...mutation.payload,...(mutation.expectedPaid!==undefined?{_syncExpectedPaid:mutation.expectedPaid}:{}),...(mutation.expectedWorkflow?{_syncExpectedWorkflow:mutation.expectedWorkflow}:{})};
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
  merged.payload=villageRow(merged.table,merged.payload);
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

function cascadeLocalDelete(table, rowId) {
  const keys = { patients: ['patient_id','patientId'], billing: ['billing_id'], fracture_cases: ['fracture_case_id','caseId'], medicine_entries: ['entry_id'] }[table] || [];
  for (const item of getDb().prepare('SELECT * FROM table_cache').all()) {
    const child = JSON.parse(item.data);
    if (keys.some(k => child[k] === rowId)) cascadeLocalDelete(item.table_name, child.id);
  }
  for (const m of queueGetAll()) {
    if ((m.table === table && (m.rowId === rowId || m.tempId === rowId)) || keys.some(k => m.payload?.[k] === rowId)) queueRemove(m.id);
  }
  cacheDeleteRow(table, rowId);
}
function authorizedBatch(items, authorize, ownerUserId) {
  if (!Array.isArray(items) || !items.length || items.length > 500) throw new Error('Invalid transaction');
  return getDb().transaction(() => items.map(item => {
    authorize(item);
    return commitMutation({ ...item.mutation, ownerUserId }, item.row, item.idField);
  }))();
}
function commitBatch(items) {
  if (!Array.isArray(items) || !items.length || items.length > 500) throw new Error('Invalid transaction');
  return getDb().transaction(() => items.map(({mutation,row,idField}) => commitMutation(mutation,row,idField)))();
}
function commitMutation(mutation, row, idField = 'id') {
  return getDb().transaction(() => {
    let saved = row;
    if (mutation.op === 'update') {
      const existing = cacheGetRow(mutation.table, mutation.rowId);
      if (!existing) throw new Error('Record not available locally; refresh before editing');
      if(mutation.expectedWorkflow && JSON.stringify(existing.workflow_data||{})!==JSON.stringify(mutation.expectedWorkflow))throw Error('Record changed; reopen before editing');
      if (mutation.table === 'billing' && mutation.expectedPaid !== undefined && Number(existing.amount_paid || 0) !== mutation.expectedPaid) throw new Error('Payment changed; reopen bill before collecting');
      saved = { ...existing, ...row, [idField]: mutation.rowId, _pendingSync: true };
      if (mutation.table === 'billing' && Array.isArray(saved.payment_history)) {
        const prior = new Set((existing.payment_history || []).map(r => r.id));
        for (const receipt of saved.payment_history) if (typeof receipt.id === 'string' && !prior.has(receipt.id) && Number(receipt.amount) > 0 && !receipt.legacy && !receipt.id.startsWith('reclass:'))
          metaSet('outreach:receipt-origin:' + String(saved.id).replace(/^local_/, '') + ':' + receipt.id, true);
      }
    }
    if(mutation.table==='billing' && mutation.op==='insert' && saved.invoice_number==null){
      const scope=metaGet('invoice-number:scope');const pools=metaGet('invoice-number:pools')||[];
      for(const pool of pools.filter(p=>p.scope===scope)){
        const key='invoice-number:used:'+pool.requestId,used=Number(metaGet(key)||0);
        if(used<pool.numbers.length){saved={...saved,invoice_number:pool.numbers[used]};metaSet(key,used+1);break;}
      }
      mutation={...mutation,payload:{...mutation.payload,...(saved.invoice_number?{invoice_number:saved.invoice_number}:{})}};
    }
    if (mutation.table === 'patients' && mutation.op === 'insert') {
      saved = registration.allocate(module.exports, saved);
      mutation = { ...mutation, payload: { ...mutation.payload, registration_number: saved.registration_number } };
    }
    if (mutation.table === 'patients' && mutation.op === 'update') {
      const existing = cacheGetRow('patients', mutation.rowId);
      if (Object.hasOwn(row, 'registration_number') && row.registration_number !== existing.registration_number)
        throw new Error('Registration number cannot be edited');
    }
    if (mutation.op === 'delete') cascadeLocalDelete(mutation.table, mutation.rowId);
    else cacheUpsertRow(mutation.table, saved, idField);
    queueAdd(mutation);
    return saved;
  })();
}
function commitFinance(items, requestId, result, ownerUserId) {
 return getDb().transaction(()=>{
  if(metaGet('finance:done:'+requestId))return;
  const previous=new Set(queueGetAll().map(m=>m.id));
  for(const item of items){
   if(item.mutation.expectedWorkflow && JSON.stringify(cacheGetRow('patients',item.mutation.rowId)?.workflow_data||{})!==JSON.stringify(item.mutation.expectedWorkflow))throw Error('Advance balance changed');
   if(item.mutation.expectedPatient && cacheGetRow(item.mutation.table,item.mutation.rowId)?.patient_id!==item.mutation.expectedPatient)throw Error('Patient relation changed');
   commitMutation({...item.mutation,ownerUserId},item.row,item.idField);
  }
  for(const m of queueGetAll())if(!previous.has(m.id))queueRemove(m.id);
  queueAdd({table:'billing',op:'clinic_finance',payload:{requestId,items},ownerUserId});
  metaSet('finance:done:'+requestId,result);
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
    if (queueGetAll().length || getDb().prepare("SELECT count(*) AS n FROM table_cache WHERE table_name NOT IN ('branches','profiles','user_roles')").get().n)
      throw new Error('Restore requires an empty test/new database; existing data was not changed');
    for (const [table, rows] of Object.entries(dump.cache)) cacheSetRows(table, rows, 'id');
    for (const m of dump.queue) { const id = queueAdd(m); queueUpdate(id, { ...m, id }); }
    for (const m of dump.meta || []) getDb().prepare('INSERT OR REPLACE INTO meta VALUES (?, ?)').run(m.key,m.value);
    // Restoring an old backup must not reuse a number consumed after that backup.
    getDb().prepare("DELETE FROM meta WHERE (key LIKE 'patient-registration:%' OR key LIKE 'invoice-number:%')").run();
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
// Consistent local-only read for a single patient's account; no cloud request or mutation.
function patientStatementRows(id) {
  return getDb().transaction(() => {
    const normalize=value=>String(value||'').replace(/^local_/,'');
    const resolve=(table,value)=>normalize(metaGet('alias:'+table+':'+value)||value);
    const target=resolve('patients',id);
    const candidates=cacheGetAll('patients').filter(p=>resolve('patients',p.id)===target)
      .sort((a,b)=>Number(!!b._pendingSync)-Number(!!a._pendingSync)||Number(String(a.id).startsWith('local_'))-Number(String(b.id).startsWith('local_')));
    if(!candidates.length)throw Error('STATEMENT-001: Patient not found on this PC');
    const patient={...candidates[0],id:target};
    const bills=cacheGetAll('billing').filter(b=>resolve('patients',b.patient_id)===target).map(b=>({...b,_statementId:resolve('billing',b.id)}));
    return {patient,bills,lastSyncAt:metaGet('last-cloud-sync-at')};
  })();
}
// Consistent read of all local account rows. Clinical data is never changed here.
function patientDirectoryRows() {
  return getDb().transaction(() => {
    const patients = new Map();
    for (const p of cacheGetAll('patients').sort((a,b)=>Number(!!b._pendingSync)-Number(!!a._pendingSync)||Number(String(a.id).startsWith('local_'))-Number(String(b.id).startsWith('local_')))) {
      const id = String(metaGet('alias:patients:'+p.id)||p.id||'').replace(/^local_/,'');
      if (id && !patients.has(id)) patients.set(id,{...p,id});
    }
    return [...patients.values()];
  })();
}
function monthlyAccountRows() {
  return getDb().transaction(() => {
    const norm=v=>String(v||'').replace(/^local_/,'');
    const resolve=(table,value)=>norm(metaGet('alias:'+table+':'+value)||value);
    const patients=new Map();
    for(const p of cacheGetAll('patients').sort((a,b)=>Number(!!b._pendingSync)-Number(!!a._pendingSync)||Number(String(a.id).startsWith('local_'))-Number(String(b.id).startsWith('local_')))) {
      const id=resolve('patients',p.id);if(!patients.has(id))patients.set(id,{...p,id});
    }
    return {patients:[...patients.values()],bills:cacheGetAll('billing').map(b=>({...b,patient_id:resolve('patients',b.patient_id),_statementId:resolve('billing',b.id)}))};
  })();
}
// Diagnostic reads are bounded and never alter clinical records or queue state.
function diagnosticSnapshot({ deep = false } = {}) {
  const db = getDb();
  const max = 50000;
  return db.transaction(() => {
    const counts = db.prepare('SELECT table_name, count(*) AS n FROM table_cache GROUP BY table_name').all();
    const raw = db.prepare('SELECT _key, table_name, data FROM table_cache LIMIT ?').all(max);
    const cache = {}; let malformed = 0;
    for (const r of raw) { try { (cache[r.table_name] ||= []).push(JSON.parse(r.data)); } catch { malformed++; } }
    const queueCount = db.prepare('SELECT count(*) AS n FROM mutation_queue').get().n;
    const queueCounts=db.prepare('SELECT op, count(*) AS n FROM mutation_queue GROUP BY op').all();
    const queue = []; let malformedQueue = 0;
    for (const r of db.prepare('SELECT * FROM mutation_queue ORDER BY id LIMIT ?').all(max)) {
      try { queue.push(rowToMutation(r)); } catch { malformedQueue++; }
    }
    // Whitelist operational metadata; never export saved credentials or full SMS payloads.
    const meta = {};
    for (const key of ['last-cloud-sync-at', 'whatsapp:invoice-jobs', 'whatsapp:settings']) meta[key] = metaGet(key);
    const smsJournal = db.prepare("SELECT value FROM meta WHERE key LIKE 'sms-dispatch:%' LIMIT ?").all(max).map(r => {try{return JSON.parse(r.value)?.state}catch{return 'invalid'}});
    return { counts, cache, queue, queueCounts, queueCount:Number(queueCount), malformed, malformedQueue,
      truncated: counts.reduce((n,r)=>n+Number(r.n),0)>max || Number(queueCount)>max || smsJournal.length>=max,
      integrity: db.prepare(deep ? 'PRAGMA integrity_check(20)' : 'PRAGMA quick_check(1)').all(),
      journalMode: db.prepare('PRAGMA journal_mode').get(), meta, smsJournal };
  })();
}
/** Address-only local correction; no queue item, receipt or patient ID is removed. */
function correctApprovedVillages(){
 return getDb().transaction(()=>{
  const before=[];
  const update=getDb().prepare('UPDATE table_cache SET data=? WHERE _key=?');
  for(const row of cacheGetAll('patients')){
   if(typeof row.address!=='string')continue;
   const address=canonicalVillage(row.address);if(address===row.address)continue;
   before.push({id:row.id,address:row.address});
   update.run(JSON.stringify({...row,address}),'patients::'+row.id);
  }
  let queued=0;
  for(const m of queueGetAll())if(m.table==='patients'&&typeof m.payload?.address==='string'){
   const address=canonicalVillage(m.payload.address);if(address!==m.payload.address){queueUpdate(m.id,{payload:{...m.payload,address}});queued++;}
  }
  if(before.length||queued)metaSet('villages:'+VILLAGE_REVISION,{at:new Date().toISOString(),before,queued});
  return {patients:before.length,queuePayloads:queued};
 })();
}

module.exports = {
  correctApprovedVillages, setVillageNormalizer,
  patientDirectoryRows,
  commitFinance,
  monthlyAccountRows, patientStatementRows, diagnosticSnapshot, authorizedBatch, commitBatch, commitMutation, snapshot, restoreSnapshot, adjustStock, cacheMergeServer,
  init, close,
  cacheGetAll, cacheGetRow, cacheSetRows, cacheReplaceTable, cacheUpsertRow, cacheDeleteRow, cacheReplaceRowKey,
  queueAdd, queueGetAll, queueRemove, queueUpdate,
  metaGet, metaSet,
  importLegacyDump, isLegacyMigrated,
};
