import { supabase } from "@/integrations/supabase/client";

export async function sendSMS(
  mobile: string,
  message: string,
  patientName: string = "",
  smsType: string = "general"
): Promise<boolean> {
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
        message: message,
      }),
    });
    const ok = res.ok;
    await supabase.from("sms_logs" as any).insert({
      patient_name: patientName,
      mobile: num,
      message: message,
      status: ok ? "sent" : "failed",
      sms_type: smsType,
    } as any);
    return ok;
  } catch {
    await supabase.from("sms_logs" as any).insert({
      patient_name: patientName,
      mobile: num,
      message: message,
      status: "failed",
      sms_type: smsType,
    } as any);
    return false;
  }
}
