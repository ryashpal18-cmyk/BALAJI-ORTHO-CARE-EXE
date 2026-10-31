export function invoiceNumber(id: string) {
  return `INV-${String(id).replace(/^local_/, '').toUpperCase()}`;
}
export function legacyInvoiceNumbers(id: string) {
  const real = id.replace(/^local_/, '');
  return [invoiceNumber(id), `INV-${real.slice(0,8).toUpperCase()}`, `INV-${('local_' + real).slice(0,8).toUpperCase()}`];
}

/** Same invoice identity before and after an offline bill is synchronized. */
export function letterpadPatientInvoices<T extends { id: string; patient_id: string; created_at: string }>(rows: T[], patientId: string): T[] {
  const canonical = (id: string) => String(id || '').replace(/^local_/, '');
  if (!canonical(patientId)) return [];
  return rows.filter(row => row.id && canonical(row.patient_id) === canonical(patientId))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '') || a.id.localeCompare(b.id));
}

export function displayBillNumber(bill:any) { return bill.workflow_data?.invoice_label || (bill.invoice_number ? 'BILL-'+String(bill.invoice_number).padStart(6,'0') : invoiceNumber(bill.id)); }
