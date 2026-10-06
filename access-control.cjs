"use strict";
// Main-process principal; renderer localStorage is never an authority.
let principal = null;
const TABLE_PAGES = {
  patients: ['/dashboard','/opd','/appointments','/billing','/due-amount','/ortho','/reports','/physiotherapy','/prescription','/patient-medicine','/whatsapp','/insurance-claims','/booking-requests'],
  billing: ['/dashboard','/billing','/due-amount','/cash-tally','/daily-cash-book','/analytics','/revenue-dashboard','/medicine-commission'],
  appointments: ['/dashboard','/appointments','/booking-requests'],
  prescriptions: ['/prescription','/opd'], medical_history: ['/opd'],
  fracture_cases: ['/ortho','/plaster-sync'], fracture_xrays: ['/ortho','/plaster-sync'], hospitals: ['/ortho'],
  physiotherapy_sessions: ['/physiotherapy','/ortho'], beds: ['/ipd','/dashboard'],
  xray_reports: ['/reports','/ortho'], report_payments: ['/reports','/analytics'],
  cash_book_entries: ['/daily-cash-book'], cash_book_days: ['/daily-cash-book'],
  payments: ['/billing','/daily-cash-book','/cash-tally'],
  medicines: ['/inventory','/medicine-master','/patient-medicine'], stock_movements: ['/inventory'],
  medicine_entries: ['/patient-medicine','/medicine-commission'], invoice_medicine_mapping: ['/patient-medicine','/medicine-commission'],
  patient_medicines: ['/patient-medicine','/opd'], sms_logs: ['/sms-logs','/whatsapp','/due-amount','/billing','/ortho'],
  insurance_claims: ['/insurance-claims'], booking_requests: ['/booking-requests'],
  branches: ['*'], audit_logs: ['/audit-log'], deleted_records_log: [],
};

