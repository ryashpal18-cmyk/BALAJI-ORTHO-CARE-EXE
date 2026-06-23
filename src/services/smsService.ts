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
      supabase.from("sms_logs" as any).insert({
        patient_name: patientName, mobile: num, message,
        status: "sent", sms_type: smsType,
      } as any).catch(() => {});
      return { ok: true, queued: false };
    }
    throw new Error(`TextBee ${res.status}`);
  } catch {
    await queueAdd({
      table: "sms_logs", op: "sms",
      payload: { mobile: num, message, patientName, smsType },
    });
    supabase.from("sms_logs" as any).insert({
      patient_name: patientName, mobile: num, message,
      status: "pending", sms_type: smsType,
    } as any).catch(() => {});
    return { ok: true, queued: true };
  }
}
