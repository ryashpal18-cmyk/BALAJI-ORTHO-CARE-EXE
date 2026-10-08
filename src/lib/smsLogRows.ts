// Pending outbox takes precedence over an old cloud snapshot; accepted local logs take precedence over cleanup retries.
export function smsLogRows(cached: any[], queue: any[]) {
  const rows = new Map(cached.map(row => [row.id, row]));
  for (const entry of queue.filter(q => q.op === "sms")) {
    const p = entry.payload || {};
    const id = p.messageId || `queue-${entry.id}`;
    if (rows.get(id)?.status === "sent") continue;
    rows.set(id, { id, patient_name: p.patientName, mobile: p.mobile, message: p.message,
      sms_type: p.smsType, status: p.deliveryState === "unconfirmed" ? "Delivery unconfirmed — gateway check karein" : "Pending — PC par saved",
      sent_at: entry.createdAt, last_error: entry.lastError });
  }
  return [...rows.values()].sort((a, b) => String(b.sent_at || "").localeCompare(String(a.sent_at || "")));
}
