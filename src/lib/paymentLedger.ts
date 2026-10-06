export type Receipt = { id: string; amount: number; paid_at: string; payment_mode: string; legacy?: boolean };
export function paymentHistory(bill: any): Receipt[] {
  if (Array.isArray(bill.payment_history)) return bill.payment_history;
  const paid = Number(bill.amount_paid || 0);
  return paid ? [{ id: `legacy-${bill.id}`, amount: paid, paid_at: bill.created_at,
    payment_mode: bill.payment_mode || "Cash", legacy: true }] : [];
}
export function withPaymentHistory(existing: any, changes: any, eventId: string, now: string) {
  const history = paymentHistory(existing);
  if (changes.amount_paid !== undefined) {
    const delta = Math.round((Number(changes.amount_paid) - Number(existing.amount_paid || 0)) * 100) / 100;
    if (!Number.isFinite(delta)) throw new Error("Invalid payment amount");
    if (delta !== 0) history.push({ id: eventId, amount: delta, paid_at: now,
      payment_mode: changes.payment_mode || existing.payment_mode || "Cash" });
  }
  return { ...changes, payment_history: history };
}
export function collectionRows(bills: any[]) {
  return bills.flatMap(bill => paymentHistory(bill).map(receipt => ({ ...bill,
    id: receipt.id, bill_id: bill.id, created_at: receipt.paid_at, amount_paid: receipt.amount,
    payment_mode: receipt.payment_mode, legacy_collection: !!receipt.legacy })));
}
