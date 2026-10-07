const assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path');
const { createOffline, normalizeEmail } = require('../offline-login.cjs');

// Test-only values; no real credential is used or stored anywhere in the repository.
const SECRET = 'Test-Only-Secret-1', ID = 'Clinic.Admin';

function setup(role = 'admin') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offline-login-'));
  const file = path.join(dir, 'offline-admin.json');
  let principal = role ? { userId: 'user-1', role, pages: [], displayName: 'Dr Test' } : null;
  let clock = 1_000_000;
  const access = { getPrincipal: () => principal, setPrincipal: p => { principal = p; } };
  const api = createOffline({ file, access, safeStorage: null, now: () => clock });
  return { api, file, access, tick: ms => { clock += ms; }, principal: () => principal, clear: () => { principal = null; } };
}

(async () => {
  assert.equal(normalizeEmail('Clinic.Admin'), 'clinic.admin@staff.balajiclinic.local');
  assert.equal(normalizeEmail(' Owner@Example.com '), 'owner@example.com');

  // Only an administrator who is already verified online can save an offline login.
  const staff = setup('staff');
  assert.equal((await staff.api.remember({ identifier: ID, secret: SECRET })).success, false);
  const nobody = setup(null);
  assert.equal((await nobody.api.remember({ identifier: ID, secret: SECRET })).success, false);
  assert.ok(!fs.existsSync(staff.file));

  // Short secrets are refused (same 8-character minimum as cloud accounts).
  const t = setup();
  assert.equal((await t.api.remember({ identifier: ID, secret: '2019' })).reason, 'too-short');
  assert.ok(!fs.existsSync(t.file));

  // Save, and confirm the file holds a hash, never the secret itself.
  assert.equal((await t.api.remember({ identifier: ID, secret: SECRET })).success, true);
  const stored = fs.readFileSync(t.file, 'utf8');
  assert.ok(!stored.includes(SECRET));
  assert.ok(JSON.parse(stored).data.hash);

  // Offline login works with the right credentials and creates a bounded admin principal.
  t.clear();
  assert.equal(t.principal(), null);
  const ok = await t.api.login({ identifier: ID.toUpperCase(), secret: SECRET });
  assert.equal(ok.success, true);
  assert.equal(t.principal().role, 'admin');
  assert.equal(t.principal().offline, true);
  assert.ok(t.principal().expiresAt > 1_000_000);

  // Wrong secret / wrong id are rejected and grant nothing.
  t.clear();
  assert.equal((await t.api.login({ identifier: ID, secret: 'wrong-secret-1' })).success, false);
  assert.equal((await t.api.login({ identifier: 'someone-else', secret: SECRET })).success, false);
  assert.equal(t.principal(), null);

  // Temporary lock after repeated failures, even for the correct secret; unlocks later.
  for (let i = 0; i < 3; i++) await t.api.login({ identifier: ID, secret: 'wrong-secret-1' });
  const locked = await t.api.login({ identifier: ID, secret: SECRET });
  assert.equal(locked.success, false);
  assert.match(locked.error, /minute/);
  assert.equal(t.principal(), null);
  t.tick(16 * 60 * 1000);
  assert.equal((await t.api.login({ identifier: ID, secret: SECRET })).success, true);

  // Re-saving after an online login replaces the old secret (password change).
  assert.equal((await t.api.remember({ identifier: ID, secret: 'New-Secret-Value-2' })).success, true);
  t.clear();
  assert.equal((await t.api.login({ identifier: ID, secret: SECRET })).success, false);
  assert.equal((await t.api.login({ identifier: ID, secret: 'New-Secret-Value-2' })).success, true);

  // No saved record -> clear failure, no principal.
  const empty = setup(null);
  assert.equal((await empty.api.login({ identifier: ID, secret: SECRET })).success, false);
  assert.equal(empty.principal(), null);

  console.log('PASS: offline login — admin-only save, min length, hash-only storage, success, wrong id/secret, lockout/unlock, password refresh, no-record');
})().catch(e => { console.error(e); process.exitCode = 1; });
