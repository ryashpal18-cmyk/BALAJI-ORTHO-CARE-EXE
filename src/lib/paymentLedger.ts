export type Receipt = { id: string; amount: number; paid_at: string; payment_mode: string; legacy?: boolean };
export function paymentHistory(bill: any): Receipt[] {
  if (Array.isArray(bill.payment_history)) return bill.payment_history;
  const paid = Number(bill.amount_paid || 0);
  return paid ? [{ id: `legacy-${bill.id}`, amount: paid, paid_at: bill.created_at,
    payment_mode: bill.payment_mode || "Cash", legacy: true }] : [];
}
export function withPaymentHistory(existing: any, changes: any, eventId: string, now: string) {
  const history = paymentHistory(existing).map(r => ({ ...r }));
  if (changes.amount_paid !== undefined) {
    const delta = Math.round((Number(changes.amount_paid) - Number(existing.amount_paid || 0)) * 100) / 100;
    if (!Number.isFinite(delta)) throw new Error("Invalid payment amount");
    if (delta === 0 && changes.payment_mode && changes.payment_mode !== existing.payment_mode) {
      const groups = new Map<string, { amount: number; paid_at: string; payment_mode: string }>();
      for (const receipt of history) {
        if (receipt.payment_mode === changes.payment_mode) continue;
        const key = `${receipt.paid_at}|${receipt.payment_mode}`;
        const group = groups.get(key) || { amount: 0, paid_at: receipt.paid_at, payment_mode: receipt.payment_mode };
        group.amount += Number(receipt.amount); groups.set(key,group);
      }
      let i=0;
      for (const group of groups.values()) {
        if (Math.abs(group.amount) < 0.005) continue;
        history.push({ id: `${eventId}-reclass-${i}-out`, ...group, amount: -group.amount });
        history.push({ id: `${eventId}-reclass-${i++}-in`, ...group, payment_mode: changes.payment_mode });
      }
    }
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
