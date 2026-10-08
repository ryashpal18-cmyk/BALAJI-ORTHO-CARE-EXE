import { cacheGetAll, cacheGetRow, commitBatch, tempId } from './offlineDb';
import { normalizeBill, withPaymentHistory } from './paymentLedger';
import { normalizeIndianMobile } from './mobile';
import { isValidMobile } from './utils';
import { invoiceNumber } from './invoiceNumber';
import { runSync } from './offlineSync';

// Bill, payment history and its SMS outbox entry either all commit or all roll back.
export async function saveBillOffline(input: any) {
  const patient = await cacheGetRow('patients', input.patient_id);
  if (!patient) throw new Error('Patient PC par nahi mila. Patient list dobara kholein.');
  const id = input.id || tempId();
  const created_at = input.created_at || new Date().toISOString();
  const branch_id = input.branch_id || patient.branch_id || localStorage.getItem('bocc_selected_branch') ||
    (await cacheGetAll('branches')).filter(b => b.is_active).find((_, i, rows) => rows.length === 1)?.id;
  if (!branch_id) throw new Error('Select a branch before saving this bill');
  const bill = withPaymentHistory({ id, amount_paid: 0 }, {
    ...normalizeBill(input), id, created_at, branch_id, patient_id: patient.id,
    patients: { name: patient.name || '', mobile: patient.mobile || '', address: patient.address || '' }, _pendingSync: true,
  }, crypto.randomUUID(), created_at);
  const items: any[] = [{ mutation: { table: 'billing', op: 'insert', tempId: id, payload: bill }, row: bill }];
  const smsQueued = isValidMobile(patient.mobile || '');
  if (smsQueued) {
    const messageId = crypto.randomUUID();
    const mobile = normalizeIndianMobile(patient.mobile);
    const net = Math.max(Number(bill.amount) - Number(bill.discount || 0), 0);
    const due = Math.max(net - Number(bill.amount_paid || 0), 0);
    const message = `नमस्ते ${patient.name || 'Patient'} जी 🙏\n\nBalaji Digital X-Ray & Ortho Care Center\n\n📋 बिल नंबर: ${invoiceNumber(id)}\n📅 दिनांक: ${new Date(created_at).toLocaleDateString('en-IN')}\n💰 कुल राशि: ₹${net}\n✅ जमा: ₹${bill.amount_paid || 0}\n❗ बकाया: ₹${due}\n\nधन्यवाद 🙏`;
    const row = { id: messageId, patient_name: patient.name, mobile, message, status: 'pending', sms_type: 'bill_saved', sent_at: created_at, _pendingSync: true };
    items.push({ mutation: { table: 'sms_logs', op: 'sms', payload: { messageId, mobile, message, patientName: patient.name, smsType: 'bill_saved', billing_id: id } }, row });
  }
  const saved = await commitBatch(items);
  void runSync().catch(() => {});
  return { ...saved[0], smsQueued };
}
