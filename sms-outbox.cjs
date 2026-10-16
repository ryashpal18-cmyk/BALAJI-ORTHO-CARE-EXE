'use strict';
const { createHash } = require('crypto');
// A failure that happened BEFORE the request could leave this PC (DNS, refused/unreachable
// connection, connect timeout, TLS handshake) proves nothing was delivered, so a later retry
// cannot create a duplicate SMS. Anything else (our own timeout, reset mid-request, 5xx,
// journal write failure) stays "uncertain" and is never auto-resent.
const NOT_SENT_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN', 'ERR_TLS_CERT_ALTNAME_INVALID']);
const NOT_SENT_NET = /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|CONNECTION_REFUSED|ADDRESS_UNREACHABLE)/;
function provablyNotSent(error) {
  const found = [];
  let netText = false;
  const walk = (e, depth) => {
    if (!e || typeof e !== 'object' || depth > 3) return;
    if (typeof e.message === 'string' && NOT_SENT_NET.test(e.message)) netText = true;
    if (typeof e.code === 'string') found.push(e.code === 'ETIMEDOUT' && e.syscall === 'connect' ? 'ENETUNREACH' : e.code);
    walk(e.cause, depth + 1);
    if (Array.isArray(e.errors)) e.errors.forEach(x => walk(x, depth + 1));
  };
  walk(error, 0);
  if (netText && found.every(c => NOT_SENT_CODES.has(c))) return true;
  return found.length > 0 && found.every(c => NOT_SENT_CODES.has(c));
}
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
        if (provablyNotSent(error)) {
          // Nothing reached the gateway: release the journal so the normal backoff retry can send it.
          try { store.metaSet(key, { fingerprint, state: 'not_sent' }); return { ok: false, error: 'SMS gateway unreachable (internet/DNS); retry hoga' }; }
          catch { /* could not release the marker: stay conservative below */ }
        }
        try { store.metaSet(key, { fingerprint, state: 'uncertain' }); } catch { /* durable dispatching marker still prevents resend */ }
        return { ok: false, uncertain: true, error: 'SMS delivery unconfirmed; check gateway before resending' };
      } finally { clearTimeout(timer); }
    } catch (error) { return { ok: false, error: 'SMS local journal unavailable; no new dispatch confirmed' }; }
    finally { active.delete(key); }
  };
}
module.exports = { createSmsSender };
