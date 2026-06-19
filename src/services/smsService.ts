import { supabase } from "@/integrations/supabase/client";
import { isOnline } from "@/lib/offlineSync";
import { queueAdd } from "@/lib/offlineDb";

export type SendSmsResult = {
  ok: boolean;       // true if sent now OR safely queued for later — never a hard failure to the user
  queued: boolean;    // true if it will send automatically once internet aata hai
};

/**
 * SMS bhejta hai. Agar internet hai to turant TextBee API se bhej deta hai.
 * Agar internet nahi hai (ya gateway fail ho jaye), to SMS ko queue me daal
 * deta hai — koi error user ko nahi dikhta. Internet wapas aane par yeh
 * background sync engine (offlineSync.ts) automatically bhej dega.
 */
export async function sendSMS(
  mobile: string,
  message: string,
  patientName: string = "",
  smsType: string = "general"
): Promise<SendSmsResult> {
  const digits = mobile.replace(/\D/g, "");
  const num = digits.startsWith("91") ? digits : `91${digits}`;

  const online = await isOnline();

  if (online) {
    try {
      const res = await fetch(import.meta.env.VITE_TEXTBEE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": import.meta.env.VITE_TEXTBEE_API_KEY,
        },
        body: JSON.stringify({
          deviceId: import.meta.env.VITE_TEXTBEE_DEVICE_ID,
          recipients: [num],
          message,
        }),
      });
      if (res.ok) {
        try {
          await supabase.from("sms_logs" as any).insert({
            patient_name: patientName,
            mobile: num,
            message,
            status: "sent",
            sms_type: smsType,
          } as any);
        } catch {
          // log insert fail ho jaye to bhi SMS to bhej diya gaya — ok hi rahega
        }
        return { ok: true, queued: false };
      }
      // Gateway ne error diya (phone band, device offline, etc.) — queue kar do.
    } catch {
      // Network call fail — queue kar do, neeche.
    }
  }

  // Offline hai, ya gateway fail hua — silently queue, koi error nahi dikhana.
  await queueAdd({
    table: "sms_logs",
    op: "sms",
    payload: { mobile: num, message, patientName, smsType },
  });
  try {
    await supabase.from("sms_logs" as any).insert({
      patient_name: patientName,
      mobile: num,
      message,
      status: "pending",
      sms_type: smsType,
    } as any);
  } catch {
    // Log bhi offline ho sakta hai fail — koi baat nahi, queue me to hai hi.
  }
  return { ok: true, queued: true };
}
