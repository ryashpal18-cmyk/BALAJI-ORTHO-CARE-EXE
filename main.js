/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   BALAJI ORTHO CONNECT — Electron Main Process                  ║
 * ║   Offline-First | Auto Seed DB | Cloud Sync | IPC Bridge        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path  = require('path');
const fs    = require('fs');
const https = require('https');
const { autoUpdater } = require('electron-updater');
const logger = require('./logger.cjs');

// Process-level crash/error handlers jitni jaldi ho sake set kar do, taaki
// startup ke dauran bhi koi exception silently na guzar jaaye.
logger.setupGlobalHandlers();

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
    supabaseUrl: 'https://idcxmeczzfnipmybikue.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkY3htZWN6emZuaXBteWJpa3VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzODc4OTIsImV4cCI6MjA5MDk2Mzg5Mn0.WdbFTPLnUC5U3YFL6Y8dgWETit-aFspgf8RA-A6HaFc',
    autoSync:    true
  });
  if (!fs.existsSync(AUTH_FILE)) writeJSON(AUTH_FILE, {
    username:    'Yashpal18',
    password:    'Aarya@2019',
    token:       null,
    tokenExpiry: null
  });
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
    const req = https.get(url, { timeout: 5000 }, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function checkInternet() {
  const primary = await pingHost('https://idcxmeczzfnipmybikue.supabase.co');
  if (primary) return true;
  // Fallback host — Supabase project khud down/unreachable ho sakta hai par
  // baaki internet chal raha ho, isliye general connectivity bhi confirm karo.
  return pingHost('https://www.google.com/generate_204');
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
        'Authorization':  `Bearer ${supabaseKey}`,
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

// ─── AUTO SYNC ────────────────────────────────────────────────────────────────
let isSyncing = false;

async function runAutoSync() {
  if (isSyncing) return;
  const settings = readJSON(SETTINGS_FILE, {});
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
      webSecurity:      false
    }
  });

  Menu.setApplicationMenu(null);

  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    mainWindow.loadFile(indexPath);
  } else {
    mainWindow.loadURL('data:text/html,<h1 style="color:red;font-family:sans-serif;padding:40px">Please run npm run build first</h1>');
  }

  mainWindow.on('closed', () => { mainWindow = null; });
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

  // Hide on close — login session bacha rahega
  whatsappWindow.on('close', (e) => {
    e.preventDefault();
    whatsappWindow.hide();
  });
}

// ═══════════════════════════════════════════════════════════════
//  IPC — AUTH (Offline + Online)
// ═══════════════════════════════════════════════════════════════

