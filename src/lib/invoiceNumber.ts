export function invoiceNumber(id: string) {
  return `INV-${String(id).replace(/^local_/, '').toUpperCase()}`;
}
export function legacyInvoiceNumbers(id: string) {
  const real = id.replace(/^local_/, '');
  return [invoiceNumber(id), `INV-${real.slice(0,8).toUpperCase()}`, `INV-${('local_' + real).slice(0,8).toUpperCase()}`];
}
