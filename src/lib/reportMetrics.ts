import { businessDate } from './businessDate';
import { billDue } from './billAmounts';
export const canonicalId = (id: unknown) => String(id || '').replace(/^local_/, '');
export function uniquePatientCount(bills: any[]) { return new Set(bills.filter(b=>b.status!=="Cancelled").map(b => canonicalId(b.patient_id)).filter(Boolean)).size; }
export function serviceTotals(bills: any[]) {
  const totals: Record<string, number> = {};
  for (const bill of bills.filter(b=>b.status!=="Cancelled")) {
    for (const item of String(bill.service || '').split('|')) {
      const parts = item.split(':'), amount = Number(parts.pop()), name = parts.join(':').trim();
      if (name && Number.isFinite(amount) && amount >= 0) totals[name] = (totals[name] || 0) + amount;
    }
  }
  return totals;
}
export function dueAge(bill: any, today: string) {
  const start = bill.created_at ? businessDate(bill.created_at) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  return Math.max(0, Math.floor((Date.parse(today+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000));
}
export const outstandingBills = (bills: any[]) => bills.filter(b => billDue(b) > 0);
export function parseSavedReport(value: unknown): any | null {
  try { const data = typeof value === 'string' ? JSON.parse(value) : value; return data && typeof data === 'object' && !Array.isArray(data) ? data : null; } catch { return null; }
}
