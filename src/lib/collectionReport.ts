import { businessDate } from './businessDate';
import { collectionRows } from './paymentLedger';

/** Read-only reporting: invoice dates stay on bills; income follows receipt dates. */
export function periodCollections(bills: any[], fromDate: string, toDate: string) {
  return collectionRows(bills).filter(row => {
    const date = businessDate(row.created_at || '');
    return !!date && date >= fromDate && date <= toDate;
  });
}
export function sumCollections(receipts: any[]) {
  return Math.round(receipts.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0) * 100) / 100;
}
export function cashTallyForPeriod(bills: any[], fromDate: string, toDate: string) {
  const invoices = bills.filter(bill => {
    const date = businessDate(bill.created_at || '');
    return !!date && date >= fromDate && date <= toDate;
  });
  const receipts = periodCollections(bills, fromDate, toDate);
  return {
    total: invoices.reduce((sum, bill) => sum + Number(bill.amount || 0), 0),
    pending: invoices.reduce((sum, bill) => sum + Math.max(Number(bill.amount || 0) - Number(bill.discount || 0) - Number(bill.amount_paid || 0), 0), 0),
    received: sumCollections(receipts),
    previousDueReceived: sumCollections(receipts.filter(row => {
      const originalDate = businessDate(row.bill_created_at || '');
      return !!originalDate && originalDate < businessDate(row.created_at);
    })),
  };
}
