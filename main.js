/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   BALAJI ORTHO CONNECT — Electron Main Process                  ║
 * ║   Offline-First | Auto Seed DB | Cloud Sync | IPC Bridge        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog, Menu, net, Notification, safeStorage } = require('electron');
const path  = require('path');
const fs    = require('fs');
const https = require('https');
const { autoUpdater } = require('electron-updater');
const logger = require('./logger.cjs');
const sqliteStore = require('./sqlite-store.cjs');
const access = require('./access-control.cjs');
const authPublicConfig = require('./auth-public-config.json');
let verifiedCloudToken = null;
let authGeneration = 0;
// Register guards before any handlers, including raw renderer IPC aliases.
const registeredDiagnosticChannels = new Set();
const rendererMonitorReady = new WeakSet();
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, fn) => {
  originalHandle(channel, async (event, ...args) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error("Untrusted IPC sender");
  access.authorize(channel, args, sqliteStore);
  if (['auth:logout','auth:offlineLogin','auth:offlineSetup'].includes(channel)) authGeneration++;
  try { return await fn(event, ...args); }
  catch(error) {
    if(channel!=='log:rendererError')logger.record({level:channel.startsWith('auth:')?'warn':'error',source:'ipc:'+channel,message:error?.message||'Desktop operation failed',stack:error?.stack});
    throw error;
  }
  });
  registeredDiagnosticChannels.add(channel);
};
const originalOn = ipcMain.on.bind(ipcMain);
ipcMain.on = (channel, fn) => originalOn(channel, (event, ...args) => {
  try { if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error("Untrusted sender"); access.authorize(channel, args, sqliteStore); return fn(event, ...args); }
  catch (error) { logger.logWarn('auth', `IPC denied: ${channel}`); }
});
ipcMain.handle('auth:establish', async (_event, token) => {
  if (access.getPrincipal()?.localAdmin) throw new Error('Use the local admin sync connection');
  const epoch = authGeneration;
  if (typeof token !== 'string' || token.length > 8192) throw new Error('Invalid session');
  const response = await net.fetch(`${authPublicConfig.url}/functions/v1/session-access`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: authPublicConfig.key }, signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) { if (epoch === authGeneration && [401,403].includes(response.status)) access.setPrincipal(null); throw new Error('Session verification failed; check function deployment'); }
  const profile = await response.json();
  if (!['admin','staff'].includes(profile.role) || !Array.isArray(profile.pages)) throw new Error('Invalid access profile');
  const verified = { ...profile, expiresAt: Date.now() + 8 * 60 * 60 * 1000 };
  if (epoch !== authGeneration || access.getPrincipal()?.localAdmin) throw new Error('Session changed during verification');
  verifiedCloudToken = token;
  access.setPrincipal(verified); return { success: true, principal: verified };
});
// Local login and cloud sync are independent. A cloud outage never clears local access.
const offlineAuth = require('./offline-login.cjs').register({ ipcMain, access, app, safeStorage, net,
  config: authPublicConfig, onCloudToken: token => { verifiedCloudToken = token; } });

let cloudSync;
const getCloudSync = () => cloudSync ||= require('./cloud-sync.cjs').createCloudSync({
  file: path.join(app.getPath('userData'), 'cloud-sync-session.json'), safeStorage, access,
  config: authPublicConfig, fetchCloud: (...args) => net.fetch(...args),
  onCloudToken: token => { verifiedCloudToken = token; }
});
ipcMain.handle('auth:syncSession', () => getCloudSync().connect());
ipcMain.handle('auth:adoptSyncSession', (_event, session) => getCloudSync().adopt(session));
ipcMain.handle('auth:cloudSyncStatus', () => getCloudSync().status());


// Process-level crash/error handlers jitni jaldi ho sake set kar do, taaki
// startup ke dauran bhi koi exception silently na guzar jaaye.
logger.setVersion(app.getVersion());
logger.setupGlobalHandlers();

