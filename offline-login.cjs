"use strict";
// Offline admin sign-in.
// The credential is NEVER stored in source code. After a successful, server-verified
// cloud login the app keeps only a salted scrypt hash on this computer (additionally
// encrypted with the Windows user's key via Electron safeStorage when available).
// Every later successful online login refreshes that hash, so changing the password
// in Supabase automatically updates offline login the next time you sign in online.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const OFFLINE_SESSION_MS = 12 * 60 * 60 * 1000; // offline session length before re-login
const MAX_FAILS = 5;                            // wrong attempts before a temporary lock
const LOCK_MS = 15 * 60 * 1000;
const MIN_SECRET = 8;                           // same minimum as cloud staff accounts
const MAX_SECRET = 256;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const KEY_LEN = 64;

function normalizeEmail(identifier) {
  const v = String(identifier || '').trim().toLowerCase();
  if (!v || v.length > 254) return '';
  return v.includes('@') ? v : `${v}@staff.balajiclinic.local`; // same rule as Login.tsx
}

function deriveKey(secret, salt) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(secret, salt, KEY_LEN, SCRYPT, (err, key) => (err ? reject(err) : resolve(key))));
}

function createStore({ file, safeStorage }) {
  const canEncrypt = () => { try { return !!safeStorage && safeStorage.isEncryptionAvailable(); } catch { return false; } };
  function read() {
    try {
      const wrapper = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (wrapper.enc) {
        if (!canEncrypt()) return null;
        return JSON.parse(safeStorage.decryptString(Buffer.from(wrapper.data, 'base64')));
      }
      return wrapper.data;
    } catch { return null; }
  }
  function write(record) {
    const wrapper = canEncrypt()
      ? { v: 1, enc: true, data: safeStorage.encryptString(JSON.stringify(record)).toString('base64') }
      : { v: 1, enc: false, data: record };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(wrapper), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  return { read, write };
}

function createOffline({ file, safeStorage, access, now = () => Date.now() }) {
  const store = createStore({ file, safeStorage });

  // Called after a verified cloud login. Only an administrator principal may save.
  async function remember(args) {
    const principal = access.getPrincipal();
    if (!principal || principal.role !== 'admin' || !principal.userId) return { success: false, reason: 'not-admin' };
    const email = normalizeEmail(args && args.identifier);
    const secret = args && args.secret;
    if (!email || typeof secret !== 'string' || secret.length > MAX_SECRET) return { success: false, reason: 'invalid' };
    if (secret.length < MIN_SECRET) return { success: false, reason: 'too-short' };
    const salt = crypto.randomBytes(16);
    const hash = await deriveKey(secret, salt);
    store.write({
      email, userId: principal.userId, displayName: principal.displayName || '',
      salt: salt.toString('base64'), hash: hash.toString('base64'), fails: 0, lockUntil: 0,
    });
    return { success: true };
  }

  // Works without internet. Grants a time-limited administrator principal.
  async function login(args) {
    const fail = { success: false, error: 'Offline login nahi ho paya. ID/password check karein, ya pehle ek baar internet se login karein.' };
    const record = store.read();
    const email = normalizeEmail(args && args.identifier);
    const secret = args && args.secret;
    if (!record || !email || typeof secret !== 'string' || !secret || secret.length > MAX_SECRET) return fail;
    if (record.lockUntil && record.lockUntil > now()) {
      const minutes = Math.ceil((record.lockUntil - now()) / 60000);
      return { success: false, error: `Bahut galat koshish. ${minutes} minute baad dobara try karein.` };
    }
    const expected = Buffer.from(record.hash, 'base64');
    const actual = await deriveKey(secret, Buffer.from(record.salt, 'base64'));
    const ok = email === record.email && expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    if (!ok) {
      record.fails = (record.fails || 0) + 1;
      if (record.fails >= MAX_FAILS) { record.fails = 0; record.lockUntil = now() + LOCK_MS; }
      store.write(record);
      return fail;
    }
    if (record.fails || record.lockUntil) { record.fails = 0; record.lockUntil = 0; store.write(record); }
    const principal = {
      userId: record.userId, role: 'admin', pages: [], displayName: record.displayName || '',
      offline: true, expiresAt: now() + OFFLINE_SESSION_MS,
    };
    access.setPrincipal(principal);
    return { success: true, displayName: principal.displayName };
  }

  return { remember, login };
}

function register({ ipcMain, access, app, safeStorage }) {
  const offline = createOffline({ file: path.join(app.getPath('userData'), 'offline-admin.json'), safeStorage, access });
  ipcMain.handle('auth:offlineLogin', (_event, args) => offline.login(args));
  ipcMain.handle('auth:rememberOffline', (_event, args) => offline.remember(args));
}

module.exports = { register, createOffline, normalizeEmail, MIN_SECRET };
