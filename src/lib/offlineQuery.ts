import { validCalendarDate } from "./followupState";
import { queryClient } from "./queryClient";
import { withPaymentHistory, normalizeBill } from "./paymentLedger";
import { commitMutation, commitBatch } from "./offlineDb";
import { ensureCloudSession } from "./localSession";
// ─────────────────────────────────────────────────────────────────────────
// Offline-aware query/mutation helpers
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { isOnline, runSync } from "./offlineSync";
import { cLog } from "@/lib/clientLogger";
import {
  cacheGetAll,
  cacheGetRow,
  cacheReplaceTable,
  cacheUpsertRow,
  cacheUpsertRowFromServer,
  cacheDeleteRow,
  queueAdd,
  queueGetAll,
  queueUpdate,
  tempId,
} from "./offlineDb";

// Read/merge/write belongs to the same chain; errors reach the Save caller.
const chains = new Map<string, Promise<any>>();
function serialize<T>(key: string, action: () => Promise<T>): Promise<T> {
  const next = (chains.get(key) || Promise.resolve()).then(action, action);
  chains.set(key, next);
  next.then(() => { if (chains.get(key) === next) chains.delete(key); }, () => { if (chains.get(key) === next) chains.delete(key); });
  return next;
}
function syncLater() { void isOnline().then(online => { if (online) return runSync(); }).catch(e => cLog.warn("sync", "Background sync failed", e)); }

const refreshes = new Set<string>();
const refreshedAt = new Map<string, number>();
function refreshLocalTable(table: string, fetcher: () => Promise<any[]>, idField: string) {
  if (typeof navigator === "undefined" || !navigator.onLine || refreshes.has(table) || Date.now() - (refreshedAt.get(table) || 0) < 3000) return;
  refreshes.add(table);
  void (async () => {
    try {
      if (!(await ensureCloudSession())) return;
      const before = JSON.stringify(await cacheGetAll(table));
      const rows = await fetcher();
      for (const row of rows) if (row?.[idField] !== undefined) await cacheUpsertRowFromServer(table, row, idField);
      refreshedAt.set(table, Date.now());
      if (before !== JSON.stringify(await cacheGetAll(table))) void queryClient.invalidateQueries();
    } catch (error) { cLog.warn("offline", `${table}: background refresh delayed; local data retained`, error); }
    finally { refreshes.delete(table); }
  })();
}
export async function offlineFetch<T = any>(table: string, fetcher: () => Promise<T[]>, opts: { idField?: string } = {}): Promise<T[]> {
  const cached = await cacheGetAll(table);
  refreshLocalTable(table, fetcher, opts.idField || "id");
  return cached as T[];
}
export async function offlineFetchScoped<T = any>(table: string, fetcher: () => Promise<T[]>, fallbackFilter: (rows: any[]) => any[], opts: { idField?: string } = {}): Promise<T[]> {
  const cached = await cacheGetAll(table);
  refreshLocalTable(table, fetcher, opts.idField || "id");
  return fallbackFilter(cached) as T[];
}

