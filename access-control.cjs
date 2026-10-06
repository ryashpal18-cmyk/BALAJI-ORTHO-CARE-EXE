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
function setPrincipal(value) { principal = value; }
function getPrincipal() { return principal && principal.expiresAt > Date.now() ? principal : null; }
function canTable(table) {
  const p = getPrincipal(); if (!p) return false; if (p.role === 'admin') return true;
  return (TABLE_PAGES[table] || []).some(page => page === '*' || p.pages.includes(page));
}
function assertTable(table) { if (!canTable(table)) throw new Error('Access denied for ' + table); }
function authorize(channel, args, store) {
  if (['auth:login','auth:check','auth:logout','auth:establish','app:isOnline','app:getVersion','log:rendererError'].includes(channel)) return;
  const p = getPrincipal(); if (!p) throw new Error('Please log in');
  if (p.role === 'admin') return;
  if (['offline:cacheGetAll'].includes(channel)) return assertTable(args[0]);
  if (channel.startsWith('offline:cache')) return assertTable(args[0]?.table);
  if (channel === 'offline:commitMutation') {
    const { mutation, row } = args[0] || {}; assertTable(mutation?.table);
    if (mutation.op === "delete") throw new Error("Administrator permission required to delete records");
    if (p.branchIds != null && ['patients','billing','appointments'].includes(mutation.table)) {
      const current = mutation.rowId ? store.cacheGetRow(mutation.table, mutation.rowId) : row;
      if (!current || !p.branchIds.includes(current.branch_id) || (row?.branch_id && !p.branchIds.includes(row.branch_id))) throw new Error('Branch access denied');
    }
    return;
  }
  if (channel === 'offline:adjustStock') { assertTable('medicines'); return assertTable('stock_movements'); }
  if (channel === 'offline:queueAdd') return assertTable(args[0]?.table);
  if (channel === 'offline:queueGetAll') return;
  if (channel === 'offline:queueRemove' || channel === 'offline:queueUpdate') {
    const id = channel.endsWith('Update') ? args[0]?.id : args[0];
    const item = store.queueGetAll().find(m => m.id === id);
    if (!item) throw new Error('Queue item not found'); return assertTable(item.table);
  }
  if (['offline:isLegacyMigrated','app:openExternal','open-external-url','open-whatsapp','app:print','shell:print','print-invoice','log:getDir','log:getSnapshotDir'].includes(channel)) return;
  if (['app:sendSMS','open-whatsapp-desktop'].includes(channel)) return assertTable('sms_logs');
  throw new Error('Administrator permission required');
}
function filterBranches(rows) {
  const p = getPrincipal();
  return !p || p.role === 'admin' || p.branchIds == null ? rows : rows.filter(r => p.branchIds.includes(r.branch_id));
}
module.exports = { filterBranches, setPrincipal, getPrincipal, canTable, authorize, TABLE_PAGES };
