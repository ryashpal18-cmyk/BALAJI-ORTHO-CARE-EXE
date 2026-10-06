export const netBillAmount = (bill: any) => Math.max(Number(bill.amount || 0) - Number(bill.discount || 0), 0);
export const billDue = (bill: any) => Math.max(netBillAmount(bill) - Number(bill.amount_paid || 0), 0);
