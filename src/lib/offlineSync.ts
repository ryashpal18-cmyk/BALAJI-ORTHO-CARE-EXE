import { fetchCompleteTable, OPERATIONAL_TABLES } from "./completeFetch";
import { ensureCloudSession } from "./localSession";
// ─────────────────────────────────────────────────────────────────────────
// Network status + background sync engine
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { cLog } from "@/lib/clientLogger";
import { isValidMobile } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { queueGetAll, queueRemove, queueUpdate, queueRemapRowId, cacheReplaceRowKey, cacheDeleteRow, cacheReplaceTable, cacheUpsertRow, cacheGetAll, backupCacheToDisk, QueuedMutation, MAX_SYNC_RETRIES } from "./offlineDb";


declare global {
  interface Window {
    electron?: {
      isOnline?: () => Promise<{ online: boolean }>;
      writeLog?: (data: { fileName: string; line: string }) => Promise<void>;
      [key: string]: any;
    };
    __ELECTRON__?: boolean;
  }
}

let lastKnownOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

export async function isOnline(): Promise<boolean> {
  try {
    if (window.electron?.isOnline) {
      const res = await window.electron.isOnline();
      return !!res?.online;
    }
  } catch {}
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

export function isOnlineSync(): boolean {
  return lastKnownOnline;
}

type NetListener = (online: boolean) => void;
const netListeners = new Set<NetListener>();

export function onNetworkChange(fn: NetListener) {
  netListeners.add(fn);
  return () => netListeners.delete(fn);
}

function emitNetworkChange(online: boolean) {
  lastKnownOnline = online;
  netListeners.forEach((fn) => fn(online));
}

if (typeof window !== "undefined") {
  window.addEventListener("online", async () => {
    const really = await isOnline();
    emitNetworkChange(really);
    if (really) {
      cLog.info("sync", "Internet aa gayi — sync + data download shuru");
      void runSync().catch(error => cLog.warn("sync", "Sync failed", error));
      void downloadAllDataToCache().catch(error => cLog.warn("sync", "Refresh delayed", error));
    }
  });
  window.addEventListener("offline", () => {
    cLog.warn("sync", "Internet chali gayi — offline mode");
    emitNetworkChange(false);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// ✅ NAYA: Saara online data PC mein download karo
// Ye function internet aane pe aur app start pe chalega
// Patients, billing, appointments — sab kuch IndexedDB mein save ho jayega
// ─────────────────────────────────────────────────────────────────────────

let downloadInProgress = false;

export async function downloadAllDataToCache(): Promise<void> {
  if (downloadInProgress || !(await isOnline())) return;
  if (!(await ensureCloudSession())) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return; // Never interpret anonymous/RLS-empty results as an authoritative wipe.
  downloadInProgress = true;
  try {
    for (const table of OPERATIONAL_TABLES) {
      try {
        const select = ["billing", "appointments", "prescriptions", "physiotherapy_sessions", "xray_reports", "fracture_cases", "insurance_claims", "beds"].includes(table) ? "*, patients(*)" : "*";
        const rows = await fetchCompleteTable(table, select);
        await cacheReplaceTable(table, rows);
      } catch (error) { cLog.warn("sync", `${table}: complete refresh failed; existing cache preserved`, error); }
    }
    void queryClient.invalidateQueries();
  } finally { downloadInProgress = false; }
}

// ─── Sync engine ───

type SyncListener = (status: { syncing: boolean; pending: number; lastError?: string }) => void;
const syncListeners = new Set<SyncListener>();
let syncing = false;

export function onSyncStatus(fn: SyncListener) {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
}

function emitSyncStatus(pending: number, lastError?: string) {
  syncListeners.forEach((fn) => fn({ syncing, pending, lastError }));
}

// 🚨 FIX: MAX_RETRIES ab offlineDb.ts se aata hai (MAX_SYNC_RETRIES) taaki
// "pending" count aur "sync stop karo" ki limit hamesha SAME number use
// karein — pehle dono jagah alag-alag hardcoded the, mismatch ka risk tha.
const MAX_RETRIES = MAX_SYNC_RETRIES;

// 🚨 FIX: pehle sirf row ki apni "id" se "local_" prefix hataya jaata tha.
// Lekin agar offline mein naya patient banao aur turant uski billing bhi
// banao, to billing.patient_id = "local_<uuid>" hi rehta tha — Supabase
// isse "invalid input syntax for type uuid" bolke reject kar deta tha
// (dekha gaya: diagnostic report mein "table: billing" wali error).
// Fix: kisi bhi "*_id" field mein agar "local_" prefix mile, use bhi hatao —
// kyunki wahi UUID hi (prefix hata ke) parent record ka final Supabase id
// banega (upsert-based insert ki wajah se id badalta nahi hai).
function stripLocalPrefixes(payload: Record<string, any>) {
  const out = { ...payload };
  for (const key of Object.keys(out)) {
    if (key.endsWith("_id") && typeof out[key] === "string" && out[key].startsWith("local_")) {
      out[key] = out[key].slice("local_".length);
    }
  }
  return out;
}

// 🚨 FIX: kabhi kabhi UI convenience ke liye payload mein ek "relation"
// object bhi attach kar diya jaata hai (jaise billing.patients = {name,
// mobile}) — taaki local cache mein patient ka naam turant dikhe. Lekin
// Supabase ke asli table mein aisa koi column nahi hota (billing mein sirf
// patient_id hai, "patients" nahi) — isliye sync fail ho jaata tha:
// "Could not find the 'patients' column of 'billing' in the schema cache".
// Ye function aise embedded objects ko sync se pehle hata deta hai — sirf
// genuinely allowed JSONB columns (jaise record_data) ko chhodta hai.
const ALLOWED_OBJECT_FIELDS = new Set(["record_data"]);
function stripEmbeddedRelations(payload: Record<string, any>) {
  const out = { ...payload };
  for (const key of Object.keys(out)) {
    const val = out[key];
    if (val && typeof val === "object" && !Array.isArray(val) && !ALLOWED_OBJECT_FIELDS.has(key)) {
      delete out[key];
    }
  }
  return out;
}

async function applyMutation(m: QueuedMutation): Promise<void> {
  const table = m.table as any;
  const latestQueue = await queueGetAll();
  const parents = Object.entries(m.payload || {}).filter(([key, value]) =>
    (key.endsWith("_id") || key === "caseId" || key === "patientId") && typeof value === "string" && value.startsWith("local_"));
  if (parents.some(([, value]) => latestQueue.some(q => q.op === "insert" && q.tempId === value && q.id !== m.id)))
    throw new Error("PENDING_PARENT_INSERT");
  if (m.rowId?.startsWith("local_")) {
    if (latestQueue.some(q => q.table === table && q.op === "insert" && q.tempId === m.rowId)) throw new Error("PENDING_PARENT_INSERT");
    m = { ...m, rowId: m.rowId.slice(6) };
  }


  if (m.table === "audit_logs" && m.op === "insert") {
    const { data, error } = await supabase.rpc("append_audit_event" as any, {
      p_id: (m.tempId || m.payload.id).replace(/^local_/, ""), p_event: stripLocalPrefixes(m.payload),
    } as any);
    if (error) throw error;
    if (data !== true) throw new Error("Audit event not acknowledged");
    return;
  }
  if (m.op === "insert") {
    let payload = { ...m.payload };
    // ✅ tempId ab "local_<real-uuid>" hai — prefix hata ke wahi UUID
    // Supabase pe bhi id ke roop mein use karo (naya generate mat karo).
    if (m.tempId) {
      const realId = m.tempId.startsWith("local_") ? m.tempId.slice("local_".length) : m.tempId;
      payload.id = realId;
    }
    payload = stripLocalPrefixes(payload);
    payload = stripEmbeddedRelations(payload);
    // ✅ FIX: Local-only fields Supabase ko mat bhejo — schema mein nahi hain
    delete payload._pendingSync;
    delete payload._localOnly;
    // ✅ upsert use karo (insert nahi) — agar retry ho (network drop mid-sync
    // ke baad), to same id pe dobara likhega, duplicate row nahi banega.
    const { data, error } = table === "cash_book_days"
      ? await supabase.rpc("save_cash_day" as any, { p_id: payload.id, p_event: payload } as any)
      : await supabase.from(table).upsert(payload, { onConflict: "id" }).select().single();
    if (error) { console.error(`Insert failed — table: ${table}`); throw error; }
    if (m.tempId && data) {
      const remaining = (await queueGetAll()).filter(q => q.id !== m.id && q.table === table && (q.rowId === m.tempId || q.rowId === (data as any).id));
      const local = (await cacheGetAll(table)).find(r => r.id === m.tempId);
      if (remaining.some(q => q.op === "delete")) { await cacheDeleteRow(table, m.tempId); await cacheDeleteRow(table, (data as any).id); }
      else await cacheReplaceRowKey(table, m.tempId, remaining.length && local ? { ...(data as any), ...local, id: (data as any).id, _pendingSync: true } : data, "id");
      // ✅ Isi row par pehle se pending koi update/delete mutation ho to
      // uska rowId bhi purane temp id se naye asli id par shift kar do —
      // warna wo mutation hamesha "PENDING_PARENT_INSERT" bol ke atka rahega.
      await queueRemapRowId(table, m.tempId, (data as any).id);
    }
    console.info(`Insert sync OK — table: ${table}`);
    return;
  }

  if (m.op === "update") {
    if (!m.rowId) throw new Error("update mutation missing rowId");
    if (m.rowId.startsWith("local_")) throw new Error("PENDING_PARENT_INSERT");
    let updatePayload = stripLocalPrefixes({ ...m.payload });
    updatePayload = stripEmbeddedRelations(updatePayload);
    delete updatePayload._pendingSync;
    delete updatePayload._localOnly;
    const { data: serverRow, error } = await supabase.from(table).update(updatePayload).eq("id", m.rowId).select().single();
    if (error) { console.error(`Update failed — table: ${table}`); throw error; }
    // 🚨 FIX: Update sync ho jaane ke baad local cache row abhi bhi
    // "_pendingSync: true" flagged reh jaata tha — isse wo row hamesha ke
    // liye background server-refresh se "protected" (excluded) reh jaata,
    // aur kabhi bhi fresh nahi hota. Ab sync confirm hote hi flag hata dete
    // hain, taaki row wapas normal (non-pending) ban jaaye.
    const cachedRow = (await cacheGetAll(table)).find((r: any) => r.id === m.rowId);
    const later = (await queueGetAll()).some(q => q.id !== m.id && q.table === table && (q.rowId === m.rowId || q.rowId === `local_${m.rowId}`));
    if (!later && cachedRow && cachedRow._pendingSync) {
      const cleaned = { ...cachedRow, ...(serverRow as any) };
      delete cleaned._pendingSync;
      await cacheUpsertRow(table, cleaned, "id");
    }
    console.info(`Update sync OK — table: ${table}`);
    return;
  }

  if (m.op === "delete") {
    if (!m.rowId) throw new Error("delete mutation missing rowId");

    const { data, error } = await supabase.rpc("delete_record_authorized" as any, { p_table: table, p_id: m.rowId } as any);
    if (error) throw error;
    if (data !== true) throw new Error("Delete was not acknowledged by the server");
    return;
  }

  if (m.op === "sms") {
    const { mobile, message, patientName, smsType } = m.payload;

    // Invalid legacy entries must stay reviewable, never be acknowledged as sent.
    if (!isValidMobile(mobile)) throw new Error("Invalid SMS recipient; correct or cancel this queued message");

    cLog.info("sync", `SMS bhej raha hai — patient: ${patientName}, type: ${smsType}`);

    // ✅ Electron IPC use karo — direct fetch() Electron mein CORS fail karta hai
    const electron = (window as any).electron;
    const apiUrl   = import.meta.env.VITE_TEXTBEE_API_URL;
    const apiKey   = import.meta.env.VITE_TEXTBEE_API_KEY;
    const deviceId = import.meta.env.VITE_TEXTBEE_DEVICE_ID;

    if (!electron?.sendSMS) {
      throw new Error("Electron SMS handler nahi mila — retry hoga");
    }

    const result = await electron.sendSMS({ apiUrl, apiKey, deviceId, mobile, message });
    if (!result?.ok) {
      throw new Error(result?.error || "SMS gateway fail");
    }

    // Log update karo Supabase mein
    try {
      await supabase.from("sms_logs" as any).insert({
        patient_name: patientName,
        mobile,
        message,
        status:   "sent",
        sms_type: smsType,
      } as any);
    } catch { cLog.warn("sync", "SMS gaya par log save nahi hua"); }
    return;
  }

  if (m.op === "stock_adjust") {
    const payload = stripLocalPrefixes(m.payload);
    const id = (m.tempId || payload.id).replace(/^local_/, "");
    const { data, error } = await supabase.rpc("adjust_stock_atomic" as any, {
      p_id: id, p_medicine: payload.medicine_id, p_qty: payload.change_qty,
      p_reason: payload.reason, p_note: payload.note, p_actor: payload.created_by,
    } as any);
    if (error) throw error;
    await cacheReplaceRowKey("stock_movements", m.tempId!, { ...payload, id, _pendingSync: false });
    const other = (await queueGetAll()).some(q => q.id !== m.id && q.op === "stock_adjust" && q.payload?.medicine_id === m.payload.medicine_id);
    if (!other && data) await cacheUpsertRow("medicines", data, "id");
    return;
  }
  if (m.op === "xray_upload") {
    const { fileName, fileBase64, mimeType } = m.payload;
    const caseId = m.payload.caseId.replace(/^local_/, "");
    const patientId = m.payload.patientId.replace(/^local_/, "");
    let uploadId = m.payload.uploadId;
    if (!uploadId) { uploadId = crypto.randomUUID(); await queueUpdate(m.id!, { payload: { ...m.payload, uploadId } }); }
    const bytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mimeType || "image/jpeg" });
    const ext = (fileName || "jpg").split(".").pop().replace(/[^a-zA-Z0-9]/g, "") || "jpg";
    const path = `${patientId}/${caseId}/${uploadId}.${ext}`;
    const { error: upErr } = await supabase.storage.from("xray-files").upload(path, blob, { upsert: true });
    if (upErr) throw upErr;
    const { data: signed, error: signErr } = await supabase.storage.from("xray-files").createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signErr) throw signErr;
    const row = { id: uploadId, fracture_case_id: caseId, patient_id: patientId, file_url: signed!.signedUrl };
    const { error } = await supabase.from("fracture_xrays" as any).upsert(row, { onConflict: "id" });
    if (error) throw error;
    await cacheUpsertRow("fracture_xrays", row);
    return;
  }
}

export async function runSync(): Promise<{ synced: number; pending: number }> {
  if ((window as any).electron?.checkAuth && !(await (window as any).electron.checkAuth()).valid) return { synced: 0, pending: 0 };
  if (syncing) return { synced: 0, pending: (await queueGetAll()).length };

  const online = typeof navigator !== "undefined" ? navigator.onLine : true;
  if (!online) return { synced: 0, pending: (await queueGetAll()).length };

  if (!(await ensureCloudSession())) {
    const pending = (await queueGetAll()).length;
    emitSyncStatus(pending, "Cloud connection pending — data is saved on this PC");
    return { synced: 0, pending };
  }
  if (syncing) return { synced: 0, pending: (await queueGetAll()).length };

  syncing = true;
  let synced = 0;
  let lastError: string | undefined;

  try {
    emitSyncStatus((await queueGetAll()).length);
    const blocked = new Set<string>();
    let queue = await queueGetAll();
    queue = queue.sort((a, b) => (a.id || 0) - (b.id || 0));

    if (queue.length > 0) console.info(`Sync shuru — ${queue.length} items pending`);

    for (const snapshotItem of queue) {
      const m = (await queueGetAll()).find(q => q.id === snapshotItem.id);
      if (!m) continue;
      const key = `${m.table}::${(m.rowId || m.tempId || String(m.id)).replace(/^local_/, "")}`;
      if (blocked.has(key)) continue;
      // Never abandon durable work after a fixed number of failed requests.
      // Backoff is persisted, so restarting the app doesn't hammer the server.
      const retryDelay = Math.min(30000 * 2 ** Math.min(Math.max((m.retries || 0) - 1, 0), 4), 300000);
      if (m.lastAttemptAt && Date.now() - m.lastAttemptAt < retryDelay) { blocked.add(key); continue; }

      try {
        await applyMutation(m);
        if (m.id !== undefined) await queueRemove(m.id);
        synced++;
      } catch (err: any) {
        blocked.add(key);
        const msg = err?.message || String(err);
        if (msg === "PENDING_PARENT_INSERT") continue;
        cLog.error("sync", "Mutation fail — op: " + m.op + ", table: " + m.table + ", msg: " + msg);
        if (m.id !== undefined) {
          const retries = (m.retries || 0) + 1;
          await queueUpdate(m.id, { retries, lastError: msg, lastAttemptAt: Date.now() });

        }
        lastError = msg;
      }
    }

    if (synced > 0) {
      console.info(`✅ Sync complete — ${synced} items upload ho gaye`);
      // ✅ Sync ke baad fresh data download karo
      void downloadAllDataToCache().catch(error => cLog.warn("sync", "Refresh delayed", error));
    }
  } finally {
    syncing = false;
    const pending = (await queueGetAll()).length;
    emitSyncStatus(pending, lastError);
  }

  return { synced, pending: (await queueGetAll()).length };
}

let autoSyncStarted = false;

export function startAutoSync() {
  if (autoSyncStarted) return;
  autoSyncStarted = true;
  cLog.info("sync", "Auto-sync engine start");

  const background = async () => {
    try {
      if ((window as any).electron?.checkAuth && !(await (window as any).electron.checkAuth()).valid) return;
      const online = await isOnline();
      if (online !== lastKnownOnline) emitNetworkChange(online);
      if (online) {
        await runSync();
        void downloadAllDataToCache().catch(error => cLog.warn("sync", "Refresh delayed", error));
      }
    } catch (error) { cLog.warn("sync", "Background cycle delayed; local data retained", error); }
  };
  setTimeout(() => { void background(); void backupCacheToDisk(); }, 3000);
  setInterval(background, 30000);
  setInterval(() => { void backupCacheToDisk(); }, 3 * 60 * 1000);
  if (typeof window !== "undefined") window.addEventListener("beforeunload", () => { void backupCacheToDisk(); });
}
