'use strict';
// Local owner setup on the clinic PC. No shared password in the application.
// Hash verifies offline login. Sync credentials and remembered access are OS-encrypted.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const MIN_SECRET = 8, MAX_SECRET = 256;
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const deriveKey = (secret, salt) => new Promise((resolve, reject) =>
  crypto.scrypt(secret, salt, 64, SCRYPT, (error, key) => error ? reject(error) : resolve(key)));

function createOffline({ file, safeStorage, access, now = Date.now, fetchCloud, config, onCloudToken = () => {} }) {
  let generation = 0, busy = false, connecting = null, retryAt = 0;
  const encryptedAvailable = () => {
    try { return !!safeStorage?.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text'; }
    catch { return false; }
  };
  function read() {
    if (!fs.existsSync(file)) return null;
    try {
      const wrapper = JSON.parse(fs.readFileSync(file, 'utf8'));
      const record = wrapper.enc
        ? JSON.parse(safeStorage.decryptString(Buffer.from(wrapper.data, 'base64')))
        : wrapper.data; // Legacy plaintext hash requires manual login, never auto-restore.
      if (!record?.email || !record.userId || Buffer.from(record.hash, 'base64').length !== 64 || Buffer.from(record.salt, 'base64').length !== 16) throw Error();
      return { ...record, trustedStorage: wrapper.enc === true };
    } catch { throw new Error('Saved login read nahi ho paya. Login file delete/reset na karein; recovery zaroori hai. Patient data unchanged hai.'); }
  }
  function write(record) {
    if (!encryptedAvailable()) throw new Error('Windows secure storage available nahi hai. Windows user session unlock karke app dobara kholein.');
    const { trustedStorage, ...data } = record;
    const wrapper = { v: 2, enc: true, data: safeStorage.encryptString(JSON.stringify(data)).toString('base64') };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    const fd = fs.openSync(tmp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(wrapper)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
  }
  function grant(record) {
    const principal = { userId: record.userId, role: 'admin', pages: [], displayName: record.email,
      email: record.email, sessionKey: crypto.randomUUID(), localAdmin: true, offline: true, expiresAt: Number.MAX_SAFE_INTEGER };
    access.setPrincipal(principal);
    return { success: true, principal };
  }
  function status() {
    const record = read();
    return { configured: !!record, email: record?.email || '', secureStorage: encryptedAvailable() };
  }
  async function authenticate(args, setup = false) {
    if (busy) return { success: false, error: 'Login chal raha hai. Ek pal ruk kar try karein.' };
    busy = true;
    const epoch = generation;
    try {
      let record = read();
      const email = normalizeEmail(args?.identifier), secret = args?.secret;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof secret !== 'string' || secret.length < MIN_SECRET || secret.length > MAX_SECRET)
        return { success: false, error: 'Sahi email aur kam se kam 8 characters ka password dalein.' };
      if (setup) {
        if (record || access.getPrincipal()) return { success: false, error: 'Admin pehle se configured hai. Existing login use karein.' };
        if (args.confirmSecret !== secret) return { success: false, error: 'Dono passwords ek jaise hone chahiye.' };
        const salt = crypto.randomBytes(16);
        const hash = await deriveKey(secret, salt);
        record = { email, userId: crypto.randomUUID(), salt: salt.toString('base64'), hash: hash.toString('base64') };
      } else {
        if (!record) return { success: false, error: 'Pehle is PC par admin setup karein.' };
        if (record.lockUntil > now()) return { success: false, error: 'Bahut galat attempts. 15 minute baad try karein.' };
        const actual = await deriveKey(secret, Buffer.from(record.salt, 'base64'));
        if (epoch !== generation) return { success: false, error: 'Login cancel ho gaya.' };
        if (email !== record.email || !crypto.timingSafeEqual(actual, Buffer.from(record.hash, 'base64'))) {
          record.fails = (record.fails || 0) + 1;
          if (record.fails >= 5) { record.fails = 0; record.lockUntil = now() + 15 * 60000; }
          write(record);
          return { success: false, error: 'ID ya password galat hai.' };
        }
      }
      if (epoch !== generation) return { success: false, error: 'Login cancel ho gaya.' };
      record.fails = 0; record.lockUntil = 0;
      record.remember = args.remember !== false;
      record.syncSecret = secret; // Only within OS-encrypted file, never returned to renderer.
      write(record);
      retryAt = 0; generation++;
      onCloudToken(null);
      return grant(record);
    } finally { busy = false; }
  }
  function restore() {
    if (access.getPrincipal()) return access.getPrincipal();
    const record = read();
    if (record?.trustedStorage && record.remember === true) return grant(record).principal;
    return null;
  }
  function logout() {
    generation++; retryAt = 0; onCloudToken(null); access.setPrincipal(null);
    const record = read();
    if (record) { record.remember = false; delete record.cloud; write(record); }
  }
  async function request(endpoint, options = {}) {
    const response = await fetchCloud(config.url + endpoint, {
      ...options, headers: { apikey: config.key, 'Content-Type': 'application/json', ...options.headers },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('Cloud account/admin permission available nahi hai. PC par kaam chalta rahega.');
    return response.json();
  }
  async function connect() {
    if (!access.getPrincipal()?.localAdmin) return { success: false };
    if (connecting) return connecting;
    if (now() < retryAt) return { success: false, error: 'Cloud reconnect pending; PC data saved hai.' };
    const epoch = generation;
    connecting = (async () => {
      try {
        const record = read();
        if (!record?.trustedStorage || !record.syncSecret || !fetchCloud) return { success: false };
        let session = record.cloud;
        if (!session || session.expires_at * 1000 < now() + 60000) {
          session = await request('/auth/v1/token?grant_type=password', {
            method: 'POST', body: JSON.stringify({ email: record.email, password: record.syncSecret }),
          });
        }
        if (!session?.access_token || !session?.refresh_token) throw new Error('Cloud session unavailable');
        const headers = { Authorization: `Bearer ${session.access_token}` };
        const user = await request('/auth/v1/user', { headers });
        const profile = await request('/functions/v1/session-access', { method: 'POST', headers });
        if (normalizeEmail(user.email) !== record.email || profile.userId !== user.id || profile.role !== 'admin')
          throw new Error('Isi email ka verified cloud admin chahiye. Local data upload nahi hua.');
        if (epoch !== generation || !access.getPrincipal()?.localAdmin) return { success: false };
        record.cloud = { access_token: session.access_token, refresh_token: session.refresh_token,
          expires_at: session.expires_at || Math.floor(now() / 1000) + (session.expires_in || 3600) };
        write(record); onCloudToken(session.access_token);
        return { success: true, session: record.cloud };
      } catch (error) {
        if (epoch === generation) {
          retryAt = now() + 60000; onCloudToken(null);
          // An invalidated/rotated cloud token must not block recovery until its old expiry.
          try { const record = read(); if (record?.cloud) { delete record.cloud; write(record); } } catch { /* Preserve unreadable credential for recovery. */ }
        }
        return { success: false, error: error.message };
      }
    })();
    try { return await connecting; } finally { connecting = null; }
  }
  return { status, setup: args => authenticate(args, true), login: args => authenticate(args), restore, logout, connect };
}

function register({ ipcMain, access, app, safeStorage, net, config, onCloudToken }) {
  // Resolve after main.js changes userData; v2.0.46 captured the earlier path.
  const legacyFile = path.join(app.getPath('userData'), 'offline-admin.json');
  let offline;
  const get = () => {
    if (offline) return offline;
    const file = path.join(app.getPath('userData'), 'offline-admin.json');
    if (file !== legacyFile && !fs.existsSync(file) && fs.existsSync(legacyFile)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.copyFileSync(legacyFile, file, fs.constants.COPYFILE_EXCL);
    }
    return offline = createOffline({ file, safeStorage, access, fetchCloud: (...args) => net.fetch(...args), config, onCloudToken });
  };
  ipcMain.handle('auth:offlineStatus', () => get().status());
  ipcMain.handle('auth:offlineSetup', (_event, args) => get().setup(args));
  ipcMain.handle('auth:offlineLogin', (_event, args) => get().login(args));
  ipcMain.handle('auth:syncSession', () => get().connect());
  return { restore: () => get().restore(), logout: () => get().logout() };
}
module.exports = { register, createOffline, normalizeEmail, MIN_SECRET };
