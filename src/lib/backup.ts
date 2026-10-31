import { validateBackupShape } from "./backupShape";
import { captureAttachments, restoreAttachmentData, compactAttachmentBackup } from "./attachmentBackup";
import { fetchCompleteTable, OPERATIONAL_TABLES } from "./completeFetch";
import { getLocalSnapshot, restoreLocalSnapshot } from "./offlineDb";
import { businessDate } from "@/lib/businessDate";
// ─────────────────────────────────────────────────────────────────────────
// Data Backup system
//
// Pura clinic data (patients, billing, appointments, fracture cases, etc.)
// ko ek JSON file (full restore-capable) aur ek Excel file (easily padhne
// ke liye, one sheet per table) ke roop mein save karta hai. Electron mein
// "Documents/Balaji_Ortho_Backups" folder mein seedha disk par save hota
// hai; browser mein download ho jata hai.
//
// Manual "Backup Now" button ke saath-saath daily/weekly auto-backup bhi
// support karta hai (startAutoBackupScheduler se).
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { ensureCloudSession } from "./localSession";
import { isOnline } from "@/lib/offlineSync";
import { cacheGetAll } from "@/lib/offlineDb";
import * as XLSX from "xlsx";

// Tables jo backup mein shamil hoti hain — clinic ka pura operational data.
const BACKUP_TABLES = OPERATIONAL_TABLES;
export function getBackupStatus(): { at?: string; ok?: boolean; warnings?: string[]; error?: string } {
  try { return JSON.parse(localStorage.getItem("bocc_backup_status") || "{}"); } catch { return {}; }
}
function recordBackupResult(result: BackupResult): BackupResult {
  localStorage.setItem("bocc_backup_status", JSON.stringify({ at:new Date().toISOString(), ok:result.ok, warnings:result.warnings || [], error:result.error }));
  return result;
}
export function inspectBackup(json: string) {
  const backup = JSON.parse(json);
  validateBackupShape(backup);
  if (![2,3].includes(backup.formatVersion) || !backup.tables || !Array.isArray(backup.localSnapshot?.queue)) throw new Error("Version 2/3 JSON backup required");
  if(backup.formatVersion===3&&(backup.attachmentFiles?.version!==2||!Array.isArray(backup.attachmentFiles.files)||!Array.isArray(backup.attachmentFiles.missing)))throw new Error('Version 3 photo archive missing or invalid');
  const tables = Object.values(backup.tables);
  if (tables.some(rows => !Array.isArray(rows))) throw new Error("Invalid backup table");
  return { records: tables.reduce((sum: number, rows: any[]) => sum + rows.length, 0), pending:backup.localSnapshot.queue.length,
    attachments:backup.attachmentFiles?.files?.length||0, missingAttachments:backup.attachmentFiles?.missing?.length||0, generatedAt:backup.generatedAt, warnings:Array.isArray(backup.warnings) ? backup.warnings : [] };
}

export const BACKUP_STORAGE_KEYS = {
  LAST_BACKUP_AT: "bocc_last_backup_at",
  LAST_DAILY_BACKUP_DATE: "bocc_last_daily_backup_date",   // "YYYY-MM-DD"
  LAST_WEEKLY_BACKUP_DATE: "bocc_last_weekly_backup_date", // "YYYY-MM-DD" (Sunday's date)
  DAILY_ENABLED: "bocc_daily_backup_enabled",
  WEEKLY_ENABLED: "bocc_weekly_backup_enabled",
};

export function isDailyBackupEnabled(): boolean {
  return localStorage.getItem(BACKUP_STORAGE_KEYS.DAILY_ENABLED) !== "false"; // default ON
}
export function isWeeklyBackupEnabled(): boolean {
  return localStorage.getItem(BACKUP_STORAGE_KEYS.WEEKLY_ENABLED) !== "false"; // default ON
}
export function setDailyBackupEnabled(v: boolean) {
  localStorage.setItem(BACKUP_STORAGE_KEYS.DAILY_ENABLED, String(v));
}
export function setWeeklyBackupEnabled(v: boolean) {
  localStorage.setItem(BACKUP_STORAGE_KEYS.WEEKLY_ENABLED, String(v));
}
export function getLastBackupAt(): string | null {
  return localStorage.getItem(BACKUP_STORAGE_KEYS.LAST_BACKUP_AT);
}