// ─── SINGLE INSTANCE LOCK ───────────────────────────────────────────────
// 🚨 PRODUCTION-AUDIT FIX: Pehle koi single-instance guard nahi tha — agar
// app do baar khul jaaye (double-click, ya startup-shortcut + manual open
// dono), to do alag Electron process ek hi C:\Balaji_Health_Backup ke
// JSON files (patients.json, bills.json, etc.) aur offline_cache.db par
// SAME WAQT likh sakte the — ek process ka save doosre ke write se
// overwrite ho sakta tha (JSON tmp+rename dono process ek hi tmp filename
// use karte). Ab dusra launch khud hi turant band ho jaata hai aur pehle
// se chal rahi window ko front pe le aata hai — koi data-loss risk nahi.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  // 🚨 FIX: Pehle sirf app.quit() tha — lekin usse baaki script (whenReady,
  // SQLite init, snapshot, sab) phir bhi chalti rehti thi. Ab turant process
  // khatam karte hain taaki dusra instance kuch bhi na chhue.
  app.exit(0);
  process.exit(0);
} else {
  app.on('second-instance', () => {
    logger.logWarn('app-lifecycle', 'Doosra instance launch hua — maujooda window front pe laa rahe hain.');
    // 🚨 FIX: Agar main window band ho chuki hai (lekin process background mein
    // zinda tha), to pehle nayi window banao — warna user ko kuch dikhta hi nahi.
    if (!mainWindow || mainWindow.isDestroyed()) {
      app.whenReady().then(() => createWindow());
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

// ─── FIX: IndexedDB "UnknownError: Internal error" (konicaminolta PC) ──────
// Root cause: iss PC pe C:\Users\konicaminolta\AppData\Roaming\... waala
// default userData folder shayad redirected/synced/locked hai (roaming profile
// ya backup tool), jisse Chromium ka LevelDB (IndexedDB/Local Storage ke peeche
// waala engine) apna LOCK file properly nahi le paata — isliye HAR open attempt
// (fresh DB samet) "UnknownError: Internal error" de raha tha. Nuclear reset ke
// logs mein bhi "Local Storage"/"Cache" delete EBUSY/EPERM se fail ho rahe the —
// matlab koi aur process/mechanism un files ko hold kiye hua hai.
// Fix: Chromium ka poora userData (Local Storage, IndexedDB, Cache, etc.) ab
// C:\Balaji_Health_Backup ke saath waali reliable local drive pe shift kar rahe
// hain — yeh jagah already bina kisi lock/permission error ke kaam kar rahi hai.
// YEH LINE app.whenReady() SE PEHLE HONI CHAHIYE, warna asar nahi karegi.
const CHROMIUM_USERDATA_DIR = 'C:\\Balaji_Health_Backup\\chromium_userdata';
try {
  if (!fs.existsSync(CHROMIUM_USERDATA_DIR)) fs.mkdirSync(CHROMIUM_USERDATA_DIR, { recursive: true });
  app.setPath('userData', CHROMIUM_USERDATA_DIR);
  logger.logInfo('startup', `userData path set to: ${CHROMIUM_USERDATA_DIR}`);
} catch (e) {
  logger.logError('startup', `userData path set fail: ${e.message}`);
}

// ─── PATHS ────────────────────────────────────────────────────────────────────
const BACKUP_DIR    = 'C:\\Balaji_Health_Backup';
const PATIENTS_FILE = path.join(BACKUP_DIR, 'patients.json');
const BILLS_FILE    = path.join(BACKUP_DIR, 'bills.json');
const REPORTS_FILE  = path.join(BACKUP_DIR, 'reports.json');
const XRAYS_FILE    = path.join(BACKUP_DIR, 'xrays.json');
const PENDING_FILE  = path.join(BACKUP_DIR, 'pending_sync.json');
const SETTINGS_FILE = path.join(BACKUP_DIR, 'settings.json');
const FRACTURE_FILE = path.join(BACKUP_DIR, 'fractures.json');
const XRAYS_DIR     = path.join(BACKUP_DIR, 'xray_images');
const AUTH_FILE     = path.join(BACKUP_DIR, 'auth.json');

const SEED_FILE = path.join(__dirname, 'public', 'patients_seed.json');

// Naya, clean backup system — purane hardcoded C:\ path se alag, taaki legacy
// system se collide na ho. app.getPath('documents') Windows/Mac/Linux teeno
// par sahi user-writable folder deta hai.
const APP_BACKUP_DIR = path.join(app.getPath('documents'), 'Balaji_Ortho_Backups');
function ensureAppBackupDir() {
  if (!fs.existsSync(APP_BACKUP_DIR)) fs.mkdirSync(APP_BACKUP_DIR, { recursive: true });
}

// Daily safety snapshots — local JSON files (patients/bills/etc.) ki ek roz ki
// copy yahan rakhi jaati hai. Agar kabhi main file corrupt ho jaaye (crash,
// power-cut beech write mein) to yahan se manually restore ho sakta hai.
const SAFETY_SNAPSHOT_ROOT = path.join(APP_BACKUP_DIR, 'safety_snapshots');
const SNAPSHOT_KEEP_DAYS   = 30;

let mainWindow;
let whatsappWindow = null;
let isQuitting = false; // true hote hi WhatsApp window 'hide' nahi hogi, sach mein band hogi

// ─── ENSURE DIRECTORIES ───────────────────────────────────────────────────────
function ensureDirs() {
  [BACKUP_DIR, XRAYS_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

// ─── SEED DATABASE ON FIRST RUN ───────────────────────────────────────────────
function seedPatientsOnFirstRun() {
  if (fs.existsSync(PATIENTS_FILE)) return;
  if (fs.existsSync(SEED_FILE)) {
    fs.copyFileSync(SEED_FILE, PATIENTS_FILE);
  } else {
    fs.writeFileSync(PATIENTS_FILE, JSON.stringify([], null, 2));
  }
}

// ─── JSON HELPERS ─────────────────────────────────────────────────────────────
function readJSON(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    logger.logError('readJSON', `${filePath} corrupt — ${e.message}. .bak se restore try kar rahe hain.`);
    try {
      const bakPath = `${filePath}.bak`;
      if (fs.existsSync(bakPath)) {
        const raw = fs.readFileSync(bakPath, 'utf-8');
        const data = JSON.parse(raw);
        logger.logWarn('readJSON', `${filePath} .bak se safaltapoorvak restore hui.`);
        return data;
      }
    } catch (e2) {
      logger.logError('readJSON', `${filePath}.bak bhi corrupt/missing — ${e2.message}`);
    }
    return fallback;
  }
}

function writeJSON(filePath, data) {
  try {
    const json = JSON.stringify(data, null, 2);
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, json, 'utf-8');

    // Purani sahi-salaamat file ko .bak mein rakho — taaki agar kabhi
    // beech-mein crash/power-cut ho to readJSON() yahan se restore kar sake.
    if (fs.existsSync(filePath)) {
      try { fs.copyFileSync(filePath, `${filePath}.bak`); } catch (_) { /* best-effort */ }
    }

    // Rename atomic hota hai — isliye half-written file kabhi disk par
    // "live" file ki jagah nahi dikhegi.
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (e) {
    logger.logError('writeJSON', `${filePath}: ${e.message}`);
    return false;
  }
}

// ─── SAFE BULK-TABLE BACKUP WRITE ──────────────────────────────────────────
// 🚨 CRITICAL FIX (Phase 2): backup:writeSnapshot aur runDirectCloudBackup
// dono full-table-replace writes hain — poori file ko naye data se overwrite
// karte hain. Agar source (SQLite cache read, ya Supabase fetch) kisi bhi
// wajah se khaali array [] laut de (transient read error, network glitch,
// auth issue) — jo dono jagah pehle se hi silently "[]" ban jaata tha — to
// ye function VAASTAV mein khaali data ko file mein likh deta, aur isse
// asli safety-backup khud hi corrupt ho jaata (bilkul usi scenario mein
// jab uski sabse zyada zaroorat padti — SQLite ya network problem ke waqt).
// Ye helper sirf ek guard add karta hai: agar naya data khaali hai LEKIN
// purani file mein pehle se real records hain, to overwrite skip kar dete
// hain aur warning log karte hain — data kabhi silently zero nahi hota.
// (Genuine empty state — jaise pehli baar app chalna — abhi bhi likhi jaati
// hai, kyunki tab purani file khud khaali/missing hoti hai.)
function writeJSONSafe(filePath, rows, sourceLabel) {
  if (Array.isArray(rows) && rows.length === 0) {
    const existing = readJSON(filePath, []);
    if (Array.isArray(existing) && existing.length > 0) {
      logger.logWarn(
        'backup-safety',
        `${sourceLabel}: naya data khaali (0 records) mila lekin ${filePath} mein pehle se ${existing.length} records hain — overwrite SKIP kiya, purana backup surakshit rakha.`
      );
      return { written: false, skipped: true, count: existing.length };
    }
  }
  const ok = writeJSON(filePath, rows);
  return { written: ok, skipped: false, count: Array.isArray(rows) ? rows.length : 0 };
}

// ─── GENERIC ATOMIC FILE WRITE (tmp + rename) ─────────────────────────────
// 🚨 FIX (Phase 2.1): backup:writeJson/backup:writeBinary (Settings → Backup
// tab ka "Backup Now" + daily/weekly auto-backup) pehle SEEDHA fullPath par
// fs.writeFileSync karte the — koi tmp file, koi atomic rename nahi. Agar
// app crash/power-cut beech mein ho jaaye (bade JSON/Excel export ke case
// mein write ek hi syscall mein complete nahi bhi ho sakta), to exact
// backup filename par ek PARTIAL/corrupt file reh jaati — aur Dr ko pata
// bhi nahi chalta ki ye specific backup file corrupt hai, kyunki filename
// bilkul normal dikhta hai. Ab writeJSON() jaisa hi tmp+rename pattern use
// karte hain — crash ho to sirf ek orphan ".tmp" file rehti hai (jo kabhi
// backup ki tarah treat nahi hoti), asli filename par ya to poori file hai
// ya bilkul nahi hai — kabhi aadhi-likhi nahi.
function atomicWriteFile(fullPath, data) {
  const tmpPath = `${fullPath}.tmp`;
  fs.writeFileSync(tmpPath, data);
  fs.renameSync(tmpPath, fullPath);
}

// ─── INIT ALL JSON FILES ──────────────────────────────────────────────────────
function initFiles() {
  if (!fs.existsSync(BILLS_FILE))    writeJSON(BILLS_FILE,    []);
  if (!fs.existsSync(REPORTS_FILE))  writeJSON(REPORTS_FILE,  []);
  if (!fs.existsSync(XRAYS_FILE))    writeJSON(XRAYS_FILE,    []);
  if (!fs.existsSync(PENDING_FILE))  writeJSON(PENDING_FILE,  []);
  if (!fs.existsSync(FRACTURE_FILE)) writeJSON(FRACTURE_FILE, []);
  if (!fs.existsSync(SETTINGS_FILE)) writeJSON(SETTINGS_FILE, {
    centerName:  'Balaji Ortho Care Center',
    doctorName:  'Dr. S. S. Rathore',
    supabaseUrl: authPublicConfig.url,
    supabaseKey: authPublicConfig.key,
    autoSync:    true
  });
  // Legacy auth.json is no longer trusted or exported. Remove plaintext credentials.
  if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
  if (fs.existsSync(AUTH_FILE + '.bak')) fs.unlinkSync(AUTH_FILE + '.bak');
}

// ─── DAILY SAFETY SNAPSHOT ────────────────────────────────────────────────────
// Har din app khulne par patients/bills/reports/xrays/fractures/settings ki
// ek copy "Documents/Balaji_Ortho_Backups/safety_snapshots/<date>" mein bhi
// rakh di jaati hai — .bak file ke upar ek extra safety layer, jo poore din
// ka snapshot deta hai (na ki sirf last-write se pehle wali state).
function takeDailySafetySnapshot() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const dir   = path.join(SAFETY_SNAPSHOT_ROOT, today);
    if (fs.existsSync(dir)) return; // aaj ka snapshot ho chuka hai

    fs.mkdirSync(dir, { recursive: true });
    const files = [PATIENTS_FILE, BILLS_FILE, REPORTS_FILE, XRAYS_FILE, FRACTURE_FILE, SETTINGS_FILE, PENDING_FILE];
    for (const f of files) {
      if (fs.existsSync(f)) fs.copyFileSync(f, path.join(dir, path.basename(f)));
    }
    logger.logInfo('safety-snapshot', `Daily snapshot saved: ${dir}`);
  } catch (e) {
    logger.logError('safety-snapshot', e.message);
  }
}

/** 30 din se purane safety snapshots hata deta hai, taaki disk na bhare. */
function cleanupOldSnapshots() {
  try {
    if (!fs.existsSync(SAFETY_SNAPSHOT_ROOT)) return;
    const cutoff = Date.now() - SNAPSHOT_KEEP_DAYS * 24 * 60 * 60 * 1000;
    for (const d of fs.readdirSync(SAFETY_SNAPSHOT_ROOT)) {
      const full = path.join(SAFETY_SNAPSHOT_ROOT, d);
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) fs.rmSync(full, { recursive: true, force: true });
    }
  } catch (e) {
    logger.logError('safety-snapshot-cleanup', e.message);
  }
}

// ─── PENDING SYNC HELPER ──────────────────────────────────────────────────────
function addPending(item) {
  const pending = readJSON(PENDING_FILE);
  item.id = `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  item.ts = new Date().toISOString();
  pending.push(item);
  if (pending.length > 1000) pending.splice(0, pending.length - 1000);
  writeJSON(PENDING_FILE, pending);
}

// ─── INTERNET CHECK ───────────────────────────────────────────────────────────
// Ek host fail ho (DNS blip, ISP issue) to doosre host se confirm karte hain,
// taaki ek galat negative ki wajah se app "offline" na maan le jab internet
// asal me chal raha ho.
function pingHost(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 2000 }, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ✅ Result ko thodi der cache karo — patient save, bill save, entry save sab
// isOnline() call karte hain. Bina cache ke har save pe naya network ping
// lagta, aur genuinely offline hone par ye 5-10 second ki delay deta tha.
let _internetCache = { value: false, ts: 0 };
const INTERNET_CACHE_MS = 4000;

async function checkInternet() {
  // ✅ Fast path: OS se instantly pata chal jaata hai (bina network call ke)
  // ki system hi offline hai. Agar OS bole "no connection", to Supabase/Google
  // ko ping karne ki zarurat nahi — turant false return karo.
  try {
    if (net && typeof net.isOnline === 'function' && !net.isOnline()) {
      _internetCache = { value: false, ts: Date.now() };
      return false;
    }
  } catch {}

  // Short cache — baar baar entries save karte waqt repeat ping avoid karo
  if (Date.now() - _internetCache.ts < INTERNET_CACHE_MS) {
    return _internetCache.value;
  }

  const primary = await pingHost('https://idcxmeczzfnipmybikue.supabase.co');
  let result = primary;
  if (!result) {
    // Fallback host — Supabase project khud down/unreachable ho sakta hai par
    // baaki internet chal raha ho, isliye general connectivity bhi confirm karo.
    result = await pingHost('https://www.google.com/generate_204');
  }
  _internetCache = { value: result, ts: Date.now() };
  return result;
}

// ─── SUPABASE REST UPSERT ─────────────────────────────────────────────────────
function supabaseInsert(supabaseUrl, supabaseKey, table, rows) {
  return new Promise((resolve) => {
    if (!supabaseUrl || !supabaseKey || !rows || rows.length === 0)
      return resolve({ ok: false, reason: 'missing config' });

    const body    = JSON.stringify(Array.isArray(rows) ? rows : [rows]);
    const urlObj  = new URL(`${supabaseUrl}/rest/v1/${table}`);
    const options = {
      hostname: urlObj.hostname,
      path:     `${urlObj.pathname}?on_conflict=id`,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'apikey':         supabaseKey,
        ...(supabaseKey.startsWith('sb_publishable_') ? {} : { Authorization: `Bearer ${supabaseKey}` }),
        'Prefer':         'resolution=merge-duplicates',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () =>
        resolve(res.statusCode >= 200 && res.statusCode < 300
          ? { ok: true }
          : { ok: false, status: res.statusCode, body: data })
      );
    });
    req.on('error', (e) => resolve({ ok: false, reason: e.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ ok: false, reason: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

// ─── DIRECT CLOUD → DISK BACKUP (IndexedDB se bilkul independent) ────────────
// ASLI WAJAH pata chali: patients.json/bills.json mein "0 records" isliye
// aa rahe the kyunki backup:writeSnapshot handler renderer ke IndexedDB cache
// se data leta hai — aur IndexedDB iss hafte khud hi nahi khul rahi thi
// (upar wala userData fix isko theek karega). Lekin sirf usi fix pe depend
// nahi karna — chahe IndexedDB future mein kabhi phir kharab ho jaaye, disk
// backup files khaali NAHI honi chahiye jab tak Supabase pe asli data
// (565 patients, 610 bills — jo diagnostic report mein dikha) maujood hai.
// Isliye main process ab seedha Supabase se periodically fetch karke
// yahi JSON files bhar deta hai — koi browser storage beech mein nahi aata.
function supabaseFetchAll(supabaseUrl, supabaseKey, table) {
  return new Promise((resolve) => {
    if (!supabaseUrl || !supabaseKey) return resolve({ ok: false, rows: [] });
    const urlObj  = new URL(`${supabaseUrl}/rest/v1/${table}?select=*`);
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'GET',
      headers: {
        'apikey':        supabaseKey,
        ...(supabaseKey.startsWith('sb_publishable_') ? {} : { Authorization: `Bearer ${supabaseKey}` }),
        'Range-Unit':    'items',
        'Range':         '0-9999',   // ek baar mein 10,000 tak rows — clinic scale ke liye kaafi
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve({ ok: true, rows: JSON.parse(data) }); }
          catch (e) { resolve({ ok: false, rows: [], reason: `parse fail: ${e.message}` }); }
        } else {
          resolve({ ok: false, rows: [], status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, rows: [], reason: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ ok: false, rows: [], reason: 'timeout' }); });
    req.end();
  });
}

let isCloudBackingUp = false;
async function runDirectCloudBackup() {
  if (isCloudBackingUp) return;
  const settings = { ...readJSON(SETTINGS_FILE, {}), supabaseUrl: authPublicConfig.url, supabaseKey: authPublicConfig.key };
  if (!settings.supabaseUrl || !settings.supabaseKey) return;

  const isOnline = await checkInternet();
  if (!isOnline) return;

  isCloudBackingUp = true;
  try {
    const tableFilePairs = [
      ['patients',       PATIENTS_FILE],
      ['billing',        BILLS_FILE],
      ['fracture_cases', FRACTURE_FILE],
      ['fracture_xrays', XRAYS_FILE],
    ];
    let totalWritten = 0;
    for (const [table, file] of tableFilePairs) {
      const result = await supabaseFetchAll(settings.supabaseUrl, settings.supabaseKey, table);
      if (result.ok && Array.isArray(result.rows)) {
        const res = writeJSONSafe(file, result.rows, `cloud-backup:${table}`);
        totalWritten += res.count;
      } else {
        logger.logWarn('cloud-backup', `${table} fetch fail — ${result.reason || result.status}`);
      }
    }
    logger.logInfo('cloud-backup', `Direct Supabase → disk backup done — ${totalWritten} total records likhe gaye`);
  } catch (e) {
    logger.logError('cloud-backup', `Direct cloud backup fail: ${e.message}`);
  } finally {
    isCloudBackingUp = false;
  }
}

// ─── AUTO SYNC ────────────────────────────────────────────────────────────────
let isSyncing = false;

async function runAutoSync() {
  if (isSyncing) return;
  const settings = { ...readJSON(SETTINGS_FILE, {}), supabaseUrl: authPublicConfig.url, supabaseKey: authPublicConfig.key };
  if (!settings.autoSync || !settings.supabaseUrl || !settings.supabaseKey) return;

  const isOnline = await checkInternet();
  if (!isOnline) return;

  isSyncing = true;
  console.log('[SYNC] Online detected — syncing...');

  try {
    const pending = readJSON(PENDING_FILE);
    if (pending.length === 0) { isSyncing = false; return; }

    const tableMap = {
      patient: 'patients',
      bill:    'billing',
      report:  'xray_reports',
      xray:    'xray_reports',
      ortho:   'fracture_cases',
    };

    const groups = {};
    for (const item of pending) {
      if (!groups[item.type]) groups[item.type] = [];
      groups[item.type].push(item);
    }

    const syncedIds = [];

    for (const [type, items] of Object.entries(groups)) {
      const table = tableMap[type];
      if (!table) { items.forEach(i => syncedIds.push(i.id)); continue; }

      const payloads = items.map(i => { const p = { ...i.payload }; delete p.synced; return p; });

      for (let s = 0; s < payloads.length; s += 50) {
        const batch  = payloads.slice(s, s + 50);
        const result = await supabaseInsert(settings.supabaseUrl, settings.supabaseKey, table, batch);
        if (result.ok) {
          items.slice(s, s + 50).forEach(i => syncedIds.push(i.id));
          console.log(`[SYNC] ✅ ${batch.length} ${type} synced to ${table}`);
        } else {
          console.warn(`[SYNC] ⚠️ ${type} failed:`, result.reason || result.status);
        }
      }
    }

    if (syncedIds.length > 0) {
      writeJSON(PENDING_FILE, pending.filter(p => !syncedIds.includes(p.id)));
      const remaining = readJSON(PENDING_FILE).length;
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('sync-complete', { synced: syncedIds.length, remaining });
      console.log(`[SYNC] Done. Synced: ${syncedIds.length} | Remaining: ${remaining}`);
    }
  } catch (e) {
    console.error('[SYNC] Error:', e.message);
  }
  isSyncing = false;
}

// ─── CREATE WINDOW ────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Balaji Ortho Connect',
    icon: path.join(__dirname, 'public', 'favicon.ico'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      webSecurity:      true
    }
  });

  Menu.setApplicationMenu(null);

  const indexPath = path.join(__dirname, 'dist', 'index.html');
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== require('url').pathToFileURL(indexPath).href) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({url}) => {
    if (url === 'about:blank' || url === '') return { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { preload: undefined, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } } };
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (fs.existsSync(indexPath)) {
    mainWindow.loadFile(indexPath);
  } else {
    mainWindow.loadURL('data:text/html,<h1 style="color:red;font-family:sans-serif;padding:40px">Please run npm run build first</h1>');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    // 🚨 ROOT-CAUSE FIX: WhatsApp window "close" pe sirf hide hoti hai, to woh
    // hidden window Electron ko "abhi window baaki hai" batati rehti thi aur
    // window-all-closed kabhi fire nahi hota tha — app invisible background
    // process bankar zinda rehti thi. Agla launch "second instance" ban ke
    // turant marta tha (screen pe bas ek blink). Ab main window band hote hi
    // poori app band hoti hai.
    isQuitting = true;
    if (whatsappWindow && !whatsappWindow.isDestroyed()) {
      whatsappWindow.removeAllListeners('close');
      whatsappWindow.destroy();
    }
    app.quit();
  });
}

// ─── WHATSAPP WINDOW ─────────────────────────────────────────────────────────
function openWhatsAppWindow(url) {
  if (whatsappWindow && !whatsappWindow.isDestroyed()) {
    whatsappWindow.loadURL(url);
    whatsappWindow.show();
    whatsappWindow.focus();
    return;
  }

  whatsappWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'WhatsApp Web — Balaji Ortho Care',
    icon: path.join(__dirname, 'public', 'favicon.ico'),
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      webSecurity:      true,
      partition:        'persist:whatsapp',   // Session save — dobara QR scan nahi karni
      // Chrome 124+ user-agent — WhatsApp Web older Chrome ko reject karta hai
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  });

  // session-level par bhi user-agent set karo (kuch requests header se override lete hain)
  whatsappWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    callback({ requestHeaders: details.requestHeaders });
  });

  whatsappWindow.loadURL(url);

  // ✅ FIX: Offline hone par WhatsApp Web load fail hoti thi aur Chromium ka
  // "no internet" error page dikhta tha (jo user ko "error" jaisa lagta tha).
  // Ab is jagah ek simple, saaf message dikhate hain — koi error nahi,
  // sirf batate hain ki internet aane par WhatsApp yahan khud khul jayega.
  whatsappWindow.webContents.on('did-fail-load', (_e, errorCode, _desc, _url, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -3) return; // ERR_ABORTED — user ne khud navigate kiya, ignore
    const offlineHtml = `
      <html><body style="display:flex;align-items:center;justify-content:center;height:100vh;
        margin:0;font-family:sans-serif;background:#1a3a6b;color:#fff;text-align:center;">
        <div>
          <h2>📶 Internet nahi hai</h2>
          <p>WhatsApp yahan internet aane par automatically load ho jayega.</p>
          <p style="opacity:0.8;font-size:14px;">Ye window ab band kar sakte hain — koi error nahi hai.</p>
        </div>
      </body></html>`;
    whatsappWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(offlineHtml)}`);
  });

  // Hide on close — login session bacha rahega
  whatsappWindow.on('close', (e) => {
    if (isQuitting) return; // app band ho rahi hai — window ko sach mein band hone do
    e.preventDefault();
    whatsappWindow.hide();
  });
}

