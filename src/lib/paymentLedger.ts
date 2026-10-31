export type Receipt = { id: string; amount: number; paid_at: string; payment_mode: string; legacy?: boolean };
export function paymentHistory(bill: any): Receipt[] {
  if (Array.isArray(bill.payment_history)) return bill.payment_history;
  const paid = Number(bill.amount_paid || 0);
  return paid ? [{ id: `legacy-${bill.id}`, amount: paid, paid_at: bill.created_at,
    payment_mode: bill.payment_mode || "Cash", legacy: true }] : [];
}
export function withPaymentHistory(existing: any, changes: any, eventId: string, now: string) {
  if (changes.payment_mode === "Account Credit" && changes.payment_mode !== existing.payment_mode) throw new Error("Advance लगाने के लिए मरीज का Advance विकल्प इस्तेमाल करें");
  const history = paymentHistory(existing).map(r => ({ ...r }));
  if (changes.amount_paid !== undefined) {
    const delta = Math.round((Number(changes.amount_paid) - Number(existing.amount_paid || 0)) * 100) / 100;
    if (!Number.isFinite(delta)) throw new Error("Invalid payment amount");
    if (delta === 0 && changes.payment_mode && changes.payment_mode !== existing.payment_mode) {
      const groups = new Map<string, { amount: number; paid_at: string; payment_mode: string }>();
      for (const receipt of history) {
        if (receipt.payment_mode === "Account Credit" || receipt.payment_mode === changes.payment_mode) continue;
        const key = `${receipt.paid_at}|${receipt.payment_mode}`;
        const group = groups.get(key) || { amount: 0, paid_at: receipt.paid_at, payment_mode: receipt.payment_mode };
        group.amount += Number(receipt.amount); groups.set(key,group);
      }
      // Same correction on two PCs must have the same receipt identity.
      // Keep only original receipt IDs plus a correction generation: no recursive IDs.
      const originals = history.filter(r => !r.id.startsWith("reclass:")).map(r => r.id).sort();
      const generation = history.filter(r => r.id.startsWith("reclass:")).length;
      for (const group of groups.values()) {
        if (Math.abs(group.amount) < 0.005) continue;
        history.push({ id: `reclass:${JSON.stringify([existing.id, originals, generation, group.paid_at, group.payment_mode])}:out`, ...group, amount: -group.amount });
        history.push({ id: `reclass:${JSON.stringify([existing.id, originals, generation, group.paid_at, group.payment_mode])}:in`, ...group, payment_mode: changes.payment_mode });
      }
    }
    if (delta !== 0) history.push({ id: eventId, amount: delta, paid_at: now,
      payment_mode: changes.payment_mode || existing.payment_mode || "Cash" });
  }
  return { ...changes, payment_history: history };
}
export function collectionRows(bills: any[], patients: any[] = [], includeAdvance = true) {
  const receipts=bills.flatMap(bill => paymentHistory(bill).filter(r=>r.payment_mode!=='Account Credit').map(receipt => ({ ...bill,
    id: receipt.id, bill_id: bill.id, bill_created_at: bill.created_at, created_at: receipt.paid_at, amount_paid: receipt.amount,
    payment_mode: receipt.payment_mode, legacy_collection: !!receipt.legacy })));
  const people=new Map([...bills.map(b=>b.patients).filter(Boolean),...patients].map(p=>[String(p.id||'').replace(/^local_/,''),p]));
  if(includeAdvance) for(const patient of people.values()) for(const e of patient.workflow_data?.account||[]){
    if(e.kind==='apply')continue;
    receipts.push({id:e.id,patient_id:patient.id,patients:patient,bill_id:'Advance',bill_created_at:e.paid_at,created_at:e.paid_at,amount_paid:e.amount,payment_mode:e.mode,service:'Advance '+e.kind,legacy_collection:false});
  }
  return receipts;
}

export function normalizeBill(changes: any, existing: any = {}) {
  const result = { ...changes };
  if ('discount' in result || !('id' in existing)) result.discount = Number(result.discount ?? 0);
  const bill = { ...existing, ...result };
  if (String(existing.status).toLowerCase() === "cancelled" && (Object.entries(changes).some(([k,v]) => ["amount","discount","amount_paid"].includes(k) && Number(v||0)!==Number(existing[k]||0)) || (changes.status && changes.status!=="Cancelled"))) throw new Error("रद्द बिल में भुगतान या Edit नहीं कर सकते");
  if (String(bill.status).toLowerCase()==="cancelled" && Number(bill.amount_paid||0)!==0) throw new Error("Cancel से पहले जमा राशि वापस करें");
  for (const key of ['amount','amount_paid','discount']) {
    const value = Number(bill[key] ?? 0);
    if (!Number.isFinite(value) || value < 0) throw new Error('Amount, payment and discount must be non-negative numbers');
  }
  if (Number(bill.discount || 0) > Number(bill.amount || 0)) throw new Error('Discount cannot exceed bill amount');
  const net = Number(bill.amount || 0) - Number(bill.discount || 0);
  result.status = bill.status === 'Cancelled' ? 'Cancelled' : Number(bill.amount_paid || 0) >= net ? 'Paid' : Number(bill.amount_paid || 0) > 0 ? 'Partial' : 'Pending';
  return result;
}
