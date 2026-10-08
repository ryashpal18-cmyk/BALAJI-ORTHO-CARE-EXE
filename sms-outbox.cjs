'use strict';
const { createHash } = require('crypto');
// Persist BEFORE dispatch. A crash/timeout after dispatch is ambiguous, never an automatic resend.
function createSmsSender({ store, fetchImpl = fetch, timeoutMs = 15000 }) {
  const active = new Map();
  return async function send(input) {
    const { requestId, apiUrl, apiKey, deviceId, mobile, message } = input || {};
    if (!requestId || typeof requestId !== 'string') return { ok: false, error: 'Durable SMS request ID required' };
    const fingerprint = createHash('sha256').update(JSON.stringify([mobile, message])).digest('hex');
    const key = 'sms-dispatch:' + requestId;
    if (active.has(key)) return { ok: false, uncertain: true, error: 'SMS dispatch already in progress' };
    active.set(key, true);
    try {
      const prior = store.metaGet(key);
      if (prior && prior.fingerprint !== fingerprint) return { ok: false, uncertain: true, error: 'SMS request identity conflict' };
      if (prior?.state === 'accepted') return { ok: true, acceptedAt: prior.acceptedAt };
      if (prior && ['dispatching', 'uncertain'].includes(prior.state)) return { ok: false, uncertain: true, error: 'SMS delivery unconfirmed; check gateway before resending' };
      if (!apiUrl || !apiKey || !deviceId) return { ok: false, error: 'SMS gateway configuration missing' };
      let url; try { url = new URL(apiUrl); } catch { return { ok: false, error: 'Invalid SMS gateway URL' }; }
      if (url.protocol !== 'https:') return { ok: false, error: 'SMS gateway requires HTTPS' };
      const digits = String(mobile || '').replace(/\D/g, '');
      const num = digits.length === 10 ? '91' + digits : digits;
      if (!/^91[6-9]\d{9}$/.test(num) || !message) return { ok: false, error: 'Invalid SMS recipient or message' };
      store.metaSet(key, { fingerprint, state: 'dispatching' }); // Failure here must prevent network dispatch.
      const controller = new AbortController();
      let timer;
      try {
        const response = await Promise.race([
          fetchImpl(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
            body: JSON.stringify({ deviceId, recipients: [num], message }), signal: controller.signal }),
          new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('SMS request timed out')); }, timeoutMs); }),
        ]);
        if (!response.ok) {
          // Only explicit client rejection is safe to retry. Server errors may follow acceptance.
          if (response.status >= 400 && response.status < 500 && response.status !== 408) {
            store.metaSet(key, { fingerprint, state: 'rejected' });
            return { ok: false, error: `SMS gateway rejected request (${response.status})` };
          }
          throw new Error(`SMS gateway outcome unconfirmed (${response.status})`);
        }
        const acceptedAt = new Date().toISOString();
        store.metaSet(key, { fingerprint, state: 'accepted', acceptedAt });
        return { ok: true, acceptedAt };
      } catch (error) {
        try { store.metaSet(key, { fingerprint, state: 'uncertain' }); } catch { /* durable dispatching marker still prevents resend */ }
        return { ok: false, uncertain: true, error: 'SMS delivery unconfirmed; check gateway before resending' };
      } finally { clearTimeout(timer); }
    } catch (error) { return { ok: false, error: 'SMS local journal unavailable; no new dispatch confirmed' }; }
    finally { active.delete(key); }
  };
}
module.exports = { createSmsSender };
