import { metaGet, metaSet } from "./offlineDb";

// Review text is local audit metadata, not a gateway delivery status. Older
// releases accidentally submitted these labels to the cloud CHECK constraint.
export const SMS_REVIEW_STATUSES = [
  "Manual resend requested — original delivery unconfirmed",
  "Removed from outbox — original delivery unconfirmed",
];
const reviewKey = "sms:review-notes";
let saving: Promise<void> = Promise.resolve();
export function saveSmsReview(id: string, status: string) {
  // Serialize UI and background repairs; one metadata read per screen refresh
  // avoids hundreds of IPC requests for the existing SMS history.
  saving = saving.catch(() => {}).then(async () => {
    const notes = (await metaGet(reviewKey)) || {};
    await metaSet(reviewKey, { ...notes, [id.replace(/^local_/, "")]: { status } });
  });
  return saving;
}
export async function smsCloudRow(row: any) {
  if (!SMS_REVIEW_STATUSES.includes(row.status)) return row;
  // Save first: even a crash or later cache refresh cannot lose the review.
  await saveSmsReview(row.id, row.status);
  return { ...row, status: "pending" };
}
export async function withSmsReviews(rows: any[]) {
  const notes = (await metaGet(reviewKey)) || {};
  return rows.map(row => {
    const review = notes[String(row.id).replace(/^local_/, "")];
    return review?.status && row.status !== "sent" ? { ...row, status: review.status } : row;
  });
}
