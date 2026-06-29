// ─────────────────────────────────────────────────────────────────────────
// Network status + background sync engine
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { cLog } from "@/lib/clientLogger";
import { queueGetAll, queueRemove, queueUpdate, cacheReplaceRowKey, cacheDeleteRow, cacheReplaceTable, cacheUpsertRow, QueuedMutation } from "./offlineDb";


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
      lastKnownOnline = !!res?.online;
      return lastKnownOnline;
    }
  } catch {}
  lastKnownOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  return lastKnownOnline;
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
      runSync();
      downloadAllDataToCache(); // ✅ Internet aate hi fresh data download karo
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
  if (downloadInProgress) return;
  const online = typeof navigator !== "undefined" ? navigator.onLine : false;
  if (!online) return;

  downloadInProgress = true;
  cLog.info("sync", "Poora data PC mein download ho raha hai...");

  try {
    // 1. Patients — sabse pehle (baaki sab iske upar depend karte hain)
    const { data: patients } = await supabase
      .from("patients")
      .select("*")
      .order("name");
    if (patients && patients.length > 0) {
      await cacheReplaceTable("patients", patients);
      cLog.info("sync", `${patients.length} patients PC mein save ho gaye`);
    }

    // 2. Billing — patient naam ke saath (joined)
    const { data: billing } = await supabase
      .from("billing")
      .select("*, patients(name, mobile, address)")
      .order("created_at", { ascending: false });
    if (billing && billing.length > 0) {
      await cacheReplaceTable("billing", billing);
      cLog.info("sync", `${billing.length} bills PC mein save ho gaye`);
    }

    // 3. Appointments
    const { data: appointments } = await supabase
      .from("appointments")
      .select("*, patients(name, mobile)")
      .order("date", { ascending: false });
    if (appointments && appointments.length > 0) {
      await cacheReplaceTable("appointments", appointments);
      cLog.info("sync", `${appointments.length} appointments PC mein save ho gaye`);
    }

    // 4. Prescriptions
    const { data: prescriptions } = await supabase
      .from("prescriptions")
      .select("*, patients(name)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (prescriptions && prescriptions.length > 0) {
      await cacheReplaceTable("prescriptions", prescriptions);
      cLog.info("sync", `${prescriptions.length} prescriptions PC mein save ho gaye`);
    }

    // 5. Physiotherapy sessions
    const { data: physio } = await supabase
      .from("physiotherapy_sessions")
      .select("*, patients(name)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (physio && physio.length > 0) {
      await cacheReplaceTable("physiotherapy_sessions", physio);
      cLog.info("sync", `${physio.length} physio sessions PC mein save ho gaye`);
    }

    // 6. Beds
    const { data: beds } = await supabase
      .from("beds")
      .select("*, patients(name)")
      .order("bed_number", { ascending: true });
    if (beds && beds.length > 0) {
      await cacheReplaceTable("beds", beds);
      cLog.info("sync", `${beds.length} beds PC mein save ho gaye`);
    }

    // 7. ✅ Reports (X-Ray reports) — pehle missing tha, offline mein blank dikhta tha
    const { data: reports } = await supabase
      .from("xray_reports")
      .select("*, patients(name, mobile)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (reports && reports.length > 0) {
      await cacheReplaceTable("xray_reports", reports);
      cLog.info("sync", `${reports.length} X-ray reports PC mein save ho gaye`);
    }

    // 8. ✅ Fracture cases — Ortho page offline ke liye
    const { data: fractureCases } = await supabase
      .from("fracture_cases")
      .select("*, patients(name, mobile, age, gender)")
      .order("created_at", { ascending: false })
      .limit(300);
    if (fractureCases && fractureCases.length > 0) {
      await cacheReplaceTable("fracture_cases", fractureCases);
      cLog.info("sync", `${fractureCases.length} fracture cases PC mein save ho gaye`);
    }

    // 9. ✅ Fracture X-rays — Ortho X-ray viewer offline ke liye
    const { data: fractureXrays } = await supabase
      .from("fracture_xrays" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (fractureXrays && fractureXrays.length > 0) {
      await cacheReplaceTable("fracture_xrays", fractureXrays);
      cLog.info("sync", `${fractureXrays.length} fracture X-rays PC mein save ho gaye`);
    }

    // 10. ✅ Hospitals — referral list offline ke liye
    const { data: hospitals } = await supabase
      .from("hospitals")
      .select("*")
      .order("name");
    if (hospitals && hospitals.length > 0) {
      await cacheReplaceTable("hospitals", hospitals);
      cLog.info("sync", `${hospitals.length} hospitals PC mein save ho gaye`);
    }

    cLog.info("sync", "✅ Saara data PC mein save ho gaya — ab offline bhi kaam karega");
  } catch (err) {
    cLog.error("sync", "Data download mein error aaya", err);
  } finally {
    downloadInProgress = false;
  }
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

const MAX_RETRIES = 8;

async function applyMutation(m: QueuedMutation): Promise<void> {
  const table = m.table as any;

  if (m.op === "insert") {
    const payload = { ...m.payload };
    if (m.tempId) delete payload.id;
    // ✅ FIX: Local-only fields Supabase ko mat bhejo — schema mein nahi hain
    delete payload._pendingSync;
    delete payload._localOnly;
    const { data, error } = await supabase.from(table).insert(payload).select().single();
    if (error) { console.error(`Insert failed — table: ${table}`); throw error; }
    if (m.tempId && data) await cacheReplaceRowKey(table, m.tempId, data, "id");
    console.info(`Insert sync OK — table: ${table}`);
    return;
  }

  if (m.op === "update") {
    if (!m.rowId) throw new Error("update mutation missing rowId");
    if (m.rowId.startsWith("local_")) throw new Error("PENDING_PARENT_INSERT");
    const updatePayload = { ...m.payload };
    delete updatePayload._pendingSync;
    delete updatePayload._localOnly;
    const { error } = await supabase.from(table).update(updatePayload).eq("id", m.rowId);
    if (error) { console.error(`Update failed — table: ${table}`); throw error; }
    console.info(`Update sync OK — table: ${table}`);
    return;
  }

  if (m.op === "delete") {
    if (!m.rowId) throw new Error("delete mutation missing rowId");
    if (m.rowId.startsWith("local_")) { await cacheDeleteRow(table, m.rowId); return; }
    const { error } = await supabase.from(table).delete().eq("id", m.rowId);
    if (error) { console.error(`Delete failed — table: ${table}`); throw error; }
    return;
  }

  if (m.op === "sms") {
    const { mobile, message, patientName, smsType } = m.payload;
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

  if (m.op === "xray_upload") {
    const { caseId, patientId, fileName, fileBase64, mimeType } = m.payload;
    const byteChars = atob(fileBase64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType || "image/jpeg" });
    const ext = (fileName || "").split(".").pop() || "jpg";
    const path = `${patientId}/${caseId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("xray-files").upload(path, blob, { upsert: false });
    if (upErr) { console.error(`X-ray upload fail`); throw upErr; }
    const { data: signed } = await supabase.storage.from("xray-files").createSignedUrl(path, 60 * 60 * 24 * 365);
    const file_url = signed?.signedUrl || path;
    const { error } = await supabase.from("fracture_xrays" as any).insert({ fracture_case_id: caseId, patient_id: patientId, file_url } as any);
    if (error) { console.error(`X-ray DB insert fail`); throw error; }
    return;
  }
}

export async function runSync(): Promise<{ synced: number; pending: number }> {
  if (syncing) return { synced: 0, pending: (await queueGetAll()).length };

  const online = typeof navigator !== "undefined" ? navigator.onLine : true;
  if (!online) return { synced: 0, pending: (await queueGetAll()).length };

  syncing = true;
  emitSyncStatus((await queueGetAll()).length);
  let synced = 0;
  let lastError: string | undefined;

  try {
    let queue = await queueGetAll();
    queue = queue.sort((a, b) => (a.id || 0) - (b.id || 0));

    if (queue.length > 0) console.info(`Sync shuru — ${queue.length} items pending`);

    for (const m of queue) {
      try {
        await applyMutation(m);
        if (m.id !== undefined) await queueRemove(m.id);
        synced++;
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg === "PENDING_PARENT_INSERT") continue;
        cLog.error("sync", "Mutation fail — op: " + m.op + ", table: " + m.table + ", msg: " + msg);
        if (m.id !== undefined) {
          const retries = (m.retries || 0) + 1;
          await queueUpdate(m.id, { retries, lastError: msg });
          if (retries >= MAX_RETRIES) console.error(`MAX RETRIES — permanently failed! op: ${m.op}`);
        }
        lastError = msg;
      }
    }

    if (synced > 0) {
      console.info(`✅ Sync complete — ${synced} items upload ho gaye`);
      // ✅ Sync ke baad fresh data download karo
      await downloadAllDataToCache();
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

  // ── App start hone ke 3 second baad ──────────────────────────────────────
  setTimeout(async () => {
    const online = typeof navigator !== "undefined" ? navigator.onLine : false;
    if (online) {
      cLog.info("sync", "App start — pehle data download, phir pending sync");
      await downloadAllDataToCache();
      await runSync();
    } else {
      cLog.info("sync", "App start — offline hai, cache se kaam chalega");
    }
  }, 3000);

  // ── Har 30 second mein sync check ────────────────────────────────────────
  setInterval(async () => {
    const online = await isOnline();
    const wasOffline = !lastKnownOnline;

    if (online !== lastKnownOnline) {
      emitNetworkChange(online);
      if (online && wasOffline) {
        // ✅ Internet wapas aaya — pehle poora data download karo, phir queue sync karo
        cLog.info("sync", "🌐 Internet wapas aa gayi — data + queue sync shuru");
        await downloadAllDataToCache();
        await runSync();
      }
    }

    // Online hai to har 30 sec mein pending queue sync karo
    if (online) runSync();
  }, 30000);
}