/** Overlay pending local changes/deletes onto a complete server export. */
export function mergeBackupTable(table: string, serverRows: any[], local: any, serverComplete = false) {
  const byId = new Map(serverRows.map(row => [row.id, row]));
  for (const row of local.cache[table] || []) {
    if ((!serverComplete && !byId.has(row.id)) || row._pendingSync) {
      if (row._pendingSync && String(row.id).startsWith("local_")) byId.delete(row.id.slice(6));
      byId.set(row.id, row);
    }
  }
  for (const mutation of local.queue || []) {
    if (mutation.table !== table) continue;
    if (mutation.op === "delete") { byId.delete(mutation.rowId); byId.delete(mutation.rowId?.replace(/^local_/, "")); }
  }
  return [...byId.values()];
}
function clinicalLocalStorage() {
  const notes: Record<string, string> = {};
  for (let i=0; i<localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if ((key.startsWith("ortho_visits_") || key.startsWith("bocc_bill_draft:")) || ["bocc_service_catalog","bocc_selected_branch","bocc_dash_modules","bocc_app_theme"].includes(key)) notes[key] = localStorage.getItem(key)!;
  }
  return notes;
}
function parkRestoredMessages(backup:any) {
  const snapshot=backup.localSnapshot;
  snapshot.queue=snapshot.queue.map((m:any)=>m.op==='sms'?{...m,payload:{...m.payload,deliveryState:'unconfirmed'},lastError:'Backup restore के बाद gateway में परिणाम जाँचें।'}:m);
  const meta=Array.isArray(snapshot.meta)?snapshot.meta.map((m:any)=>({...m})):[];
  const park=(jobs:any[])=>jobs.map(j=>['queued','sending'].includes(j.state)?{...j,state:'unconfirmed',error:'Backup restore के बाद चैट/gateway में जाँचें; अपने आप दोबारा नहीं भेजेंगे।'}:j);
  for(const entry of meta){
    let value;try{value=typeof entry.value==='string'?JSON.parse(entry.value):entry.value;}catch{continue;}
    if(entry.key==='whatsapp:invoice-jobs'&&Array.isArray(value))value=park(value);
    if(entry.key==='festival:campaigns'&&Array.isArray(value))value=value.map(c=>({...c,jobs:park(c.jobs||[])}));
    if(entry.key==='outreach:v1'&&value?.campaigns)value={...value,campaigns:value.campaigns.map((c:any)=>({...c,jobs:park(c.jobs||[])}))};
    entry.value=JSON.stringify(value);
  }
  let outreach=meta.find((m:any)=>m.key==='outreach:v1');
  const value=outreach?JSON.parse(outreach.value):{settings:{enabled:true,channels:['whatsapp','sms']},campaigns:[],seen:[]};
  value.seen=[...new Set([...(value.seen||[]),...(backup.tables.billing||[]).flatMap((bill:any)=>(bill.payment_history||[]).map((r:any)=>String(bill.id||'').replace(/^local_/,'')+':'+r.id))])];
  if(outreach)outreach.value=JSON.stringify(value);else meta.push({key:'outreach:v1',value:JSON.stringify(value)});
  snapshot.meta=meta;
}
export async function restoreBackup(json: string) {
  inspectBackup(json);
  if((window as any).electron?.verifyBackup)await (window as any).electron.verifyBackup(json);
  const currentData = await getLocalSnapshot();
  if (currentData.queue.length || Object.entries(currentData.cache).some(([table, rows]) => !["branches", "profiles", "user_roles"].includes(table) && (rows as any[]).length))
    throw new Error("Restore केवल खाली नए डिवाइस पर करें। मौजूदा मरीज और pending डेटा सुरक्षित है।");

  const backup = await restoreAttachmentData(JSON.parse(json));
  if (![2,3].includes(backup.formatVersion) || !backup.tables || !Array.isArray(backup.localSnapshot?.queue)) throw new Error("Version 2/3 JSON backup required");
  parkRestoredMessages(backup);
  await restoreLocalSnapshot({ cache: backup.tables, queue: backup.localSnapshot.queue, meta: backup.localSnapshot.meta || [] });
  for (const [key,value] of Object.entries(backup.localStorage || {})) {
    if ((key.startsWith("ortho_visits_") || key.startsWith("bocc_bill_draft:")) || ["bocc_service_catalog","bocc_selected_branch","bocc_dash_modules","bocc_app_theme"].includes(key)) localStorage.setItem(key, String(value));
  }
}