// ═══════════════════════════════════════════════════════════════
//  IPC — AUTH (Offline + Online)
// ═══════════════════════════════════════════════════════════════

// Compatibility endpoint cannot grant a local administrator session.
ipcMain.handle('auth:login', async () => ({ success: false, error: 'Use verified cloud sign-in' }));
ipcMain.handle('auth:check', async () => {
  const principal = access.getPrincipal() || offlineAuth.restore();
  return { success: true, valid: !!principal, principal };
});
ipcMain.handle('auth:logout', async () => {
  offlineAuth.logout();
  verifiedCloudToken = null;
  cloudSync?.pause();
  access.setPrincipal(null);
  return { success: true };
});

// ═══════════════════════════════════════════════════════════════
//  IPC — DATABASE
// ═══════════════════════════════════════════════════════════════

ipcMain.handle('db:savePatient', async (_event, patient) => {
  try {
    const patients = readJSON(PATIENTS_FILE);
    const mobile   = String(patient.mobile || '').replace(/\D/g, '');
    const idx      = patients.findIndex(p => String(p.mobile || '').replace(/\D/g, '') === mobile);
    const entry    = { ...patient, mobile, updated_at: new Date().toISOString(), synced: false };
    if (idx >= 0) {
      patients[idx] = { ...patients[idx], ...entry };
    } else {
      entry.id         = entry.id || `local_${Date.now()}`;
      entry.created_at = new Date().toISOString();
      patients.push(entry);
    }
    writeJSON(PATIENTS_FILE, patients);
    addPending({ type: 'patient', payload: entry });
    return { success: true, data: entry };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('db:getAllPatients',  async ()            => ({ success: true, data: readJSON(PATIENTS_FILE) }));

ipcMain.handle('db:searchPatient',  async (_e, query)   => {
  const patients = readJSON(PATIENTS_FILE);
  const q = String(query || '').replace(/\D/g, '');
  if (!q) return { success: true, data: null };
  const found = patients.find(p => { const pm = String(p.mobile||'').replace(/\D/g,''); return pm===q||pm.endsWith(q)||pm.startsWith(q); });
  return { success: true, data: found || null };
});

ipcMain.handle('db:searchPatients', async (_e, query)   => {
  const patients = readJSON(PATIENTS_FILE);
  const q = String(query||'').toLowerCase();
  if (!q) return { success: true, data: [] };
  return { success: true, data: patients.filter(p => (p.name||'').toLowerCase().includes(q)||(p.mobile||'').includes(q)).slice(0,20) };
});

ipcMain.handle('db:saveBill', async (_event, bill) => {
  try {
    const bills = readJSON(BILLS_FILE);
    const entry = { ...bill, id: `bill_${Date.now()}`, created_at: new Date().toISOString(), synced: false };
    bills.push(entry); writeJSON(BILLS_FILE, bills); addPending({ type: 'bill', payload: entry });
    return { success: true, data: entry };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('db:getBills', async (_event, mobile) => {
  const bills = readJSON(BILLS_FILE);
  return { success: true, data: mobile ? bills.filter(b => String(b.patient_mobile||b.mobile||'').includes(String(mobile))) : bills };
});

ipcMain.handle('db:saveReport', async (_event, report) => {
  try {
    const reports = readJSON(REPORTS_FILE);
    const entry   = { ...report, id: `rpt_${Date.now()}`, created_at: new Date().toISOString(), synced: false };
    reports.push(entry); writeJSON(REPORTS_FILE, reports); addPending({ type: 'report', payload: entry });
    return { success: true, data: entry };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('db:getReports', async (_event, mobile) => {
  const reports = readJSON(REPORTS_FILE);
  return { success: true, data: mobile ? reports.filter(r => (r.patient_mobile||'').includes(mobile)) : reports };
});

ipcMain.handle('db:saveXray', async (_event, xray) => {
  try {
    const xrays = readJSON(XRAYS_FILE);
    const entry  = { ...xray, id: `xr_${Date.now()}`, created_at: new Date().toISOString(), synced: false };
    xrays.push(entry); writeJSON(XRAYS_FILE, xrays); addPending({ type: 'xray', payload: entry });
    return { success: true, data: entry };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('db:getXrays', async (_event, mobile) => {
  const xrays = readJSON(XRAYS_FILE);
  return { success: true, data: mobile ? xrays.filter(x => (x.patient_mobile||'').includes(mobile)) : xrays };
});

ipcMain.handle('db:saveFractureCase', async (_event, orthoCase) => {
  try {
    const cases = readJSON(FRACTURE_FILE);
    const entry = { ...orthoCase, id: orthoCase.id||`ortho_${Date.now()}`, created_at: orthoCase.created_at||new Date().toISOString(), synced: false };
    cases.push(entry); writeJSON(FRACTURE_FILE, cases); addPending({ type: 'ortho', payload: entry });
    return { success: true, data: entry };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('db:getFractureCases', async () => {
  try { return { success: true, data: readJSON(FRACTURE_FILE) }; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('db:updateFractureCase', async (_event, updated) => {
  try {
    const cases = readJSON(FRACTURE_FILE);
    const idx   = cases.findIndex(c => c.id === updated.id);
    if (idx >= 0) {
      cases[idx] = { ...cases[idx], ...updated, synced: false, updated_at: new Date().toISOString() };
      writeJSON(FRACTURE_FILE, cases); addPending({ type: 'ortho', payload: cases[idx] });
      return { success: true, data: cases[idx] };
    }
    return { success: false, error: 'Case not found' };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('db:copyXrayImage', async (_event, srcPath) => {
  try {
    const ext      = path.extname(srcPath);
    const fileName = `xray_${Date.now()}${ext}`;
    const destPath = path.join(XRAYS_DIR, fileName);
    fs.copyFileSync(srcPath, destPath);
    return { success: true, localPath: destPath };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.on('save-offline-data', (_event, fileName, data) => {
  try { fs.writeFileSync(path.join(BACKUP_DIR, fileName), JSON.stringify(data, null, 2)); }
  catch (e) { console.error('[legacy save-offline-data]', e.message); }
});

ipcMain.handle('db:getSettings', async ()              => ({ success: true, data: readJSON(SETTINGS_FILE, {}) }));
ipcMain.handle('db:saveSettings', async (_e, settings) => { writeJSON(SETTINGS_FILE, settings); return { success: true }; });
ipcMain.handle('db:getPending',   async ()             => ({ success: true, data: readJSON(PENDING_FILE) }));
ipcMain.handle('db:clearPending', async (_e, ids)      => {
  const p = readJSON(PENDING_FILE);
  writeJSON(PENDING_FILE, ids ? p.filter(x => !ids.includes(x.id)) : []);
  return { success: true };
});
ipcMain.handle('db:markSynced',  async (_e, { type, mobile }) => {
  if (type === 'patient' && mobile) {
    const pts = readJSON(PATIENTS_FILE);
    const idx = pts.findIndex(p => String(p.mobile||'') === String(mobile));
    if (idx >= 0) { pts[idx].synced = true; writeJSON(PATIENTS_FILE, pts); }
  }
  return { success: true };
});
ipcMain.handle('db:syncNow',    async () => { await runAutoSync(); return { success: true, remaining: readJSON(PENDING_FILE).length }; });
ipcMain.handle('backup:runDirectCloudBackup', async () => { await runDirectCloudBackup(); return { success: true, data: readJSON(PATIENTS_FILE) ? { patients: readJSON(PATIENTS_FILE).length, bills: readJSON(BILLS_FILE).length } : {} }; });
ipcMain.handle('app:isOnline',  async () => ({ online: await checkInternet() }));

ipcMain.handle('db:getStats', async () => {
  const patients  = readJSON(PATIENTS_FILE);
  const bills     = readJSON(BILLS_FILE);
  const reports   = readJSON(REPORTS_FILE);
  const xrays     = readJSON(XRAYS_FILE);
  const fractures = readJSON(FRACTURE_FILE);
  const pending   = readJSON(PENDING_FILE);
  const today     = new Date().toDateString();
  return { success: true, data: {
    totalPatients:  patients.length,
    totalBills:     bills.length,
    totalReports:   reports.length,
    totalXrays:     xrays.length,
    totalFractures: fractures.length,
    pendingSync:    pending.length,
    todayPatients:  patients.filter(p => new Date(p.created_at||0).toDateString()===today).length,
    todayBills:     bills.filter(b    => new Date(b.created_at||0).toDateString()===today).length,
  }};
});

ipcMain.handle('shell:openFolder', async (_e, folderPath) => { shell.openPath(folderPath || BACKUP_DIR); });
ipcMain.handle('shell:print',      async (_e, html) => {
  const pw = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
  pw.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  pw.webContents.on('did-finish-load', () => { pw.webContents.print({ silent: false, printBackground: true }, () => pw.close()); });
  return { success: true };
});

ipcMain.handle('app:getBackupDir', async () => BACKUP_DIR);
ipcMain.handle('app:getXraysDir',  async () => XRAYS_DIR);

// ─── SQLITE CACHE → DISK SAFETY BACKUP (JSON snapshot) ────────────────────
// 🚨 CRITICAL: Pehle patients.json/bills.json etc. kabhi likhi hi nahi jaati
// thi (purana legacy IPC path use nahi hota tha), isliye diagnostic report
// mein hamesha "0 records" dikhta tha aur agar cache corrupt ho jaaye to
// koi asli backup nahi tha restore karne ke liye. Ab renderer periodically
// (aur app band karte waqt) apna poora SQLite cache yahan bhejta hai, aur
// hum use in files mein likh dete hain — ab ye files genuinely useful hain.
// (Naam "IndexedDB" purane code se reh gaya tha — ab ye SQLite se aata hai.)
const TABLE_FILE_MAP = {
  patients: PATIENTS_FILE,
  billing: BILLS_FILE,
  fracture_cases: FRACTURE_FILE,
  fracture_xrays: XRAYS_FILE,
};

ipcMain.handle('backup:writeSnapshot', async (_e, tables) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    let written = 0;
    const failedTables = [];
    for (const [tableName, rows] of Object.entries(tables || {})) {
      if (!Array.isArray(rows)) continue;
      const targetFile = TABLE_FILE_MAP[tableName]
        || path.join(BACKUP_DIR, `${tableName}.json`);
      const res = writeJSONSafe(targetFile, rows, `writeSnapshot:${tableName}`);
      written += res.count;
      // 🚨 FIX (Phase 2.1): res.written===false + res.skipped===false ka
      // matlab genuine I/O failure hai (disk full, permission denied, drive
      // removed) — writeJSON() ye already logError karta hai, lekin ye
      // handler pehle iska result CHECK hi nahi karta tha, hamesha
      // "success: true" bol deta tha chahe file likhna fail ho gaya ho.
      // Isse disk-full jaisi situation mein app chupchaap "backup ho gaya"
      // bol deta, jabki kuch bhi disk par nahi likha gaya tha.
      if (!res.written && !res.skipped) failedTables.push(tableName);
    }
    logger.logInfo('backup', `Local safety snapshot disk pe likha gaya — ${written} total records`);
    if (failedTables.length > 0) {
      logger.logError('backup', `Snapshot write PARTIALLY FAILED — tables likhi nahi ja saki: ${failedTables.join(', ')} (disk full / permission / drive disconnect ho sakta hai)`);
      return { success: false, written, failedTables, error: `Write failed for: ${failedTables.join(', ')}` };
    }
    return { success: true, written };
  } catch (e) {
    logger.logError('backup', `Snapshot write fail: ${e.message}`);
    return { success: false, error: e.message };
  }
});

// ═══════════════════════════════════════════════════════════════
//  IPC — OFFLINE STORE (SQLite — IndexedDB replacement)
// ═══════════════════════════════════════════════════════════════
// Renderer (src/lib/offlineDb.ts) IndexedDB ke bajaye ab in handlers
// ke through main-process SQLite file se baat karta hai. Har handler
// try/catch mein hai taaki kisi ek query fail hone se poora app na gire.

ipcMain.handle('offline:commitBatch', async (_e, items) => {
  try {
    const data = sqliteStore.authorizedBatch(items, item => access.authorize('offline:commitMutation', [item], sqliteStore), access.getPrincipal()?.userId || null);
    return { success: true, data };
  } catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('offline:commitMutation', async (_e, { mutation, row, idField }) => {
  try { return { success: true, data: sqliteStore.commitMutation({ ...mutation, ownerUserId: access.getPrincipal()?.userId || null }, row, idField) }; }
  catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('offline:snapshot', async () => {
  try { return { success: true, data: sqliteStore.snapshot() }; }
  catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('offline:restoreSnapshot', async (_e, dump) => {
  try { return { success: true, data: sqliteStore.restoreSnapshot(dump) }; }
  catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('offline:adjustStock', async (_e, args) => {
  try { return { success: true, data: sqliteStore.adjustStock({ ...args, ownerUserId: access.getPrincipal()?.userId || null }) }; }
  catch (e) { return { success: false, error: e.message }; }
});
ipcMain.handle('offline:cacheGetAll', async (_e, table) => {
  try { return { success: true, data: access.filterRows(table, sqliteStore.cacheGetAll(table), sqliteStore) }; }
  catch (e) { logger.logError('sqlite', `cacheGetAll(${table}) fail: ${e.message}`); return { success: false, data: [] }; }
});

ipcMain.handle('offline:cacheGetRow', async (_e, { table, rowId }) => {
  try { return { success: true, data: access.filterRows(table, [sqliteStore.cacheGetRow(table, rowId)].filter(Boolean), sqliteStore)[0] }; }
  catch (e) { logger.logError('sqlite', `cacheGetRow(${table}) fail: ${e.message}`); return { success: false, data: undefined }; }
});

ipcMain.handle('offline:cacheSetRows', async (_e, { table, rows, idField }) => {
  try { sqliteStore.cacheSetRows(table, rows, idField || 'id'); return { success: true }; }
  catch (e) { logger.logError('sqlite', `cacheSetRows(${table}) fail: ${e.message}`); return { success: false }; }
});

ipcMain.handle('offline:cacheReplaceTable', async (_e, { table, rows, idField }) => {
  try {
    const principal = access.getPrincipal();
    const all = sqliteStore.cacheGetAll(table);
    const preserve = principal?.role === 'staff' ? all.filter(row => !access.rowAllowed(table, row, sqliteStore)) : [];
    sqliteStore.cacheReplaceTable(table, [...rows, ...preserve], idField || 'id'); return { success: true };
  }
  catch (e) { logger.logError('sqlite', `cacheReplaceTable(${table}) fail: ${e.message}`); return { success: false }; }
});

// Authoritative cash-day refresh never accepts renderer-supplied reopened rows.
ipcMain.handle('offline:refreshCashDays', async () => {
  const userId = access.getPrincipal()?.userId;
  const token = verifiedCloudToken;
  if (!userId || !token) throw new Error('Cloud connection required for cash-day refresh');
  const rows = [];
  for (let offset=0; ; ) {
    const response = await net.fetch(`${authPublicConfig.url}/rest/v1/cash_book_days?select=*&order=id&limit=500&offset=${offset}`, {
      headers: { apikey: authPublicConfig.key, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('Cash-day refresh unavailable');
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('Invalid cash-day response');
    if (batch.length === 0) break;
    rows.push(...batch); offset += batch.length;
  }
  if (access.getPrincipal()?.userId !== userId || verifiedCloudToken !== token) throw new Error('Session changed during refresh');
  sqliteStore.cacheReplaceTable('cash_book_days',rows,'id');
  return {success:true};
});

ipcMain.handle('offline:cacheMergeServer', async (_e, { table, row, idField }) => {
  sqliteStore.cacheMergeServer(table, row, idField || 'id'); return { success: true };
});

ipcMain.handle('offline:cacheUpsertRow', async (_e, { table, row, idField }) => {
  try { sqliteStore.cacheUpsertRow(table, row, idField || 'id'); return { success: true }; }
  catch (e) { logger.logError('sqlite', `cacheUpsertRow(${table}) fail: ${e.message}`); return { success: false }; }
});

ipcMain.handle('offline:cacheDeleteRow', async (_e, { table, rowId }) => {
  try { sqliteStore.cacheDeleteRow(table, rowId); return { success: true }; }
  catch (e) { logger.logError('sqlite', `cacheDeleteRow(${table}) fail: ${e.message}`); return { success: false }; }
});

ipcMain.handle('offline:cacheReplaceRowKey', async (_e, { table, oldId, newRow, idField }) => {
  try { sqliteStore.cacheReplaceRowKey(table, oldId, newRow, idField || 'id'); return { success: true }; }
  catch (e) { logger.logError('sqlite', `cacheReplaceRowKey(${table}) fail: ${e.message}`); return { success: false }; }
});

ipcMain.handle('offline:queueAdd', async (_e, mutation) => {
  try { return { success: true, id: sqliteStore.queueAdd({ ...mutation, ownerUserId: access.getPrincipal()?.userId || null }) }; }
  catch (e) { logger.logError('sqlite', `queueAdd fail: ${e.message}`); return { success: false, id: -1 }; }
});

ipcMain.handle('offline:queueGetAll', async () => {
  try { return { success: true, data: sqliteStore.queueGetAll().filter(m => access.canMutation(m, sqliteStore)) }; }
  catch (e) { logger.logError('sqlite', `queueGetAll fail: ${e.message}`); return { success: false, data: [] }; }
});

ipcMain.handle('offline:queueRemove', async (_e, id) => {
  try { sqliteStore.queueRemove(id); return { success: true }; }
  catch (e) { logger.logError('sqlite', `queueRemove fail: ${e.message}`); return { success: false }; }
});

ipcMain.handle('offline:queueUpdate', async (_e, { id, patch }) => {
  try { sqliteStore.queueUpdate(id, patch); return { success: true }; }
  catch (e) { logger.logError('sqlite', `queueUpdate fail: ${e.message}`); return { success: false }; }
});

ipcMain.handle('offline:metaGet', async (_e, key) => {
  try { return { success: true, value: sqliteStore.metaGet(key) }; }
  catch (e) { logger.logError('sqlite', `metaGet(${key}) fail: ${e.message}`); return { success: false, value: undefined }; }
});

ipcMain.handle('offline:metaSet', async (_e, { key, value }) => {
  try { sqliteStore.metaSet(key, value); return { success: true }; }
  catch (e) { logger.logError('sqlite', `metaSet(${key}) fail: ${e.message}`); return { success: false }; }
});

ipcMain.handle('offline:isLegacyMigrated', async () => {
  try { return { success: true, migrated: sqliteStore.isLegacyMigrated() }; }
  catch (e) { return { success: false, migrated: true }; } // fail-safe: dobara migrate mat karo
});

ipcMain.handle('offline:importLegacyDump', async (_e, dump) => {
  try { return { success: true, ...sqliteStore.importLegacyDump(dump) }; }
  catch (e) { logger.logError('sqlite', `importLegacyDump fail: ${e.message}`); return { success: false }; }
});

// Restore ke liye — agar kabhi IndexedDB genuinely mar jaaye, is se data wapas mil sakta hai
ipcMain.handle('backup:readSnapshot', async () => {
  try {
    const result = {};
    for (const [tableName, filePath] of Object.entries(TABLE_FILE_MAP)) {
      result[tableName] = readJSON(filePath);
    }
    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── NEW APP DATA BACKUP (Settings → Backup tab) ──────────────────────────
ipcMain.handle('backup:getDir', async () => {
  ensureAppBackupDir();
  return APP_BACKUP_DIR;
});

ipcMain.handle('backup:writeJson', async (_e, { fileName, jsonString }) => {
  try {
    ensureAppBackupDir();
    const safeName = String(fileName || 'backup.json').replace(/[/\\]/g, '_');
    const fullPath = path.join(APP_BACKUP_DIR, safeName);
    atomicWriteFile(fullPath, jsonString);
    return { success: true, path: fullPath };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('backup:writeBinary', async (_e, { fileName, base64Data }) => {
  try {
    ensureAppBackupDir();
    const safeName = String(fileName || 'backup.xlsx').replace(/[/\\]/g, '_');
    const fullPath = path.join(APP_BACKUP_DIR, safeName);
    atomicWriteFile(fullPath, Buffer.from(base64Data, 'base64'));
    return { success: true, path: fullPath };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('backup:list', async () => {
  try {
    ensureAppBackupDir();
    const files = fs.readdirSync(APP_BACKUP_DIR)
      .filter(f => f.endsWith('.json') || f.endsWith('.xlsx'))
      .map(f => {
        const stat = fs.statSync(path.join(APP_BACKUP_DIR, f));
        return { name: f, size: stat.size, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return { success: true, files };
  } catch (e) { return { success: false, error: e.message, files: [] }; }
});

ipcMain.handle('backup:openFolder', async () => {
  ensureAppBackupDir();
  shell.openPath(APP_BACKUP_DIR);
  return { success: true };
});

ipcMain.on('open-external-url', (_e, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url).catch(() => {});
});

ipcMain.on('open-whatsapp', (_e, payload) => {
  let url = typeof payload === 'string' ? payload
    : (payload && typeof payload === 'object') ? (payload.url || payload.webUrl || payload.desktopUrl || '') : '';
  openWhatsAppWindow(url || 'https://web.whatsapp.com');
});

// ─── SMS — Main process se bhejo (CORS issue fix) ────────────────────────────
const sendDurableSMS = require('./sms-outbox.cjs').createSmsSender({ store: sqliteStore });
ipcMain.handle('app:sendSMS', async (_e, input) => sendDurableSMS(input));

// Diagnostic checks only read clinical data. Reports are separate, local files.
let diagnosticService;
const diagnosticReportDir = path.join(APP_BACKUP_DIR, 'diagnostics');
const requiredDiagnosticChannels = [...new Set([...fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8')
  .matchAll(/ipcRenderer\.invoke\(['"]([^'"]+)['"]/g)].map(m => m[1]))];
const boundedDiagnostic = (promise, ms) => {
  let timer; return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Diagnostic probe timed out')),ms);})]).finally(()=>clearTimeout(timer));
};
function getDiagnostics() {
  return diagnosticService ||= require('./diagnostics.cjs').createDiagnostics({
    store: sqliteStore, logger, reportDir: diagnosticReportDir,
    backupDir: APP_BACKUP_DIR, dataDir: BACKUP_DIR,
    appInfo: () => ({version:app.getVersion(),electron:process.versions.electron,node:process.versions.node,platform:process.platform}),
    registeredChannels: () => ({required:requiredDiagnosticChannels,registered:[...registeredDiagnosticChannels]}),
    uiProbe: async () => {
      if (!mainWindow || mainWindow.isDestroyed()) return null;
      return boundedDiagnostic(mainWindow.webContents.executeJavaScript(`(() => ({
        route:location.hash.split('?')[0].replace(/\\b[0-9a-f]{8}-[0-9a-f-]{27,}\\b/gi,':id').replace(/([/?])[^/?]*[0-9][^/?]*/g,'$1:id').slice(0,160),
        width:innerWidth,height:innerHeight,rootChildren:document.getElementById('root')?.childElementCount??null,
        overflowPx:Math.max(0,document.documentElement.scrollWidth-innerWidth),
        brokenImages:[...document.images].filter(i=>i.complete&&!!i.currentSrc&&!i.naturalWidth).length
      }))()`),5000);
    },
    cloudProbe: async () => {
      if (!authPublicConfig.url || !authPublicConfig.key) return [{code:'CLOUD-001',status:'error',title:'Cloud public configuration missing',evidence:'Bundled URL/public key unavailable'}];
      // No token refresh, login, mutation, enrollment, gateway call or patient body is performed here.
      if (!verifiedCloudToken) return [{code:'CLOUD-002',status:'skipped',title:'Authenticated cloud read check',evidence:'No current verified cloud session; local login is independent.'}];
      const epoch=authGeneration,token=verifiedCloudToken;
      return Promise.all(['patients','billing','sms_logs'].map(async table => {
        try {
          const response = await boundedDiagnostic(net.fetch(authPublicConfig.url+'/rest/v1/'+table+'?select=id&limit=0', {
            method:'GET',headers:{apikey:authPublicConfig.key,Authorization:'Bearer '+token},signal:AbortSignal.timeout(6000)
          }),6500);
          await response.body?.cancel();
          if(epoch!==authGeneration||token!==verifiedCloudToken)return {code:'CLOUD-003',status:'skipped',title:table+' read access',evidence:'Cloud session changed during check'};
          return {code:'CLOUD-003',status:response.ok?'pass':[401,403].includes(response.status)?'error':'warn',title:table+' authenticated read access',evidence:{httpStatus:response.status,rowsRequested:0,scope:'Endpoint/query access only; row-level data visibility and full sync not verified'}};
        } catch(error) { return {code:'NET-002',status:'warn',title:table+' cloud read unavailable',evidence:{error:error.name==='TimeoutError'?'Timeout':'Network/service unavailable'}}; }
      }));
    }
  });
}
logger.setAlertHandler(issue => {
  if(mainWindow && !mainWindow.isDestroyed() && access.getPrincipal()?.role==='admin')
    mainWindow.webContents.send('bug-detected',{title:`${issue.code}: बार-बार error`,body:`${issue.count} बार एक मिनट में। Settings → About → Run Diagnostics से report निकालें।`});
});
function requireDiagnosticAdmin(){if(access.getPrincipal()?.role!=='admin')throw Error('Administrator login required');}
ipcMain.handle('app:runDiagnostics', async (_event,options) => {requireDiagnosticAdmin();const epoch=authGeneration;try{const result=await getDiagnostics().run({mode:options?.mode});requireDiagnosticAdmin();if(epoch!==authGeneration)throw Error('Login changed during diagnostics');return result;}catch(error){logger.logError('diagnostics',error.message,error);return {success:false,error:'DIAG-001: Report could not complete/save. Check disk and logs.'};}});
ipcMain.handle('diagnostics:history', () => {requireDiagnosticAdmin();return getDiagnostics().history();});
ipcMain.handle('diagnostics:openReport', async (_event,name) => {requireDiagnosticAdmin();const error=await shell.openPath(getDiagnostics().reportFile(name));if(error)throw Error(error);return {success:true};});
// Preserve the old notification action, but never open an arbitrary renderer-supplied path.
ipcMain.handle('bug:openDetail', async () => {requireDiagnosticAdmin();const report=await getDiagnostics().run({mode:'quick'});await shell.openPath(getDiagnostics().reportFile(report.reportName));return {success:true};});

// ─── APP INFO / DIAGNOSTICS (About tab + crash logging) ──────────────────
ipcMain.handle('app:getVersion', async () => ({
  version:  app.getVersion(),
  electron: process.versions.electron,
  chrome:   process.versions.chrome,
  node:     process.versions.node,
  platform: process.platform,
}));

// ─── AUTO-UPDATER (electron-updater — GitHub Releases, silent download) ──────
// electron-updater NSIS ke saath background mein .exe download kar leta hai,
// fir ek click par install + restart ho jaata hai — uninstall zaruri nahi.

autoUpdater.autoDownload    = false; // pehle user ko poochho, tab download
autoUpdater.autoInstallOnAppQuit = false;

// Renderer ko update events forward karo
function sendUpdateStatus(event, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', { event, ...payload });
  }
}

autoUpdater.on('checking-for-update',  ()      => sendUpdateStatus('checking'));
autoUpdater.on('update-not-available', (info)  => sendUpdateStatus('not-available', { currentVersion: app.getVersion() }));
autoUpdater.on('error',                (err)   => {
  logger.logError('auto-updater', err.message);
  sendUpdateStatus('error', { error: err.message });
});
autoUpdater.on('update-available', (info) => {
  logger.logInfo('auto-updater', `Naya version available: ${info.version}`);
  sendUpdateStatus('available', {
    latestVersion:  info.version,
    currentVersion: app.getVersion(),
    notes:          info.releaseNotes || '',
  });
});
autoUpdater.on('download-progress', (progress) => {
  sendUpdateStatus('progress', {
    percent:        Math.round(progress.percent),
    transferred:    progress.transferred,
    total:          progress.total,
    bytesPerSecond: progress.bytesPerSecond,
  });
});
autoUpdater.on('update-downloaded', (info) => {
  logger.logInfo('auto-updater', `Download complete: ${info.version}`);
  sendUpdateStatus('downloaded', { latestVersion: info.version });
});

// IPC: React se check trigger karna
ipcMain.handle('app:checkForUpdate', async () => {
  try {
    await autoUpdater.checkForUpdates();
    return { success: true, currentVersion: app.getVersion() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: React se download start karna
ipcMain.handle('app:downloadUpdate', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC: Download ke baad install + restart
ipcMain.handle('app:installUpdate', async () => {
  autoUpdater.quitAndInstall(false, true); // silent=false, forceRunAfter=true
  return { success: true };
});

ipcMain.handle('app:openExternal', async (_e, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) await shell.openExternal(url);
  return { success: true };
});

ipcMain.handle('log:rendererError', async (_e, input = {}) => {
  if(input?.code==='UI-START')rendererMonitorReady.add(_e.sender);
  // Merge message AND stack; one structured event per error. Payload fields are sanitized in logger.
  logger.record({level:input.level,source:input.source||'renderer',message:input.message,
    stack:input.stack,detail:input.detail,action:input.action,code:input.code,route:input.route});
  return { success: true };
});

ipcMain.handle('log:getDir', async () => logger.getLogDir());
ipcMain.handle('log:openFolder', async () => {
  shell.openPath(logger.getLogDir());
  return { success: true };
});

ipcMain.handle('safety:getSnapshotDir', async () => {
  ensureAppBackupDir();
  return SAFETY_SNAPSHOT_ROOT;
});
// ── Alias: preload.js 'log:getSnapshotDir' channel ka handler (missing tha — 8 errors/session) ──
ipcMain.handle('log:getSnapshotDir', async () => {
  ensureAppBackupDir();
  return SAFETY_SNAPSHOT_ROOT;
});
ipcMain.handle('safety:openSnapshotFolder', async () => {
  ensureAppBackupDir();
  if (!fs.existsSync(SAFETY_SNAPSHOT_ROOT)) fs.mkdirSync(SAFETY_SNAPSHOT_ROOT, { recursive: true });
  shell.openPath(SAFETY_SNAPSHOT_ROOT);
  return { success: true };
});

// ─── NUCLEAR OFFLINE-DB RESET ─────────────────────────────────────────────────
// Jab offline storage itni corrupt ho ki code se bhi fix na ho —
// ye handler purani IndexedDB files (agar kisi PC pe legacy se pade hain)
// AUR ab wala SQLite offline_cache.db (naya main storage) — dono delete
// karta hai, phir app restart karta hai — sab automatic, user kuch nahi karta.
ipcMain.handle('app:nuclearIndexedDBReset', async () => ({
  success: false,
  error: 'Data protection: storage reset is disabled. Export a full backup and use diagnostics; no patient, bill or queue was deleted.',
}));

// ═══════════════════════════════════════════════════════════════
//  APP LIFECYCLE
// ═══════════════════════════════════════════════════════════════
app.whenReady().then(() => {
  ensureDirs();
  initFiles();
  // ✅ IndexedDB replace — offline cache/queue ab isi C:\Balaji_Health_Backup
  // disk pe ek real SQLite file (offline_cache.db) mein rehta hai. Isse
  // Chromium ke corrupt-prone LevelDB storage ka dependency khatam ho gaya.
  try {
    sqliteStore.init(BACKUP_DIR);
  } catch (e) {
    logger.logError('app-lifecycle', `SQLite offline store init fail: ${e.message}`);
  }
  try {require('./pc-messaging.cjs').registerPcMessaging({app,BrowserWindow,ipcMain,dialog,shell,store:sqliteStore,access,sendSMS:sendDurableSMS,logger});}
  catch(error){logger.logError('whatsapp','Messaging setup unavailable: '+error.message);}
  const attachmentCache=require('./attachment-cache.cjs').createAttachmentCache({cacheRoot:path.join(app.getPath('userData'),'clinical-photo-cache'),localRoots:[XRAYS_DIR,path.join(app.getPath('userData'),'clinical-files')],cloudOrigin:new URL(authPublicConfig.url).origin});
  ipcMain.handle('attachment:read',(_e,source)=>{if(access.getPrincipal()?.role!=='admin')throw Error('Administrator login required');return attachmentCache.read(source);});
  ipcMain.handle('attachment:write',(_e,input)=>{if(access.getPrincipal()?.role!=='admin')throw Error('Administrator login required');return attachmentCache.write(input);});
  seedPatientsOnFirstRun();
  ensureAppBackupDir();
  takeDailySafetySnapshot();
  cleanupOldSnapshots();
  logger.cleanOldLogs();
  logger.logInfo('app-lifecycle', `App started — version ${app.getVersion()}`);
  createWindow();
  // App ready hone ke 8 sec baad silently update check karo
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(e => logger.logWarn('auto-updater', `Startup check fail: ${e.message}`));
  }, 8000);
  setTimeout(runAutoSync, 5000);
  setInterval(runAutoSync, 60 * 1000);
  // Direct cloud→disk backup — IndexedDB ki sehat pe depend nahi karta,
  // isliye patients.json/bills.json kabhi "0 records" nahi dikhayenge
  // jab tak internet + Supabase reachable hain.
  setTimeout(runDirectCloudBackup, 12000);
  setInterval(runDirectCloudBackup, 10 * 60 * 1000);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('before-quit', () => {
  isQuitting = true;
  // Failsafe: agar kisi wajah se quit atak jaaye (hung handler, file lock) to
  // 3 second baad process zabardasti khatam — taaki background mein zinda na rahe.
  setTimeout(() => { try { app.exit(0); } catch (_) { process.exit(0); } }, 3000).unref();
  if (whatsappWindow && !whatsappWindow.isDestroyed()) {
    whatsappWindow.removeAllListeners('close');
    whatsappWindow.close();
  }
});

app.on('web-contents-created', (_e, contents) => {
  contents.on('new-window', (e) => e.preventDefault());
  contents.on('console-message', (_event,level,message) => {
    if(level===3&&!rendererMonitorReady.has(contents))logger.record({level:'error',source:'ui-bootstrap',code:'UI-007',message});
  });
  contents.on('did-fail-load', (_event,code,_description,_url,isMainFrame) => {
    if(isMainFrame&&code!==-3)logger.record({level:'error',source:'renderer-load',code:'UI-005',message:'Main screen failed to load',detail:{nativeCode:code}});
  });
  contents.on('unresponsive',()=>logger.record({level:'error',source:'renderer-health',code:'UI-006',message:'Renderer became unresponsive'}));
});

// Renderer crash ya hang ho jaaye (e.g. out-of-memory, GPU crash) to bhi
// log ho jaaye — warna sirf "white screen" dikhega aur pata nahi chalega kyun.
//
// ✅ AUTO-RECOVERY: SQLite (better-sqlite3) hamesha main process mein
// synchronously chalta hai — koi bhi DB read/write ek hi IPC handler call
// ke andar poora complete hota hai. Renderer (Chromium) process alag hai,
// isliye renderer crash hone se koi SQLite transaction beech mein nahi
// rukta aur DB corrupt hone ka koi risk nahi hai. Isliye window ko
// recreate karna yahan safe hai.
//
// Recovery sirf genuinely-abnormal reasons pe try karte hain
// ('crashed', 'oom', 'abnormal-exit', 'launch-failed', 'integrity-failure').
// 'clean-exit' / 'killed' jaanbujh kar (intentional close/shutdown) ho sakta
// hai, isliye unpe recreate nahi karte — warna app quit karte waqt bhi naya
// window khul sakta hai.
//
// Crash-loop se bachne ke liye: 1 minute ke andar 3 se zyada baar crash ho
// to auto-recovery रोक dete hain (taaki baar-baar crash karne waala issue
// CPU/disk ko hammer na kare) — us case mein manual restart chahiye hoga,
// jo pehle se bhi zaroori tha.
const RENDERER_RECOVERABLE_REASONS = ['crashed', 'oom', 'abnormal-exit', 'launch-failed', 'integrity-failure'];
const RENDERER_RECOVERY_WINDOW_MS  = 60 * 1000;
const MAX_RENDERER_RECOVERY_ATTEMPTS = 3;
let rendererRecoveryWindowStart = 0;
let rendererRecoveryAttempts    = 0;

app.on('render-process-gone', (_e, _webContents, details) => {
  logger.logError('render-process-gone', JSON.stringify(details));

  if (!RENDERER_RECOVERABLE_REASONS.includes(details.reason)) {
    logger.logInfo('render-process-gone', `Reason "${details.reason}" recoverable list mein nahi — auto-recreate skip.`);
    return;
  }

  const now = Date.now();
  if (now - rendererRecoveryWindowStart > RENDERER_RECOVERY_WINDOW_MS) {
    rendererRecoveryWindowStart = now;
    rendererRecoveryAttempts = 0;
  }
  rendererRecoveryAttempts++;

  if (rendererRecoveryAttempts > MAX_RENDERER_RECOVERY_ATTEMPTS) {
    logger.logError('render-process-gone', `${MAX_RENDERER_RECOVERY_ATTEMPTS} auto-recovery attempts 1 minute ke andar ho chuke — crash-loop lag raha hai, ab ruk rahe hain. Manual restart chahiye hoga.`);
    return;
  }

  logger.logInfo('render-process-gone', `Auto-recovery attempt ${rendererRecoveryAttempts}/${MAX_RENDERER_RECOVERY_ATTEMPTS} — window recreate ho raha hai.`);

  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  } catch (e) {
    logger.logError('render-process-gone', `Purana window destroy karte waqt error: ${e.message}`);
  }
  mainWindow = null;

  try {
    createWindow();
  } catch (e) {
    logger.logError('render-process-gone', `Recovery ke dauran createWindow() fail: ${e.message}`);
  }
});

app.on('child-process-gone', (_e, details) => {
  logger.logError('child-process-gone', JSON.stringify(details));
});
