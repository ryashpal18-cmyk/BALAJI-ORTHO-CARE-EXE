"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBackupShape = validateBackupShape;
// Shared by the renderer restore and the generated desktop backup verifier.
function validateBackupShape(b) {
    const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
    if (!object(b) || ![2, 3].includes(b.formatVersion) || !object(b.tables) || !Array.isArray(b.localSnapshot?.queue))
        throw Error('Version 2/3 JSON backup required');
    if (b.formatVersion === 3 && (!object(b.attachmentFiles) || b.attachmentFiles.version !== 2 || !Array.isArray(b.attachmentFiles.files) || !Array.isArray(b.attachmentFiles.missing)))
        throw Error('Version 3 photo archive missing or invalid');
    const key = (v) => String(v || '').replace(/^local_/, '');
    for (const [table, rows] of Object.entries(b.tables)) {
        if (!Array.isArray(rows))
            throw Error('Invalid backup table ' + table);
        for (const r of rows)
            if (!object(r) || typeof r.id !== 'string' || !r.id)
                throw Error(table + ': record ID missing');
    }
    const patients = new Set((b.tables.patients || []).map((r) => key(r.id)));
    for (const [table, rows] of Object.entries(b.tables))
        for (const r of rows) {
            if (r.patient_id && !patients.has(key(r.patient_id)))
                throw Error(table + ': patient reference missing');
            if (table === 'billing') {
                for (const k of ['amount', 'discount', 'amount_paid'])
                    if (!Number.isFinite(Number(r[k] || 0)) || Number(r[k] || 0) < 0)
                        throw Error('Invalid bill amount');
                if (Number(r.discount || 0) > Number(r.amount || 0))
                    throw Error('Discount exceeds bill amount');
                if (r.payment_history != null && (!Array.isArray(r.payment_history) || r.payment_history.some((p) => !object(p) || !p.id || !Number.isFinite(Number(p.amount)))))
                    throw Error('Invalid receipt history');
            }
            if (table === 'patients' && r.workflow_data?.account != null && (!Array.isArray(r.workflow_data.account) || r.workflow_data.account.some((e) => !object(e) || !e.id || !Number.isFinite(Number(e.amount)))))
                throw Error('Invalid advance ledger');
        }
    function mutation(m, inside = false) {
        if (!object(m) || typeof m.table !== 'string' || !m.table || !['insert', 'update', 'delete', 'sms', 'xray_upload', 'stock_adjust', 'clinic_finance'].includes(m.op))
            throw Error('Invalid queued operation');
        if (['update', 'delete'].includes(m.op) && !m.rowId)
            throw Error('Queued record reference missing');
        if (m.op !== 'delete' && !object(m.payload))
            throw Error('Queued payload missing');
        if (m.op === 'sms' && (!m.payload.mobile || !m.payload.message))
            throw Error('Queued SMS incomplete');
        if (m.op === 'clinic_finance') {
            if (inside || !m.payload.requestId || !Array.isArray(m.payload.items) || !m.payload.items.length || m.payload.items.length > 450)
                throw Error('Invalid queued finance bundle');
            m.payload.items.forEach((i) => mutation(i?.mutation, true));
        }
    }
    b.localSnapshot.queue.forEach((m) => mutation(m));
    if (b.localSnapshot.meta != null && (!Array.isArray(b.localSnapshot.meta) || b.localSnapshot.meta.some((m) => !object(m) || typeof m.key !== 'string')))
        throw Error('Invalid backup metadata');
    const sources = new Set();
    for (const f of b.attachmentFiles?.files || []) {
        if (!object(f) || !Array.isArray(f.sources) || f.sources.some((s) => typeof s !== 'string') || typeof f.base64 !== 'string' || !/^[0-9a-f]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.size) || f.size < 0)
            throw Error('Invalid attachment archive');
        f.sources.forEach((s) => { if (s.startsWith('balaji-attachment:') && s !== 'balaji-attachment:' + f.sha256)
            throw Error('Invalid attachment reference checksum'); sources.add(s); });
    }
    const visit = (v) => { if (typeof v === 'string' && v.startsWith('balaji-attachment:') && !sources.has(v))
        throw Error('Attachment reference missing'); if (Array.isArray(v))
        v.forEach(visit);
    else if (object(v))
        Object.values(v).forEach(visit); };
    visit(b.tables);
    visit(b.localSnapshot.queue);
    const warnings = [...(b.warnings || []), ...Object.entries(b.coverage || {}).filter(([, v]) => v !== 'complete-server-plus-local').map(([t]) => t + ': backup coverage is local only')];
    if (b.attachmentFiles?.missing?.length)
        warnings.push('Some attachment files are missing');
    return { warnings, complete: warnings.length === 0 };
}