export async function offlineInsert(table: string, payload: any, opts: { idField?: string } = {}) {
  const idField = opts.idField || "id";
  const rowId = payload[idField] || tempId();
  return serialize(table === "physiotherapy_sessions" ? `${table}::${String(payload.patient_id).replace(/^local_/, "")}::${payload.fracture_case_id || payload.exercise_plan || "default"}` : `${table}::${rowId}`, async () => {
    if (table === "physiotherapy_sessions") {
      const n=Number(payload.session_number), total=Number(payload.total_sessions), pain=Number(payload.pain_scale);
      if(!Number.isInteger(n)||!Number.isInteger(total)||n<1||total<1||n>total||!Number.isFinite(pain)||pain<0||pain>10) throw new Error("सही session, total और pain 0–10 भरें");
      const same=(await cacheGetAll(table)).some(r=>String(r.patient_id).replace(/^local_/,'')===String(payload.patient_id).replace(/^local_/,'') && (payload.fracture_case_id ? String(r.fracture_case_id).replace(/^local_/,'')===String(payload.fracture_case_id).replace(/^local_/,'') : !r.fracture_case_id && r.exercise_plan===payload.exercise_plan) && Number(r.session_number)===n);
      if(same) throw new Error("इस मरीज का यह session पहले से सेव है। नया course हो तो अलग exercise plan लिखें।");
    }
    if (table === "billing") payload = normalizeBill(payload);
    let row: any = { created_at: new Date().toISOString(), ...payload, [idField]: rowId, _pendingSync: true };
    if (row.patient_id) {
      const patient = await cacheGetRow('patients', row.patient_id);
      if (patient) row.patient_id = patient.id;
    }
    if (["patients", "billing", "appointments"].includes(table) && !row.branch_id) {
      const parent = row.patient_id ? await cacheGetRow("patients", row.patient_id) : null;
      const branches = (await cacheGetAll("branches")).filter(b => b.is_active);
      row.branch_id = parent?.branch_id || localStorage.getItem("bocc_selected_branch") || (branches.length === 1 ? branches[0].id : null);
      if (!row.branch_id) throw new Error("Select a branch before saving this record");
    }
    if (table === "billing") row = withPaymentHistory({ id: rowId, amount_paid: 0 }, row, tempId().slice(6), row.created_at);
    const saved = await commitMutation({ table, op: "insert", payload: row, tempId: rowId }, row, idField);
    syncLater(); return saved;
  });
}
export async function offlineUpdate(table: string, rowId: string, updates: any, opts: { idField?: string; select?: string } = {}) {
  return serialize(`${table}::${rowId}`, async () => {
    const existing = await cacheGetRow(table, rowId);
    if (!existing) throw new Error("Record not available locally; refresh before editing");
    rowId = existing.id || rowId;
    const { _auditReason, _receiptId, _expectedPaid, _collectAmount, _workflowPatch, ...fields } = updates;
    if (table === "billing" && _expectedPaid !== undefined && Number(existing.amount_paid || 0) !== _expectedPaid)
      throw new Error("इस बिल का भुगतान बदल गया है। दोबारा खोलकर राशि जाँचें।");
    if (table === "billing" && _collectAmount !== undefined) {
      const amount = Number(_collectAmount);
      if (existing.status === "Cancelled") throw new Error("रद्द bill पर भुगतान नहीं ले सकते");
      const due = Math.max(Number(existing.amount || 0) - Number(existing.discount || 0) - Number(existing.amount_paid || 0), 0);
      if (!Number.isFinite(amount) || amount <= 0 || amount > due) throw new Error("जमा राशि बकाया से अधिक या शून्य नहीं हो सकती");
      fields.amount_paid = Math.round((Number(existing.amount_paid || 0) + amount) * 100) / 100;
    }
    if(_workflowPatch) fields.workflow_data={...existing.workflow_data,..._workflowPatch};
    let changes = table === "billing" ? normalizeBill(fields, existing) : { ...fields };
    if (table === "billing") changes = withPaymentHistory(existing, changes, _receiptId || tempId().slice(6), new Date().toISOString());
    const expectedBill=table==="billing"?Object.fromEntries(["amount","discount","amount_paid","status","patient_id","payment_history"].map(k=>[k,existing[k]??null])):undefined;
    const item = { mutation: { table, op: "update", rowId, payload: changes, ...(expectedBill?{expectedBill}:{}), ...(_workflowPatch ? {expectedWorkflow:existing.workflow_data||{}} : {}), ...(_expectedPaid !== undefined ? { expectedPaid: _expectedPaid } : {}) }, row: changes, idField: opts.idField || "id" };
    let saved;
    if (table === "billing") {
      const auditId = tempId();
      const before = Object.fromEntries(["amount", "discount", "amount_paid", "payment_mode", "service", "status"].map(k => [k, existing[k] ?? null]));
      const after = Object.fromEntries(Object.keys(before).map(k => [k, changes[k] ?? existing[k] ?? null]));
      const audit = { id: auditId, created_at: new Date().toISOString(), actor_name: localStorage.getItem("userName") || "Admin",
        actor_role: localStorage.getItem("bocc_user_role") || "admin", action: "update", module: "billing", record_id: rowId,
        description: JSON.stringify({ reason: _auditReason || "Bill edited", before, after }), _pendingSync: true };
      [saved] = await commitBatch([item, { mutation: { table: "audit_logs", op: "insert", tempId: auditId, payload: audit }, row: audit }]);
    } else saved = await commitMutation(item.mutation, changes, item.idField);
    syncLater(); return saved;
  });
}
export async function offlineDelete(table: string, rowId: string) {
  const existing = await cacheGetRow(table, rowId);
  rowId = existing?.id || rowId;
  await serialize(`${table}::${rowId}`, () => commitMutation({ table, op: "delete", rowId }, null));
  syncLater();
}


export async function saveFollowUpDates(caseId: string, followup: string, removal: string) {
  for (const date of [followup, removal]) if (date && !validCalendarDate(date)) throw new Error("सही तारीख चुनें");
  return serialize("fracture_cases::" + caseId, async () => {
    const c = await cacheGetRow("fracture_cases", caseId);
    if (!c) throw new Error("केस डिवाइस पर उपलब्ध नहीं है");
    const patient = await cacheGetRow("patients", c.patient_id);
    if (!patient?.branch_id) throw new Error("मरीज की branch चुनें");
    const now = new Date().toISOString(), changes = { next_followup_date: followup || null, workflow_data:{...c.workflow_data,followup_state:"तय है",followup_for:followup||null,followup_history:[...(c.workflow_data?.followup_history||[]),...(c.workflow_data?.followup_checked_at?[{date:c.workflow_data.followup_for||c.next_followup_date,state:c.workflow_data.followup_state,checked_at:c.workflow_data.followup_checked_at}]:[])],followup_checked_at:null}, updated_at: now };
    const items: any[] = [{ mutation:{table:"fracture_cases", op:"update", rowId:c.id, expectedWorkflow:c.workflow_data||{}, payload:changes}, row:changes }];
    const notes = "cast-removal:" + String(c.id).replace(/^local_/, "");
    const existing = (await cacheGetAll("appointments")).find(a => a.notes === notes);
    if (removal || existing) {
      const id = existing?.id || tempId();
      const row = { ...(existing || {}), id, patient_id:patient.id, branch_id:patient.branch_id, notes,
        date:removal || existing.date, status:removal ? "Scheduled" : "Cancelled", updated_at:now,
        created_at:existing?.created_at || now, patients:patient };
      items.push({ mutation:{table:"appointments", op:existing ? "update" : "insert", ...(existing ? {rowId:id} : {tempId:id}), payload:row}, row });
    }
    const result = await commitBatch(items); syncLater(); return result[0];
  });
}