const BRANCH_TABLES = new Set(['patients','billing','appointments']);
const PATIENT_TABLES = new Set(['prescriptions','medical_history','fracture_cases','fracture_xrays','physiotherapy_sessions','beds','xray_reports','insurance_claims','patient_medicines']);
const CASH_TABLES = new Set(['cash_book_days','cash_book_entries']);
function setPrincipal(value) { principal = value; }
function getPrincipal() { return principal && principal.expiresAt > Date.now() ? principal : null; }
function canTable(table) {
  const p = getPrincipal(); if (!p) return false; if (p.role === 'admin') return true;
  if (CASH_TABLES.has(table) && p.branchIds != null) return false; // Historical cashbook is clinic-wide.
  return (TABLE_PAGES[table] || []).some(page => page === '*' || p.pages.includes(page));
}
function assertTable(table) { if (!canTable(table)) throw new Error('Access denied for ' + table); }
function lookup(store, table, id) {
  if (!id) return null;
  return store.cacheGetRow(table,id) || store.cacheGetRow(table,String(id).replace(/^local_/,'')) || store.cacheGetRow(table,'local_'+id);
}
function rowAllowed(table, row, store) {
  const p = getPrincipal(); if (!p || !row) return false;
  if (p.role === 'admin' || p.branchIds == null) return true;
  if (CASH_TABLES.has(table)) return false;
  if (BRANCH_TABLES.has(table)) return p.branchIds.includes(row.branch_id);
  if (PATIENT_TABLES.has(table)) {
    const patient = lookup(store,'patients',row.patient_id || row.patientId);
    return !!patient && p.branchIds.includes(patient.branch_id);
  }
  if (table === 'payments') return rowAllowed('billing',lookup(store,'billing',row.billing_id || row.invoice_id),store);
  // No patient/branch link exists for these legacy tables; don't expose clinic-wide data to restricted staff.
  if (table === 'sms_logs') {
    const digits = String(row.mobile || '').replace(/\D/g,'').slice(-10);
    return digits.length === 10 && store.cacheGetAll('patients').some(patient => p.branchIds.includes(patient.branch_id) && String(patient.mobile || '').replace(/\D/g,'').slice(-10) === digits);
  }
  if (['report_payments','booking_requests','sms_logs','audit_logs','medicine_entries','invoice_medicine_mapping'].includes(table)) return false;
  return true;
}
function filterRows(table, rows, store) { return rows.filter(row => rowAllowed(table,row,store)); }
function canMutation(m, store) {
  const p = getPrincipal(); if (!p) return false; if (p.role === 'admin') return true;
  if (!p.userId || m.ownerUserId !== p.userId || m.op === 'delete') return false;
  if (m.table === 'audit_logs') return m.op === 'insert'; // own append-only events, not global log visibility
  if (!canTable(m.table)) return false;
  const row = m.op === 'update' ? { ...lookup(store,m.table,m.rowId), ...m.payload } : m.payload;
  return rowAllowed(m.table,row,store);
}
function assertRow(table,row,store) { if (!rowAllowed(table,row,store)) throw new Error('Branch access denied'); }
function protectClosedDay(table, old, row) {
  if (table === 'cash_book_days' && old?.status === 'closed') {
    for (const key of Object.keys(row || {})) {
      if (!['id','_pendingSync','updated_at','closed_by','closed_at'].includes(key) && JSON.stringify(old[key]) !== JSON.stringify(row[key]))
        throw new Error('Administrator must reopen the closed cash day');
    }
  }
}
function assertCashEntryOpen(table, row, store) {
  if (table !== 'cash_book_entries' || !row?.entry_date) return;
  if (store.cacheGetAll('cash_book_days').some(d => d.entry_date === row.entry_date && d.status === 'closed')) throw new Error('Reopen the cash day before changing entries');
}
function authorize(channel, args, store) {
  if (['offline:commitMutation','offline:queueAdd'].includes(channel)) {
    const m = channel === 'offline:commitMutation' ? args[0]?.mutation : args[0];
    if (m?.table === 'cash_book_entries') {
      assertCashEntryOpen(m.table, lookup(store,m.table,m.rowId), store);
      assertCashEntryOpen(m.table, m.payload, store);
    }
  }
  if (['auth:login','auth:check','auth:logout','auth:establish','app:isOnline','app:getVersion','log:rendererError'].includes(channel)) return;
  const p = getPrincipal(); if (!p) throw new Error('Please log in');
  if (p.role === 'admin') return;
  if (channel === 'offline:refreshCashDays') return assertTable('cash_book_days');
  if (channel === 'offline:cacheGetAll') return assertTable(args[0]);
  if (channel === 'offline:cacheGetRow') return assertTable(args[0]?.table); // result filtered in handler
  if (channel.startsWith('offline:cache')) {
    const a=args[0] || {}; assertTable(a.table);
    if (channel === 'offline:cacheDeleteRow') throw new Error('Administrator permission required');
    if (a.oldId) { const old=lookup(store,a.table,a.oldId); if (old) assertRow(a.table,old,store); }
    const rows=a.rows || [a.row || a.newRow];
    for (const row of rows) {
      assertRow(a.table,row,store);
      const old = lookup(store,a.table,row.id);
      if (old) assertRow(a.table,old,store);
      protectClosedDay(a.table,lookup(store,a.table,row.id),row);
    }
    return;
  }
  if (channel === 'offline:commitMutation' || channel === 'offline:queueAdd') {
    const {mutation,row}=channel === 'offline:commitMutation' ? args[0] || {} : {mutation:args[0],row:args[0]?.payload};
    if (!mutation || !['insert','update','xray_upload','sms'].includes(mutation.op)) throw new Error('Mutation not permitted');
    if (mutation.table === 'audit_logs' && mutation.op === 'insert') return;
    assertTable(mutation.table);
    const old=mutation.rowId ? lookup(store,mutation.table,mutation.rowId) : null;
    if (mutation.rowId) assertRow(mutation.table,old,store);
    if (row) assertRow(mutation.table,{...old,...row},store);
    const updated={...old,...row,...mutation.payload};
    assertRow(mutation.table,updated,store);protectClosedDay(mutation.table,old,updated);
    return;
  }
  if (channel === 'offline:adjustStock') { assertTable('medicines'); return assertTable('stock_movements'); }
  if (channel === 'offline:queueGetAll') return; // filtered by verified owner, operation and branch in main
  if (channel === 'offline:queueRemove' || channel === 'offline:queueUpdate') {
    const id=channel.endsWith('Update') ? args[0]?.id : args[0];
    const item=store.queueGetAll().find(m=>m.id===id);
    if (!item || !canMutation(item,store)) throw new Error('Queue access denied');
    if (channel.endsWith('Update')) {
      const patch=args[0].patch || {};
      if (Object.keys(patch).some(k=>!['retries','lastError','lastAttemptAt','rowId','payload'].includes(k))) throw new Error('Queue identity is immutable');
      if (patch.rowId && patch.rowId !== item.rowId?.replace(/^local_/,'')) throw new Error('Invalid queue remap');
      if (!canMutation({...item,...patch},store)) throw new Error('Queue branch access denied');
    }
    return;
  }
  if (['offline:isLegacyMigrated','app:openExternal','open-external-url','open-whatsapp','app:print','shell:print','print-invoice','log:getDir','log:getSnapshotDir'].includes(channel)) return;
  if (['app:sendSMS','open-whatsapp-desktop'].includes(channel)) { assertTable('sms_logs'); if (channel === 'app:sendSMS') assertRow('sms_logs',args[0],store); return; }
  throw new Error('Administrator permission required');
}
function filterBranches(rows) { const p=getPrincipal(); return !p ? [] : p.role==='admin'||p.branchIds==null ? rows : rows.filter(r=>p.branchIds.includes(r.branch_id)); }
module.exports = { filterBranches, filterRows, rowAllowed, canMutation, setPrincipal, getPrincipal, canTable, authorize, TABLE_PAGES };
