// ─────────────────────────────────────────────────────────────────────────
// Network status + background sync engine
//
// - isOnline(): current connectivity (Electron IPC check ko prefer karta hai,
//   browser navigator.onLine fallback ke roop me)
// - onNetworkChange(): subscribe to online/offline transitions
// - runSync(): pending mutation queue ko Supabase par push karta hai
// - startAutoSync(): online hote hi aur har 30s par automatic background sync
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { queueGetAll, queueRemove, queueUpdate, cacheReplaceRowKey, cacheDeleteRow, QueuedMutation } from "./offlineDb";

declare global {
  interface Window {
    electron?: {
      isOnline?: () => Promise<{ online: boolean }>;
      backupGetDir?: () => Promise<string>;
      backupWriteJson?: (data: { fileName: string; jsonString: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
      backupWriteBinary?: (data: { fileName: string; base64Data: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
      backupList?: () => Promise<{ success: boolean; files: { name: string; size: number; mtime: number }[] }>;
      backupOpenFolder?: () => Promise<{ success: boolean }>;
      [key: string]: any;
    };
    __ELECTRON__?: boolean;
  }
}

let lastKnownOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

export async function isOnline(): Promise<boolean> {
  // Electron main process ke real internet-check ko prefer karo (more reliable
  // than navigator.onLine, jo sirf network-interface check karta hai).
  try {
    if (window.electron?.isOnline) {
      const res = await window.electron.isOnline();
      lastKnownOnline = !!res?.online;
      return lastKnownOnline;
    }
  } catch {
    // ignore, fallback below
  }
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
    if (really) runSync();
  });
  window.addEventListener("offline", () => emitNetworkChange(false));
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
    // Don't send our local temp id to Supabase — let DB generate the real one.
    if (m.tempId) delete payload.id;
    const { data, error } = await supabase.from(table).insert(payload).select().single();
    if (error) throw error;
    if (m.tempId && data) {
      // Real row replaces the temp-id cached row, so the UI stops pointing at a fake id.
      await cacheReplaceRowKey(table, m.tempId, data, "id");
    }
    return;
  }

  if (m.op === "update") {
    if (!m.rowId) throw new Error("update mutation missing rowId");
    if (m.rowId.startsWith("local_")) {
      // The row this update targets hasn't been created on the server yet.
      // Leave it queued — it will run after the matching insert succeeds.
      throw new Error("PENDING_PARENT_INSERT");
    }
    const { error } = await supabase.from(table).update(m.payload).eq("id", m.rowId);
    if (error) throw error;
    return;
  }

  if (m.op === "delete") {
    if (!m.rowId) throw new Error("delete mutation missing rowId");
    if (m.rowId.startsWith("local_")) {
      // Row never reached the server — just drop it from cache, nothing to sync.
      await cacheDeleteRow(table, m.rowId);
      return;
    }
    const { error } = await supabase.from(table).delete().eq("id", m.rowId);
    if (error) throw error;
    return;
  }

  if (m.op === "sms") {
    // table field unused for sms; payload carries everything needed to send + log.
    const { mobile, message, patientName, smsType } = m.payload;
    const res = await fetch(import.meta.env.VITE_TEXTBEE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": import.meta.env.VITE_TEXTBEE_API_KEY,
      },
      body: JSON.stringify({
        deviceId: import.meta.env.VITE_TEXTBEE_DEVICE_ID,
        recipients: [mobile],
        message,
      }),
    });
    if (!res.ok) throw new Error(`SMS gateway error (${res.status})`);
    try {
      await supabase.from("sms_logs" as any).insert({
        patient_name: patientName,
        mobile,
        message,
        status: "sent",
        sms_type: smsType,
      } as any);
    } catch {
      // log insert failing shouldn't re-queue the SMS — it already sent.
    }
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
    if (upErr) throw upErr;
    const { data: signed } = await supabase.storage.from("xray-files").createSignedUrl(path, 60 * 60 * 24 * 365);
    const file_url = signed?.signedUrl || path;
    const { error } = await supabase.from("fracture_xrays" as any).insert({
      fracture_case_id: caseId,
      patient_id: patientId,
      file_url,
    } as any);
    if (error) throw error;
    return;
  }
}

export async function runSync(): Promise<{ synced: number; pending: number }> {
  if (syncing) return { synced: 0, pending: (await queueGetAll()).length };
  
  // navigator.onLine use karo — instant hai, Supabase ping slow hoti thi
  // jisse sync run hi nahi karta tha even when internet was fine.
  const online = typeof navigator !== "undefined" ? navigator.onLine : true;
  if (!online) return { synced: 0, pending: (await queueGetAll()).length };

  syncing = true;
  emitSyncStatus((await queueGetAll()).length);
  let synced = 0;
  let lastError: string | undefined;

  try {
    // Process in order, oldest first, so inserts complete before dependent updates.
    let queue = await queueGetAll();
    queue = queue.sort((a, b) => (a.id || 0) - (b.id || 0));

    for (const m of queue) {
      try {
        await applyMutation(m);
        if (m.id !== undefined) await queueRemove(m.id);
        synced++;
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg === "PENDING_PARENT_INSERT") {
          continue; // try again next sync cycle, after the insert ahead of it runs
        }
        if (m.id !== undefined) {
          const retries = (m.retries || 0) + 1;
          if (retries >= MAX_RETRIES) {
            // Give up on this one so it doesn't block the queue forever; keep it
            // visible with the error for the user/admin to review in Settings.
            await queueUpdate(m.id, { retries, lastError: msg });
          } else {
            await queueUpdate(m.id, { retries, lastError: msg });
          }
        }
        lastError = msg;
      }
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

  // Run once shortly after app start.
  setTimeout(() => { runSync(); }, 2000);

  // Periodic retry every 30s — covers the case where connectivity returns
  // without a browser "online" event firing (common on flaky mobile data).
  setInterval(async () => {
    const online = await isOnline();
    if (online !== lastKnownOnline) emitNetworkChange(online);
    if (online) runSync();
  }, 30000);
}
