export const recordId = (id: unknown) => String(id || '').replace(/^local_/, '');

/** Resolve local rows as well as their synchronized UUIDs. */
export function attachPatients(rows: any[], patients: any[]) {
  const byId = new Map(patients.map(p => [recordId(p.id), p]));
  return rows.map(row => ({ ...row, patients: byId.get(recordId(row.patient_id)) || row.patients || null }));
}

export function patientXrays(reports: any[], fractures: any[], patientId: string, cases: any[] = []) {
  return [...reports.map(r => ({ ...r, source: 'report' })), ...fractures.map(r => ({ ...r, source: 'fracture' }))]
    .filter(r => recordId(r.patient_id) === recordId(patientId) || cases.some(c => recordId(c.id) === recordId(r.fracture_case_id) && recordId(c.patient_id) === recordId(patientId)))
    .map(r => ({ ...r, file_url: r._localFileUrl || r.file_url }))
    .sort((a, b) => (b.image_date || b.uploaded_at || b.created_at || '').localeCompare(a.image_date || a.uploaded_at || a.created_at || ''));
}
