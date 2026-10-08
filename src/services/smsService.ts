import { normalizeIndianMobile } from "@/lib/mobile";
import { isValidMobile } from "@/lib/utils";
import { queueAdd } from "@/lib/offlineDb";
import { runSync } from "@/lib/offlineSync";
export type SendSmsResult = { ok: boolean; queued: boolean; error?: string };
// A successful return means the request is durable on this PC, not delivered to the phone.
export async function sendSMS(mobile: string, message: string, patientName = "", smsType = "general"): Promise<SendSmsResult> {
  if (!isValidMobile(mobile) || !message.trim()) return { ok: false, queued: false, error: "Valid mobile aur message required" };
  try {
    if (!(window as any).electron?.offline?.queueAdd) throw new Error("Durable SMS queue requires desktop app");
    await queueAdd({ table: "sms_logs", op: "sms", payload: {
      mobile: normalizeIndianMobile(mobile), message, patientName, smsType, messageId: crypto.randomUUID(),
    } });
    void runSync().catch(() => {});
    return { ok: true, queued: true };
  } catch (error: any) { return { ok: false, queued: false, error: error.message || "SMS PC par save nahi hua" }; }
}