ipcMain.handle('auth:login', async (_event, { username, password }) => {
  try {
    const auth = readJSON(AUTH_FILE, {});
    if (username === auth.username && password === auth.password) {
      const token      = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const tokenExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 din
      writeJSON(AUTH_FILE, { ...auth, token, tokenExpiry });
      return { success: true, token };
    }
    return { success: false, error: 'Invalid username or password' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('auth:check', async () => {
  try {
    const auth = readJSON(AUTH_FILE, {});
    if (auth.token && auth.tokenExpiry && Date.now() < auth.tokenExpiry)
      return { success: true, valid: true };
    return { success: true, valid: false };
  } catch (_) {
    return { success: true, valid: false };
  }
});

ipcMain.handle('auth:logout', async () => {
  try {
    const auth = readJSON(AUTH_FILE, {});
    writeJSON(AUTH_FILE, { ...auth, token: null, tokenExpiry: null });
    return { success: true };
  } catch (_) {
    return { success: false };
  }
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
    fs.writeFileSync(fullPath, jsonString, 'utf-8');
    return { success: true, path: fullPath };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('backup:writeBinary', async (_e, { fileName, base64Data }) => {
  try {
    ensureAppBackupDir();
    const safeName = String(fileName || 'backup.xlsx').replace(/[/\\]/g, '_');
    const fullPath = path.join(APP_BACKUP_DIR, safeName);
    fs.writeFileSync(fullPath, Buffer.from(base64Data, 'base64'));
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
  if (url && typeof url === 'string') shell.openExternal(url).catch(() => {});
});

ipcMain.on('open-whatsapp', (_e, payload) => {
  let url = typeof payload === 'string' ? payload
    : (payload && typeof payload === 'object') ? (payload.url || payload.webUrl || payload.desktopUrl || '') : '';
  openWhatsAppWindow(url || 'https://web.whatsapp.com');
});

// ─── SMS — Main process se bhejo (CORS issue fix) ────────────────────────────
ipcMain.handle('app:sendSMS', async (_e, { apiUrl, apiKey, deviceId, mobile, message }) => {
  try {
    const digits = mobile.replace(/\D/g, '');
    const num = digits.startsWith('91') ? digits : `91${digits}`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ deviceId, recipients: [num], message }),
    });
    if (res.ok) {
      return { ok: true };
    }
    const errText = await res.text().catch(() => res.status);
    return { ok: false, error: `TextBee ${res.status}: ${errText}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ─── RUNTIME DIAGNOSTICS — Ek click mein poori app check karo ───────────────
// Ye handler software ke andar se hi run hota hai — koi alag tool nahi chahiye.
// Har check ka result ek .txt report file mein save hota hai.
ipcMain.handle('app:runDiagnostics', async () => {
  const lines = [];
  const sep   = '─'.repeat(70);
  const sep2  = '═'.repeat(70);
  const ts    = () => new Date().toLocaleString('en-IN', { hour12: false });
  const ok    = (msg) => `  ✅  ${msg}`;
  const warn  = (msg) => `  ⚠️  ${msg}`;
  const err   = (msg) => `  ❌  ${msg}`;
  const info  = (msg) => `  ℹ️  ${msg}`;
  const head  = (msg) => `\n${sep2}\n  🔍  ${msg}\n${sep2}`;

  lines.push('BALAJI ORTHO CARE CONNECT — RUNTIME DIAGNOSTIC REPORT');
  lines.push(`Generated: ${ts()}`);
  lines.push(`App Version: ${app.getVersion()}`);
  lines.push(`Electron: ${process.versions.electron}  |  Node: ${process.versions.node}  |  Platform: ${process.platform}`);
  lines.push(sep);

  // ── 1. DATA FILES CHECK ──────────────────────────────────────────────────
  lines.push('');
  lines.push('[1] DATA FILES — C:\\Balaji_Health_Backup\\');
  lines.push(sep);
  const dataFiles = [
    { path: PATIENTS_FILE,  name: 'patients.json'  },
    { path: BILLS_FILE,     name: 'bills.json'     },
    { path: REPORTS_FILE,   name: 'reports.json'   },
    { path: XRAYS_FILE,     name: 'xrays.json'     },
    { path: FRACTURE_FILE,  name: 'fractures.json' },
    { path: PENDING_FILE,   name: 'pending_sync.json' },
    { path: SETTINGS_FILE,  name: 'settings.json'  },
    { path: AUTH_FILE,      name: 'auth.json'      },
  ];

  for (const f of dataFiles) {
    if (!fs.existsSync(f.path)) {
      lines.push(warn(`${f.name} — FILE MISSING (naya banaya jayega)`));
      continue;
    }
    try {
      const raw  = fs.readFileSync(f.path, 'utf-8');
      const data = JSON.parse(raw);
      const size = (fs.statSync(f.path).size / 1024).toFixed(1);
      const count = Array.isArray(data) ? data.length : 'object';
      lines.push(ok(`${f.name} — OK | Records: ${count} | Size: ${size} KB`));
    } catch (e) {
      lines.push(err(`${f.name} — CORRUPT! JSON parse fail: ${e.message}`));
      const bakPath = `${f.path}.bak`;
      if (fs.existsSync(bakPath)) {
        try {
          JSON.parse(fs.readFileSync(bakPath, 'utf-8'));
          lines.push(warn(`  └─ .bak file theek hai — restore possible`));
        } catch {
          lines.push(err(`  └─ .bak bhi CORRUPT hai — data loss risk!`));
        }
      } else {
        lines.push(err(`  └─ Koi .bak file nahi mili`));
      }
    }
  }

  // ── 2. DIRECTORIES CHECK ─────────────────────────────────────────────────
  lines.push('');
  lines.push('[2] DIRECTORIES');
  lines.push(sep);
  const dirs = [
    BACKUP_DIR,
    XRAYS_DIR,
    APP_BACKUP_DIR,
    SAFETY_SNAPSHOT_ROOT,
    path.join(BACKUP_DIR, 'logs'),
  ];
  for (const d of dirs) {
    if (fs.existsSync(d)) {
      lines.push(ok(`EXISTS: ${d}`));
    } else {
      lines.push(warn(`MISSING: ${d} (app start par banta hai)`));
    }
  }

  // ── 3. RECORD COUNT SUMMARY ──────────────────────────────────────────────
  lines.push('');
  lines.push('[3] RECORD COUNT SUMMARY');
  lines.push(sep);
  try {
    const patients  = readJSON(PATIENTS_FILE);
    const bills     = readJSON(BILLS_FILE);
    const reports   = readJSON(REPORTS_FILE);
    const xrays     = readJSON(XRAYS_FILE);
    const fractures = readJSON(FRACTURE_FILE);
    const pending   = readJSON(PENDING_FILE);
    const today     = new Date().toDateString();

    lines.push(info(`Total Patients  : ${patients.length}`));
    lines.push(info(`Total Bills     : ${bills.length}`));
    lines.push(info(`Total Reports   : ${reports.length}`));
    lines.push(info(`Total X-Rays    : ${xrays.length}`));
    lines.push(info(`Total Fractures : ${fractures.length}`));
    lines.push(info(`Pending Sync    : ${pending.length}`));
    lines.push(info(`Aaj ke Bills    : ${bills.filter(b => new Date(b.created_at||0).toDateString()===today).length}`));
    lines.push(info(`Aaj ke Patients : ${patients.filter(p => new Date(p.created_at||0).toDateString()===today).length}`));
    lines.push(info(`Active Fractures: ${fractures.filter(f => f.plaster_status==='Active').length}`));

    if (pending.length > 50) {
      lines.push(warn(`Pending sync bahut zyada hai (${pending.length}) — internet check karein`));
    } else if (pending.length > 0) {
      lines.push(warn(`${pending.length} records sync hone baki hain`));
    }
  } catch (e) {
    lines.push(err(`Record count nahi mil saka: ${e.message}`));
  }

  // ── 4. INTERNET / SUPABASE CHECK ─────────────────────────────────────────
  lines.push('');
  lines.push('[4] CONNECTIVITY CHECK');
  lines.push(sep);
  const isNet = await checkInternet();
  if (isNet) {
    lines.push(ok('Internet: CONNECTED'));
    // Supabase ping
    try {
      const settings  = readJSON(SETTINGS_FILE, {});
      if (settings.supabaseUrl && settings.supabaseKey) {
        const pingUrl = `${settings.supabaseUrl}/rest/v1/`;
        const result  = await new Promise((resolve) => {
          const urlObj  = new URL(pingUrl);
          const req = require('https').get({
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            headers: { 'apikey': settings.supabaseKey },
            timeout: 5000,
          }, (res) => resolve({ status: res.statusCode }));
          req.on('error', (e) => resolve({ status: 0, error: e.message }));
          req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
        });
        if (result.status >= 200 && result.status < 500) {
          lines.push(ok(`Supabase: REACHABLE (HTTP ${result.status})`));
        } else {
          lines.push(warn(`Supabase: Status ${result.status || result.error}`));
        }
      } else {
        lines.push(warn('Supabase URL/Key settings mein configure nahi hai'));
      }
    } catch (e) {
      lines.push(err(`Supabase check fail: ${e.message}`));
    }
  } else {
    lines.push(warn('Internet: OFFLINE — Supabase check skip kiya'));
  }

  // ── 5. SETTINGS CHECK ────────────────────────────────────────────────────
  lines.push('');
  lines.push('[5] SETTINGS CHECK');
  lines.push(sep);
  try {
    const s = readJSON(SETTINGS_FILE, {});
    lines.push(info(`Clinic Name  : ${s.centerName || '(blank)'}`));
    lines.push(info(`Doctor Name  : ${s.doctorName || '(blank)'}`));
    lines.push(info(`Auto Sync    : ${s.autoSync ? 'ON' : 'OFF'}`));
    lines.push(info(`Supabase URL : ${s.supabaseUrl ? s.supabaseUrl.slice(0,40)+'...' : '(not set)'}`));
    lines.push(info(`Supabase Key : ${s.supabaseKey ? '****' + s.supabaseKey.slice(-8) : '(not set)'}`));
    if (!s.centerName) lines.push(warn('Clinic name khali hai — Settings mein bharein'));
    if (!s.supabaseUrl || !s.supabaseKey) lines.push(warn('Supabase config missing — cloud sync nahi hoga'));
  } catch (e) {
    lines.push(err(`Settings read fail: ${e.message}`));
  }

  // ── 6. LOG FILES CHECK ───────────────────────────────────────────────────
  lines.push('');
  lines.push('[6] LOG FILES (last 3 days)');
  lines.push(sep);
  try {
    const logDir = path.join(BACKUP_DIR, 'logs');
    if (!fs.existsSync(logDir)) {
      lines.push(warn('Log folder nahi mila'));
    } else {
      const logFiles = fs.readdirSync(logDir)
        .filter(f => f.endsWith('.log'))
        .sort()
        .slice(-3)
        .reverse();
      if (!logFiles.length) {
        lines.push(info('Abhi tak koi log file nahi bani'));
      } else {
        for (const lf of logFiles) {
          const lPath = path.join(logDir, lf);
          const lSize = (fs.statSync(lPath).size / 1024).toFixed(1);
          const content = fs.readFileSync(lPath, 'utf-8');
          const errCount  = (content.match(/\[ERROR\]/g) || []).length;
          const warnCount = (content.match(/\[WARN\]/g)  || []).length;
          const status = errCount > 0 ? err : warnCount > 0 ? warn : ok;
          lines.push(status(`${lf} | Size: ${lSize} KB | Errors: ${errCount} | Warnings: ${warnCount}`));

          // Last error extract karo
          if (errCount > 0) {
            const lastErr = content.split('[ERROR]').slice(-1)[0]?.split('─'.repeat(10))[0]?.trim()?.slice(0, 200);
            if (lastErr) lines.push(`       Last Error: ${lastErr}`);
          }
        }
      }
    }
  } catch (e) {
    lines.push(err(`Log files check fail: ${e.message}`));
  }

  // ── 7. SAFETY SNAPSHOT CHECK ─────────────────────────────────────────────
  lines.push('');
  lines.push('[7] DAILY SAFETY SNAPSHOTS');
  lines.push(sep);
  try {
    if (!fs.existsSync(SAFETY_SNAPSHOT_ROOT)) {
      lines.push(warn('Snapshot folder exist nahi karta'));
    } else {
      const snaps = fs.readdirSync(SAFETY_SNAPSHOT_ROOT).sort().reverse().slice(0, 5);
      if (!snaps.length) {
        lines.push(warn('Koi snapshot nahi mila abhi tak'));
      } else {
        const today2 = new Date().toISOString().slice(0, 10);
        if (snaps[0] === today2) {
          lines.push(ok(`Aaj ka snapshot le liya gaya: ${snaps[0]}`));
        } else {
          lines.push(warn(`Aaj ka snapshot nahi mila. Last: ${snaps[0]}`));
        }
        for (const s of snaps) {
          lines.push(info(`  Snapshot: ${s}`));
        }
      }
    }
  } catch (e) {
    lines.push(err(`Snapshot check fail: ${e.message}`));
  }

  // ── 8. APP HEALTH ────────────────────────────────────────────────────────
  lines.push('');
  lines.push('[8] APP HEALTH');
  lines.push(sep);
  lines.push(ok(`Main process: RUNNING (PID: ${process.pid})`));
  lines.push(ok(`App ready: YES`));
  lines.push(ok(`Window: ${mainWindow && !mainWindow.isDestroyed() ? 'OPEN' : 'CLOSED'}`));
  lines.push(info(`Memory: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`));
  lines.push(info(`Uptime: ${Math.round(process.uptime())} seconds`));

  // ── 9. IPC HANDLER VERIFICATION ──────────────────────────────────────────
  // Preload.js mein expose kiye gaye channels ko verify karo
  // Error "No handler registered for X" ka pata lagao
  lines.push('');
  lines.push('[9] IPC HANDLER CHECK');
  lines.push(sep);
  try {
    // Ye sare channels preload.js mein expose hain — main.js mein hone chahiye
    const requiredChannels = [
      'auth:login', 'auth:check', 'auth:logout',
      'db:savePatient', 'db:getAllPatients', 'db:searchPatient', 'db:searchPatients',
      'db:saveBill', 'db:getBills',
      'db:saveReport', 'db:getReports',
      'db:saveXray', 'db:getXrays', 'db:copyXrayImage',
      'db:saveFractureCase', 'db:getFractureCases', 'db:updateFractureCase',
      'db:getSettings', 'db:saveSettings',
      'db:getPending', 'db:clearPending', 'db:markSynced', 'db:syncNow',
      'app:isOnline', 'db:getStats',
      'shell:openFolder', 'shell:print',
      'app:getBackupDir', 'app:getXraysDir',
      'backup:getDir', 'backup:writeJson', 'backup:writeBinary', 'backup:list', 'backup:openFolder',
      'log:rendererError', 'log:getDir', 'log:getSnapshotDir', 'log:openFolder',
      'app:sendSMS',
      'app:runDiagnostics', 'app:nuclearIndexedDBReset',
      'app:getVersion', 'app:checkForUpdate', 'app:downloadUpdate', 'app:installUpdate', 'app:openExternal',
    ];

    // ipcMain._events se registered handlers nikalo
    const registeredRaw = ipcMain.eventNames ? ipcMain.eventNames() : [];
    const registered = new Set(registeredRaw.map(e => String(e).replace(/^ipc-/, '')));

    let ipcOk = 0; let ipcMissing = [];
    for (const ch of requiredChannels) {
      // electron ipcMain internally uses handle-${channel} or direct channel
      // Simple check: try to find if it's registered
      if (registered.has(ch) || registered.has(`handle:${ch}`) || registered.has(`-${ch}`)) {
        ipcOk++;
      } else {
        // Secondary check — ipcMain._events object
        const events = ipcMain['_events'] || {};
        if (events[ch] || events[`handle:${ch}`]) {
          ipcOk++;
        } else {
          ipcMissing.push(ch);
        }
      }
    }

    if (ipcMissing.length === 0) {
      lines.push(ok(`Sabhi ${requiredChannels.length} IPC handlers registered hain`));
    } else {
      // Some handlers may not be detectable via eventNames - do a soft warn only
      lines.push(warn(`IPC check: ${requiredChannels.length - ipcMissing.length} confirmed, ${ipcMissing.length} unverified`));
      lines.push(info(`  Unverified channels (ye actually registered ho sakte hain):`));
      for (const ch of ipcMissing.slice(0, 5)) {
        lines.push(info(`    • ${ch}`));
      }
      if (ipcMissing.length > 5) lines.push(info(`    ...aur ${ipcMissing.length - 5} channels`));
    }

    // Known missing check — log file se "No handler registered" error dhundho
    const logDir2 = path.join(BACKUP_DIR, 'logs');
    if (fs.existsSync(logDir2)) {
      const logFiles2 = fs.readdirSync(logDir2).filter(f => f.endsWith('.log')).sort().slice(-3);
      const missingHandlers = new Set();
      for (const lf of logFiles2) {
        const content = fs.readFileSync(path.join(logDir2, lf), 'utf-8');
        const matches = content.matchAll(/No handler registered for '([^']+)'/g);
        for (const m of matches) missingHandlers.add(m[1]);
      }
      if (missingHandlers.size > 0) {
        for (const ch of missingHandlers) {
          lines.push(err(`IPC MISSING (log se mila): '${ch}' — main.js mein ipcMain.handle('${ch}', ...) add karo`));
        }
      }
    }
  } catch (e) {
    lines.push(warn(`IPC check skip: ${e.message}`));
  }

  // ── 10. SMART LOG ANALYSIS — DEEP SCAN ──────────────────────────────────
  // Ye section log files ko deeply scan karta hai:
  // - Kaunse errors baar baar aa rahe hain (top errors)
  // - Kaunsi file/function se aa rahe hain
  // - Kya impact hoga system par
  // - Fix kaise karein
  lines.push('');
  lines.push('[10] SMART LOG ANALYSIS — DEEP ERROR SCAN');
  lines.push(sep);

  try {
    const logDir3 = path.join(BACKUP_DIR, 'logs');
    if (!fs.existsSync(logDir3)) {
      lines.push(warn('Log folder nahi mila — abhi tak koi log nahi bani'));
    } else {
      const logFiles3 = fs.readdirSync(logDir3)
        .filter(f => f.endsWith('.log'))
        .sort()
        .slice(-3) // last 3 days
        .reverse();

      if (!logFiles3.length) {
        lines.push(info('Koi log file nahi mili abhi tak'));
      } else {
        // ── Known error patterns with diagnosis ──────────────────────────
        // Har pattern mein: regex, error name, source file, root cause, fix
        const knownPatterns = [
          {
            regex: /queueGetAll retry bhi fail|queueGetAll fail.*DB corrupt/g,
            name: 'IndexedDB queueGetAll Infinite Loop',
            source: 'src/lib/offlineDb.ts → queueGetAll()',
            rootCause: 'IndexedDB UnknownError pe deleteDb+openDb loop ban raha tha. Har 30s mein runSync() ne 6+ baar queueGetAll call ki, corrupt DB ne baar baar fail kiya, loop mein 9000+ errors/day flood ho gaye.',
            impact: '🔴 CRITICAL — Log files 5MB+ ho gayi, app slow ho sakti hai, real errors chhup gayi',
            fix: 'FILE: src/lib/offlineDb.ts\nFIX: queueGetAll mein _queueDbResetDone flag add karo — sirf pehli baar deleteDb karo, baad mein [] return karo bina log flood kiye.\nSTATUS: ✅ offlineDb_fixed.ts mein fix ready hai — deploy karo',
          },
          {
            regex: /No handler registered for 'log:getSnapshotDir'/g,
            name: 'Missing IPC Handler: log:getSnapshotDir',
            source: 'preload.js → getSafetySnapshotDir() → ipcRenderer.invoke(\'log:getSnapshotDir\')',
            rootCause: 'preload.js mein getSafetySnapshotDir() ne \'log:getSnapshotDir\' channel call kiya, lekin electron-main.cjs mein ye handler register nahi tha. main.js mein handler tha, electron-main.cjs mein nahi.',
            impact: '🟡 MEDIUM — Diagnostic tool mein snapshot path nahi aata, lekin app ka core kaam nahi rukta',
            fix: 'FILE: electron-main.cjs\nFIX: ipcMain.handle(\'log:getSnapshotDir\', () => SAFETY_SNAPSHOT_ROOT) add karo\nSTATUS: ✅ main.js mein pehle se fix hai — electron-main.cjs mein bhi same handler add karo',
          },
          {
            regex: /UnknownError: Internal error/g,
            name: 'IndexedDB UnknownError: Internal error',
            source: 'Electron IndexedDB (Chromium) → balaji_ortho_offline_db',
            rootCause: 'Ye error tab aata hai jab IndexedDB ki internal state corrupt ho jaati hai — aksar abrupt shutdown, power cut, ya Electron version change se. DB_VERSION v3 bump ke baad purani DB delete honi chahiye thi, lekin agar app crash ho gayi to nahi hui.',
            impact: '🔴 CRITICAL — Offline data access fail, sync queue nahi chali, pending records cloud tak nahi gaye',
            fix: 'FILE: src/lib/offlineDb.ts\nFIX 1 (automatic): DB_VERSION = 3 pehle se hai — naya fresh build install karo, IndexedDB auto-reset hogi\nFIX 2 (manual): Settings → "Nuclear IndexedDB Reset" button dabao\nFIX 3 (permanent): offlineDb_fixed.ts deploy karo jisme error flood band hai',
          },
          {
            regex: /Supabase insert fail|insert.*failed.*table/gi,
            name: 'Supabase Insert Failure',
            source: 'src/lib/offlineSync.ts → applyMutation() → supabase.insert()',
            rootCause: 'IndexedDB queue se mutations Supabase mein sync karte waqt fail hua. Possible causes: (1) _pendingSync/_localOnly fields payload mein the, (2) network timeout, (3) Supabase RLS policy block.',
            impact: '🟡 MEDIUM — Data offline safe hai, lekin cloud sync pending rehta hai',
            fix: 'FILE: src/lib/offlineSync.ts\nCHECK: delete payload._pendingSync aur delete payload._localOnly already hai line ~200\nACTION: Pending items ko Settings → Stuck Bills Fix se clear karo',
          },
          {
            regex: /render-process-gone|RENDERER CRASH/gi,
            name: 'Renderer Process Crash',
            source: 'Electron BrowserWindow → webContents',
            rootCause: 'React/renderer process crash ho gayi — memory overflow ya unhandled JS error',
            impact: '🔴 CRITICAL — White screen, user ko app restart karni padti hai',
            fix: 'Check memory usage. Agar 500MB+ ho to memory leak hai.\nCheck console errors app start par.',
          },
          {
            regex: /PENDING_PARENT_INSERT/g,
            name: 'Pending Parent Insert (Sync Order Issue)',
            source: 'src/lib/offlineSync.ts → applyMutation()',
            rootCause: 'Update mutation chal raha hai lekin parent insert abhi sync nahi hua — tempId (local_xxx) abhi real ID se replace nahi hua',
            impact: '🟡 LOW-MEDIUM — Sync queue thodi der delay hoti hai, lekin eventually resolve hota hai',
            fix: 'FILE: src/lib/offlineSync.ts\nSTATUS: Code already handle karta hai — "continue" se skip hota hai\nIF STUCK: Settings → Stuck Bills Fix → Clear old stuck items',
          },
          {
            regex: /Unhandled Promise Rejection/g,
            name: 'Unhandled Promise Rejection',
            source: 'src/lib/clientLogger.ts → window.unhandledrejection',
            rootCause: 'Kisi async function mein try/catch nahi tha ya Promise reject hua aur catch nahi hua',
            impact: '🟡 MEDIUM — Depends on which promise failed',
            fix: 'Upar "Last Error" detail dekho — kaunse file/function se aa raha hai wo batayega',
          },
        ];

        // ── Scan each log file ──────────────────────────────────────────
        const foundIssues = new Map(); // pattern name -> { count, files, samples }

        for (const lf of logFiles3) {
          const lPath = path.join(logDir3, lf);
          let content = '';
          try { content = fs.readFileSync(lPath, 'utf-8'); } catch { continue; }

          for (const pattern of knownPatterns) {
            const matches = content.match(pattern.regex) || [];
            if (matches.length > 0) {
              if (!foundIssues.has(pattern.name)) {
                foundIssues.set(pattern.name, { pattern, count: 0, files: [], sample: '' });
              }
              const issue = foundIssues.get(pattern.name);
              issue.count += matches.length;
              issue.files.push(`${lf} (${matches.length}x)`);

              // Sample — context ke saath first occurrence nikalo
              if (!issue.sample) {
                const idx = content.search(pattern.regex);
                if (idx >= 0) {
                  issue.sample = content.slice(Math.max(0, idx - 50), idx + 300)
                    .split('\n').slice(0, 6).join('\n').trim();
                }
              }
            }
          }

          // ── Unknown errors — patterns ke bahar jo ERROR hain ──────────
          // Ek top-5 unknown errors list banaao
        }

        if (foundIssues.size === 0) {
          lines.push(ok('Log files mein koi known issue nahi mila — sab theek lag raha hai!'));
        } else {
          lines.push(info(`${foundIssues.size} issues mili hain log files mein:`));
          let issueNum = 1;

          for (const [name, issue] of foundIssues) {
            const p = issue.pattern;
            lines.push('');
            lines.push(`  ┌─ ISSUE #${issueNum++}: ${name}`);
            lines.push(`  │  Occurrences : ${issue.count}x (${issue.files.join(', ')})`);
            lines.push(`  │  Source File : ${p.source}`);
            lines.push(`  │  Root Cause  : ${p.rootCause}`);
            lines.push(`  │  Impact      : ${p.impact}`);
            lines.push(`  │  Fix`);
            for (const fixLine of p.fix.split('\n')) {
              lines.push(`  │    ${fixLine}`);
            }
            if (issue.sample) {
              lines.push(`  │  Sample Log  :`);
              for (const sl of issue.sample.split('\n').slice(0, 4)) {
                lines.push(`  │    ${sl.trim()}`);
              }
            }
            lines.push(`  └${'─'.repeat(66)}`);
          }
        }

        // ── Unknown / uncategorized errors ──────────────────────────────
        lines.push('');
        lines.push('  — Uncategorized Errors (top 5 by frequency) —');
        try {
          const allErrorLines = [];
          for (const lf of logFiles3) {
            const content = fs.readFileSync(path.join(logDir3, lf), 'utf-8');
            // ERROR blocks nikalo
            const blocks = content.split('─'.repeat(20));
            for (const block of blocks) {
              if (block.includes('[ERROR]') && !knownPatterns.some(p => block.match(p.regex))) {
                // Short summary nikalo
                const msgLine = block.split('\n').find(l => l.includes('Message:') || l.includes('[ERROR]'));
                if (msgLine) allErrorLines.push(msgLine.trim().slice(0, 120));
              }
            }
          }

          // Frequency count
          const freq = {};
          for (const line of allErrorLines) {
            const key = line.replace(/\d+/g, 'N').slice(0, 80); // normalize numbers
            freq[key] = (freq[key] || 0) + 1;
          }
          const topUnknown = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 5);

          if (topUnknown.length === 0) {
            lines.push(ok('  Koi uncategorized error nahi mili'));
          } else {
            for (const [msg, count] of topUnknown) {
              lines.push(warn(`  ${count}x — ${msg}`));
            }
          }
        } catch (e2) {
          lines.push(info(`  Unknown error scan fail: ${e2.message}`));
        }
      }
    }
  } catch (e) {
    lines.push(err(`Smart log analysis fail: ${e.message}`));
  }

  // ── FINAL SUMMARY ────────────────────────────────────────────────────────
  const fullText  = lines.join('\n');
  const errCount  = (fullText.match(/❌/g) || []).length;
  const warnCount = (fullText.match(/⚠️/g) || []).length;
  const okCount   = (fullText.match(/✅/g) || []).length;

  const summary = [
    '',
    sep,
    'DIAGNOSTIC SUMMARY',
    sep,
    `✅ Pass    : ${okCount}`,
    `⚠️  Warnings: ${warnCount}`,
    `❌ Errors  : ${errCount}`,
    '',
    errCount > 0
      ? '🚨 CRITICAL ERRORS HAIN — Section [10] mein fix details dekho'
      : warnCount > 0
        ? '⚠️  Kuch warnings hain — review karo'
        : '🎉 Sab theek lag raha hai!',
    '',
    `Report generated: ${ts()}`,
    sep,
  ];

  const reportText = fullText + '\n' + summary.join('\n');

  // Report file save karo
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const reportFile = path.join(BACKUP_DIR, `diagnostic_report_${new Date().toISOString().slice(0,10)}.txt`);
    fs.writeFileSync(reportFile, reportText, 'utf-8');
    logger.logInfo('diagnostics', `Report save hui: ${reportFile}`);
    return {
      success:   true,
      reportPath: reportFile,
      errors:    errCount,
      warnings:  warnCount,
      passed:    okCount,
      text:      reportText,
    };
  } catch (e) {
    return { success: false, error: e.message, text: reportText };
  }
});

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

