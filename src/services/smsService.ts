// ─────────────────────────────────────────────────────────────────────────────
// SMS Service — Offline-first
//
// FLOW:
//   Online  → Electron IPC se turant bhejo → ok to sms_logs mein save karo
//   Offline → IndexedDB queue mein daal do → internet aane pe auto-sync karega
//
// Kabhi bhi direct fetch() nahi karte — CORS issue hoga Electron mein.
// Hamesha window.electron.sendSMS (IPC → main.js → node fetch) use karte hain.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase }  from "@/integrations/supabase/client";
import { queueAdd }  from "@/lib/offlineDb";
import { isOnline }  from "@/lib/offlineSync";
import { cLog }      from "@/lib/clientLogger";
import { isValidMobile } from "@/lib/utils";

export type SendSmsResult = {
  ok:     boolean;   // SMS gaya ya queue mein gaya — dono ok:true
  queued: boolean;   // true = offline queue mein hai, baad mein jaayega
  error?: string;    // sirf agar kuch serious fail hua
};

// ── Mobile number normalize karo ─────────────────────────────────────────────
function normalizeMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}

// ── Queue mein daal do — internet aane pe jayega ──────────────────────────────
async function queueSMS(
  mobile: string,
  message: string,
  patientName: string,
  smsType: string
): Promise<SendSmsResult> {
  await queueAdd({
    table:   "sms_logs",
    op:      "sms",
    payload: { mobile, message, patientName, smsType },
  });
  cLog.info("sms", `SMS queue mein daal diya — patient: ${patientName}, type: ${smsType}`);

  // Supabase mein "pending" status save karo (agar online ho)
  try {
    await supabase.from("sms_logs" as any).insert({
      patient_name: patientName,
      mobile,
      message,
      status:   "pending",
      sms_type: smsType,
    } as any);
  } catch { /* offline hai to ye bhi queue mein jaayega — ok hai */ }

  return { ok: true, queued: true };
}

// ── Main sendSMS function ─────────────────────────────────────────────────────
export async function sendSMS(
  mobile:      string,
  message:     string,
  patientName: string = "",
  smsType:     string = "general"
): Promise<SendSmsResult> {

  if (!mobile) {
    cLog.warn("sms", `Mobile number nahi hai — patient: ${patientName}`);
    return { ok: false, queued: false, error: "Mobile number nahi hai" };
  }

  // 🚨 FIX: "0000000000", "1111111111" jaise dummy/invalid numbers pehle
  // seedha queue mein chale jaate the, phir gateway se hamesha fail hote
  // (aur offline hone par hamesha ke liye retry queue mein atke rehte —
  // kabhi clear na hone waala infinite retry). Ab bhejne se pehle hi rok
  // dete hain, taaki queue aur SMS logs fizul na bharen.
  if (!isValidMobile(mobile)) {
    cLog.warn("sms", `Invalid/dummy mobile number — SMS skip kiya, patient: ${patientName}, mobile: ${mobile}`);
    return { ok: false, queued: false, error: "Mobile number invalid hai — SMS nahi bheja gaya" };
  }

  const num = normalizeMobile(mobile);

  // ── Step 1: Internet check karo ──────────────────────────────────────────
  const online = await isOnline();

  if (!online) {
    // Offline — seedha queue mein daal do, try bhi mat karo
    cLog.info("sms", `Offline — SMS queue mein daal diya: ${patientName}`);
    return queueSMS(num, message, patientName, smsType);
  }

  // ── Step 2: Online — Electron IPC se bhejo ───────────────────────────────
  const apiUrl   = import.meta.env.VITE_TEXTBEE_API_URL;
  const apiKey   = import.meta.env.VITE_TEXTBEE_API_KEY;
  const deviceId = import.meta.env.VITE_TEXTBEE_DEVICE_ID;

  const electron = (window as any).electron;

  try {
    if (electron?.sendSMS) {
      // ✅ Electron IPC — main.js mein node-fetch karta hai (CORS-free)
      const result = await electron.sendSMS({ apiUrl, apiKey, deviceId, mobile: num, message });

      if (result?.ok === true) {
        // SMS gaya — Supabase mein "sent" log karo
        try {
          await supabase.from("sms_logs" as any).insert({
            patient_name: patientName,
            mobile:       num,
            message,
            status:       "sent",
            sms_type:     smsType,
          } as any);
        } catch { /* log fail — SMS to gaya, ignore */ }

        cLog.info("sms", `✅ SMS bheja gaya — patient: ${patientName}, type: ${smsType}`);
        return { ok: true, queued: false };
      }

      // IPC ne fail bataya — queue mein daal do
      cLog.warn("sms", `SMS fail (IPC) — queue mein daal raha hai: ${result?.error || "unknown"}`);
      return queueSMS(num, message, patientName, smsType);

    } else {
      // Electron nahi mila (browser dev mode) — queue mein daal do
      cLog.warn("sms", "Electron SMS handler nahi mila — queue mein daal raha hai");
      return queueSMS(num, message, patientName, smsType);
    }
  } catch (err: any) {
    cLog.error("sms", `SMS exception — queue mein daal raha hai: ${err?.message}`, err);
    return queueSMS(num, message, patientName, smsType);
  }
}
