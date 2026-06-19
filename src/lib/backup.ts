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
import { isOnline } from "@/lib/offlineSync";
import { cacheGetAll } from "@/lib/offlineDb";
import * as XLSX from "xlsx";

// Tables jo backup mein shamil hoti hain — clinic ka pura operational data.
const BACKUP_TABLES = [
  "patients",
  "appointments",
  "billing",
  "payments",
  "beds",
  "prescriptions",
  "physiotherapy_sessions",
  "fracture_cases",
  "fracture_xrays",
  "hospitals",
  "medical_history",
  "medicines",
  "medicine_entries",
  "invoice_medicine_mapping",
  "xray_reports",
  "report_payments",
  "sms_logs",
] as const;

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

async function fetchTable(table: string): Promise<any[]> {
  const online = await isOnline();
  if (online) {
    try {
      const { data, error } = await supabase.from(table as any).select("*");
      if (error) throw error;
      return (data || []) as any[];
    } catch {
      // network blip — fall back to whatever is cached locally
    }
  }
  return cacheGetAll(table);
}

export type BackupResult = {
  ok: boolean;
  mode: "electron" | "browser";
  jsonPath?: string;
  xlsxPath?: string;
  recordCounts: Record<string, number>;
  error?: string;
};

/**
 * Pura backup banata hai aur save karta hai. Electron mein ho to seedha
 * disk par "Documents/Balaji_Ortho_Backups" folder mein, warna browser
 * download ke through.
 */
export async function runBackupNow(label: string = "manual"): Promise<BackupResult> {
  const recordCounts: Record<string, number> = {};
  const backupData: Record<string, any[]> = {};

  for (const table of BACKUP_TABLES) {
    const rows = await fetchTable(table);
    backupData[table] = rows;
    recordCounts[table] = rows.length;
  }

  const now = new Date();
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const baseName = `balaji_ortho_backup_${label}_${stamp}`;

  const fullJson = {
    generatedAt: now.toISOString(),
    label,
    clinic: "Balaji Ortho Care Center",
    tables: backupData,
  };
  const jsonString = JSON.stringify(fullJson, null, 2);

  // Excel: ek sheet per table, taaki Dr Excel mein khol kar seedha dekh sakein.
  const wb = XLSX.utils.book_new();
  for (const table of BACKUP_TABLES) {
    const rows = backupData[table];
    const sheet = rows.length
      ? XLSX.utils.json_to_sheet(rows)
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
      return { ok: true, mode: "electron", jsonPath: jsonRes.path, xlsxPath: xlsxRes.path, recordCounts };
    }
  } catch (e: any) {
    return { ok: false, mode: "electron", recordCounts, error: e?.message || String(e) };
  }

  // Browser fallback — download dono files
  try {
    downloadBlob(new Blob([jsonString], { type: "application/json" }), `${baseName}.json`);
    downloadBlob(new Blob([xlsxArrayBuffer], { type: "application/octet-stream" }), `${baseName}.xlsx`);
    localStorage.setItem(BACKUP_STORAGE_KEYS.LAST_BACKUP_AT, now.toISOString());
    return { ok: true, mode: "browser", recordCounts };
  } catch (e: any) {
    return { ok: false, mode: "browser", recordCounts, error: e?.message || String(e) };
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
  return new Date().toISOString().slice(0, 10);
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
    const online = await isOnline();
    if (!online) return; // backup ke liye fresh data chahiye; offline mein cache se ho sakta hai par safe side daily backup ke liye internet ka wait karte hain

    const today = todayStr();

    if (isDailyBackupEnabled()) {
      const lastDaily = localStorage.getItem(BACKUP_STORAGE_KEYS.LAST_DAILY_BACKUP_DATE);
      if (lastDaily !== today) {
        const res = await runBackupNow("daily");
        if (res.ok) localStorage.setItem(BACKUP_STORAGE_KEYS.LAST_DAILY_BACKUP_DATE, today);
      }
    }

    if (isWeeklyBackupEnabled()) {
      const lastWeekly = localStorage.getItem(BACKUP_STORAGE_KEYS.LAST_WEEKLY_BACKUP_DATE);
      const isSunday = new Date().getDay() === 0;
      if (isSunday && lastWeekly !== today) {
        const res = await runBackupNow("weekly");
        if (res.ok) localStorage.setItem(BACKUP_STORAGE_KEYS.LAST_WEEKLY_BACKUP_DATE, today);
      }
    }
  };

  // App start hone ke kuch der baad pehli check (taaki login/load slow na ho).
  setTimeout(checkAndRun, 15000);
  // Phir har ghante check karte rehna — Dr jab bhi app khula chhode, sahi din par backup ho jayega.
  setInterval(checkAndRun, 60 * 60 * 1000);
}