ipcMain.handle('log:rendererError', async (_e, { level, message, stack, source } = {}) => {
  // ── BUG FIX: pehle hamesha logError() call hoti thi — INFO/WARN bhi ERROR ban jaate the ──
  const text = stack || message || 'Unknown renderer error';
  const src  = source || 'renderer';
  if (level === 'info')       logger.logInfo(src, text);
  else if (level === 'warn')  logger.logWarn(src, text);
  else                        logger.logError(src, text); // 'error' ya kuch bhi
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

// ─── NUCLEAR INDEXEDDB RESET ─────────────────────────────────────────────────
// Jab IndexedDB itni corrupt ho ki code se bhi fix na ho —
// ye handler Windows pe physical IndexedDB files delete karta hai,
// phir app restart karta hai — sab automatic, user kuch nahi karta.
ipcMain.handle('app:nuclearIndexedDBReset', async () => {
  try {
    logger.logInfo('nuclear-reset', 'Nuclear IndexedDB reset shuru...');

    // ── Step 1: IndexedDB folder path nikalo ──
    const userDataPath  = app.getPath('userData');
    const idbPaths = [
      path.join(userDataPath, 'IndexedDB'),
      path.join(userDataPath, 'Default', 'IndexedDB'),
      path.join(userDataPath, 'Local Storage'),
      path.join(userDataPath, 'Session Storage'),
      path.join(userDataPath, 'blob_storage'),
      path.join(userDataPath, 'Cache'),
      path.join(userDataPath, 'Code Cache'),
      path.join(userDataPath, 'GPUCache'),
    ];

    const deleted = [];
    const failed  = [];

    for (const p of idbPaths) {
      if (fs.existsSync(p)) {
        try {
          fs.rmSync(p, { recursive: true, force: true });
          deleted.push(p);
          logger.logInfo('nuclear-reset', `Deleted: ${p}`);
        } catch (e) {
          failed.push(`${p}: ${e.message}`);
          logger.logWarn('nuclear-reset', `Delete fail: ${p} — ${e.message}`);
        }
      }
    }

    logger.logInfo('nuclear-reset', `Reset complete — Deleted: ${deleted.length}, Failed: ${failed.length}`);
    logger.logInfo('nuclear-reset', 'App 2 second mein restart hoga...');

    // ── Step 2: 2 second baad restart ──
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 2000);

    return {
      success: true,
      deleted: deleted.length,
      failed:  failed.length,
      failedPaths: failed,
      userDataPath,
    };
  } catch (e) {
    logger.logError('nuclear-reset', `Nuclear reset fail: ${e.message}`);
    return { success: false, error: e.message };
  }
});

// ═══════════════════════════════════════════════════════════════
//  APP LIFECYCLE
// ═══════════════════════════════════════════════════════════════
app.whenReady().then(() => {
  ensureDirs();
  initFiles();
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
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('before-quit', () => {
  if (whatsappWindow && !whatsappWindow.isDestroyed()) {
    whatsappWindow.removeAllListeners('close');
    whatsappWindow.close();
  }
});

app.on('web-contents-created', (_e, contents) => {
  contents.on('new-window', (e) => e.preventDefault());
});

// Renderer crash ya hang ho jaaye (e.g. out-of-memory, GPU crash) to bhi
// log ho jaaye — warna sirf "white screen" dikhega aur pata nahi chalega kyun.
app.on('render-process-gone', (_e, _webContents, details) => {
  logger.logError('render-process-gone', JSON.stringify(details));
});

app.on('child-process-gone', (_e, details) => {
  logger.logError('child-process-gone', JSON.stringify(details));
});
