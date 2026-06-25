import { supabase } from "@/integrations/supabase/client";
import { queueAdd } from "@/lib/offlineDb";

export type SendSmsResult = {
  ok: boolean;
  queued: boolean;
};

export async function sendSMS(
  mobile: string,
  message: string,
  patientName: string = "",
  smsType: string = "general"
): Promise<SendSmsResult> {
  const digits = mobile.replace(/\D/g, "");
  const num = digits.startsWith("91") ? digits : `91${digits}`;

  const apiUrl    = import.meta.env.VITE_TEXTBEE_API_URL;
  const apiKey    = import.meta.env.VITE_TEXTBEE_API_KEY;
  const deviceId  = import.meta.env.VITE_TEXTBEE_DEVICE_ID;

  try {
    let ok = false;

    // Electron mein — main process se bhejo (CORS issue nahi hoga)
    const electron = (window as any).electron;
    if (electron?.sendSMS) {
      const result = await electron.sendSMS({ apiUrl, apiKey, deviceId, mobile: num, message });
      ok = result?.ok === true;
      if (!ok) throw new Error(result?.error || "SMS fail");
    } else {
      // Browser/dev fallback — direct fetch
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ deviceId, recipients: [num], message }),
      });
      if (!res.ok) throw new Error(`TextBee ${res.status}`);
      ok = true;
    }

    if (ok) {
      try {
        await supabase.from("sms_logs" as any).insert({
          patient_name: patientName, mobile: num, message,
          status: "sent", sms_type: smsType,
        } as any);
      } catch {
        // log fail — SMS to gaya
      }
      return { ok: true, queued: false };
    }
    throw new Error("SMS fail");
  } catch {
    // Queue mein daal do — sync hone par jayega
    await queueAdd({
      table: "sms_logs", op: "sms",
      payload: { mobile: num, message, patientName, smsType },
    });
    try {
      await supabase.from("sms_logs" as any).insert({
        patient_name: patientName, mobile: num, message,
        status: "pending", sms_type: smsType,
      } as any);
    } catch { /* ok */ }
    return { ok: true, queued: true };
  }
}