export type BackupResult = {
  ok: boolean;
  mode: "electron" | "browser";
  jsonPath?: string;
  xlsxPath?: string;
  recordCounts: Record<string, number>;
  error?: string;
  warnings?: string[];
  attachmentCount?: number;
  attachmentMissing?: number;
  complete?: boolean;
};

/**
 * Pura backup banata hai aur save karta hai. Electron mein ho to seedha
 * disk par "Documents/Balaji_Ortho_Backups" folder mein, warna browser
 * download ke through.
 */
let activeBackup:Promise<BackupResult>|null=null;
export function runBackupNow(label: string = "manual", onProgress?:(done:number,total:number)=>void): Promise<BackupResult> {
  if(activeBackup)return activeBackup;
  activeBackup=performBackupNow(label,onProgress).finally(()=>{activeBackup=null;});return activeBackup;
}
async function performBackupNow(label: string, onProgress?:(done:number,total:number)=>void): Promise<BackupResult> {
  const recordCounts: Record<string, number> = {};
  const backupData: Record<string, any[]> = {};

  const remote: Record<string, any[]> = {};
  const coverage: Record<string, string> = {};
  const warnings: string[] = [];
  const online = await isOnline() && await ensureCloudSession();
  for (const table of BACKUP_TABLES) {
    try {
      if (!online) throw new Error("offline");
      remote[table] = await fetchCompleteTable(table);
      coverage[table] = "complete-server-plus-local";
    } catch (error: any) {
      remote[table] = [];
      coverage[table] = "local-cache-only";
      warnings.push(`${table}: only local cache included (${error?.message || "fetch failed"})`);
    }
  }
  // One main-process SQLite transaction captures every table and the queue consistently.
  const localSnapshot = await getLocalSnapshot();
  const localStorageSnapshot = clinicalLocalStorage();
  for (const table of new Set([...BACKUP_TABLES, ...Object.keys(localSnapshot.cache)])) {
    const rows = mergeBackupTable(table, remote[table] || [], localSnapshot, coverage[table] === "complete-server-plus-local");
    backupData[table] = rows; recordCounts[table] = rows.length;
  }

  const attachmentFiles = await captureAttachments({tables:backupData,queue:localSnapshot.queue},onProgress);
  if(attachmentFiles.missing.length)warnings.push(`${attachmentFiles.missing.length} फोटो/फाइल नहीं मिलीं; यह आंशिक बैकअप है। Missing सूची JSON में है।`);
  const photoResult={attachmentCount:attachmentFiles.files.length,attachmentMissing:attachmentFiles.missing.length,complete:attachmentFiles.complete};
  const now = new Date();
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const baseName = `balaji_ortho_backup_${label}_${stamp}`;

  const fullJson = compactAttachmentBackup({
    formatVersion: 2,
    coverage, warnings, localSnapshot, localStorage: localStorageSnapshot,
    attachmentFiles,
    attachments: attachmentFiles.complete ? "Self-contained verified photo/PDF bytes included" : "PARTIAL: see attachmentFiles.missing",
    generatedAt: now.toISOString(),
    label,
    clinic: "Balaji Ortho Care Center",
    tables: backupData,
  });
  const jsonString = JSON.stringify(fullJson, null, 2);

  // Excel: ek sheet per table, taaki Dr Excel mein khol kar seedha dekh sakein.
  const wb = XLSX.utils.book_new();
  for (const table of Object.keys(backupData)) {
    const rows = backupData[table];
    const sheet = rows.length
      ? XLSX.utils.json_to_sheet(rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>{
          const text=typeof value==='object'&&value!==null?JSON.stringify(value):value;
          return[key,typeof text==='string'&&(/^data:[^;]+;base64,/.test(text)||text.length>30000)?'[फोटो/लंबा डेटा पूरा JSON backup में सुरक्षित है]':text];
        }))))
      : XLSX.utils.aoa_to_sheet([["(no records)"]]);
    // Sheet name max 31 chars, Excel ki limit hai.
    XLSX.utils.book_append_sheet(wb, sheet, table.slice(0, 31));
  }
  const xlsxArrayBuffer: ArrayBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });

  try {
    if (window.electron?.backupWriteJson && window.electron?.backupWriteBinary) {
      const jsonRes = await window.electron.backupWriteJson({ fileName: `${baseName}.json`, jsonString });
      const base64Data = arrayBufferToBase64(xlsxArrayBuffer);
      const xlsxRes = await window.electron.backupWriteBinary({ fileName: `${baseName}.xlsx`, base64Data });

      if (!jsonRes.success || !xlsxRes.success) {
        throw new Error(jsonRes.error || xlsxRes.error || "Backup file likhne mein error aaya");
      }

      localStorage.setItem(BACKUP_STORAGE_KEYS.LAST_BACKUP_AT, now.toISOString());
      return recordBackupResult({ ok: true, mode: "electron", jsonPath: jsonRes.path, xlsxPath: xlsxRes.path, recordCounts, warnings, ...photoResult });
    }
  } catch (e: any) {
    return recordBackupResult({ ok: false, mode: "electron", recordCounts, error: e?.message || String(e) });
  }

  // Browser fallback — download dono files
  try {
    downloadBlob(new Blob([jsonString], { type: "application/json" }), `${baseName}.json`);
    downloadBlob(new Blob([xlsxArrayBuffer], { type: "application/octet-stream" }), `${baseName}.xlsx`);
    localStorage.setItem(BACKUP_STORAGE_KEYS.LAST_BACKUP_AT, now.toISOString());
    return recordBackupResult({ ok: true, mode: "browser", recordCounts, warnings, ...photoResult });
  } catch (e: any) {
    return recordBackupResult({ ok: false, mode: "browser", recordCounts, error: e?.message || String(e) });
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function listBackupFiles(): Promise<{ name: string; size: number; mtime: number }[]> {
  if (window.electron?.backupList) {
    const res = await window.electron.backupList();
    return res.success ? res.files : [];
  }
  return [];
}

export async function openBackupFolder(): Promise<void> {
  if (window.electron?.backupOpenFolder) {
    await window.electron.backupOpenFolder();
  }
}

export async function getBackupFolderPath(): Promise<string | null> {
  if (window.electron?.backupGetDir) {
    return window.electron.backupGetDir();
  }
  return null;
}

// ─── Auto-scheduler (daily / weekly) ───

let schedulerStarted = false;

function todayStr(): string {
  return businessDate();
}

/**
 * App start hone par aur har ghante check karta hai ki aaj ka daily backup
 * ya is hafte ka weekly backup ho gaya ya nahi. Agar nahi hua aur internet
 * available hai, to silently background mein bana deta hai — Dr ko kuch
 * click nahi karna padta.
 */
export function startAutoBackupScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const checkAndRun = async () => {
    const auth = await (window as any).electron?.checkAuth?.();
    if (auth && (!auth.valid || auth.principal?.role !== "admin")) return;

    const today = todayStr();

    if (isDailyBackupEnabled()) {
      const lastDaily = localStorage.getItem(BACKUP_STORAGE_KEYS.LAST_DAILY_BACKUP_DATE);
      if (lastDaily !== today) {
        const res = await runBackupNow("daily").catch((error: Error) => recordBackupResult({ok:false, mode:"browser", recordCounts:{}, error:error.message}));
        if (res.ok && res.complete !== false) localStorage.setItem(BACKUP_STORAGE_KEYS.LAST_DAILY_BACKUP_DATE, today);
      }
    }

    if (isWeeklyBackupEnabled()) {
      const lastWeekly = localStorage.getItem(BACKUP_STORAGE_KEYS.LAST_WEEKLY_BACKUP_DATE);
      const isSunday = new Date().getDay() === 0;
      if (isSunday && lastWeekly !== today) {
        const res = await runBackupNow("weekly").catch((error: Error) => recordBackupResult({ok:false, mode:"browser", recordCounts:{}, error:error.message}));
        if (res.ok && res.complete !== false) localStorage.setItem(BACKUP_STORAGE_KEYS.LAST_WEEKLY_BACKUP_DATE, today);
      }
    }
  };

  // App start hone ke kuch der baad pehli check (taaki login/load slow na ho).
  setTimeout(() => { void checkAndRun().catch(console.error); }, 15000);
  // Phir har ghante check karte rehna — Dr jab bhi app khula chhode, sahi din par backup ho jayega.
  setInterval(() => { void checkAndRun().catch(console.error); }, 60 * 60 * 1000);
}
