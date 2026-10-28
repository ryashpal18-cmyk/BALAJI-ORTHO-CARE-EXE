'use strict';
// Cloud refresh tokens are independent of the offline owner's password.
const fs = require('fs');
const path = require('path');
function createCloudSync({ file, safeStorage, access, config, fetchCloud, onCloudToken = () => {}, now = Date.now }) {
  let generation = 0, connecting = null, retryAt = 0, lastError = '';
  function owner() {
    const p = access.getPrincipal();
    if (!p?.localAdmin || p.role !== 'admin') throw new Error('Local administrator login required');
    return p;
  }
  function read() {
    if (!fs.existsSync(file)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const record = JSON.parse(safeStorage.decryptString(Buffer.from(data.data, 'base64')));
      if (record.url !== config.url) {
        if (config.migratedFrom?.includes(record.url)) { lastError = "BJ BACKUP जोड़ने के लिए Settings → Cloud Sync में अपना cloud email/password एक बार भरें। Pending data सुरक्षित है।"; return null; }
        throw Error();
      }
      if (!record.ownerId || !record.session?.refresh_token) throw Error();
      return record;
    } catch { throw new Error('Saved cloud connection cannot be read; reconnect cloud without resetting patient data'); }
  }
  function write(record) {
    if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text')
      throw new Error('Windows secure storage unavailable');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const data = safeStorage.encryptString(JSON.stringify(record)).toString('base64');
    const tmp = file + '.tmp';
    const fd = fs.openSync(tmp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify({ v: 1, data })); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
  }
  async function request(endpoint, options = {}) {
    const res = await fetchCloud(config.url + endpoint, {
      ...options, headers: { apikey: config.key, 'Content-Type': 'application/json', ...options.headers },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`Cloud connection failed (${res.status}); reconnect cloud if login expired`);
    return res.json();
  }
  function clean(session) {
    if (typeof session?.access_token !== 'string' || typeof session?.refresh_token !== 'string' ||
        !session.access_token || !session.refresh_token || session.access_token.length > 16384 || session.refresh_token.length > 16384)
      throw new Error('Invalid cloud session');
    return { access_token: session.access_token, refresh_token: session.refresh_token,
      expires_at: Number(session.expires_at) || Math.floor(now() / 1000) + Number(session.expires_in || 3600) };
  }
  async function verify(session) {
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const user = await request('/auth/v1/user', { headers });
    if (typeof user.id !== 'string') throw new Error('Cloud user not verified');
    // Existing RLS protects this lookup. No admin-enrollment function is invoked.
    const roles = await request('/rest/v1/user_roles?select=role&user_id=eq.' + encodeURIComponent(user.id), { headers });
    if (!Array.isArray(roles) || !roles.some(r => r.role === 'admin')) throw new Error('Cloud administrator account required for clinic sync');
    return user.id;
  }
  function unchanged(p, epoch) { return generation === epoch && access.getPrincipal()?.sessionKey === p.sessionKey && access.getPrincipal()?.localAdmin; }
  function status() {
    const p = owner(), record = read();
    return { configured: !!record && record.ownerId === p.userId, projectUrl: config.url, error: lastError };
  }
  async function adopt(candidate) {
    const p = owner(), epoch = ++generation;
    let session = clean(candidate);
    if (session.expires_at * 1000 < now() + 60000)
      session = clean(await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) }));
    const userId = await verify(session);
    if (!unchanged(p, epoch)) throw new Error('Local login changed during cloud connection');
    write({ ownerId: p.userId, url: config.url, userId, session });
    retryAt = 0; lastError = ''; onCloudToken(session.access_token);
    return { success: true };
  }
  async function connect() {
    const p = owner();
    if (connecting) return connecting;
    if (now() < retryAt) return { success: false, error: lastError };
    const epoch = generation;
    connecting = (async () => {
      try {
        const record = read();
        if (!record || record.ownerId !== p.userId) return { success: false, error: 'Cloud connection required once in Settings → Cloud Sync' };
        let session = clean(record.session);
        if (session.expires_at * 1000 < now() + 60000) {
          session = clean(await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) }));
          // Persist rotated refresh tokens before another request can fail.
          if (!unchanged(p, epoch)) return { success: false, error: 'Local login changed' };
          record.session = session; write(record);
        }
        const userId = await verify(session);
        if (userId !== record.userId || !unchanged(p, epoch)) return { success: false, error: 'Cloud identity changed' };
        lastError = ''; onCloudToken(session.access_token);
        return { success: true, session };
      } catch (error) {
        if (unchanged(p, epoch)) { retryAt = now() + 60000; lastError = error.message; onCloudToken(null); }
        return { success: false, error: error.message };
      }
    })();
    try { return await connecting; } finally { connecting = null; }
  }
  function pause() { generation++; retryAt = 0; onCloudToken(null); }
  return { status, adopt, connect, pause };
}
module.exports = { createCloudSync };
