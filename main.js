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

// ─── APP INFO / DIAGNOSTICS (About tab + crash logging) ──────────────────
ipcMain.handle('app:getVersion', async () => ({
  version:  app.getVersion(),
  electron: process.versions.electron,
  chrome:   process.versions.chrome,
  node:     process.versions.node,
  platform: process.platform,
}));

// ─── UPDATE CHECK (GitHub Releases — manual download, no auto-install) ───────
const UPDATE_REPO = 'ryashpal18-cmyk/BALAJI-ORTHO-CARE-EXE';

function compareVersions(a, b) {
  const pa = a.replace(/^v/i, '').split('.').map(Number);
  const pb = b.replace(/^v/i, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

ipcMain.handle('app:checkForUpdate', async () => {
  try {
    const data = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.github.com',
        path: `/repos/${UPDATE_REPO}/releases/latest`,
        method: 'GET',
        headers: { 'User-Agent': 'BalajiOrthoCare-App' },
      }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });

    const latestVersion = (data.tag_name || '').replace(/^v/i, '');
    const currentVersion = app.getVersion();
    const hasUpdate = latestVersion && compareVersions(latestVersion, currentVersion) > 0;

    // .exe asset dhoondo (NSIS installer) — agar nahi mile to release page hi de do
    const asset = (data.assets || []).find((a) => a.name?.toLowerCase().endsWith('.exe'));

    return {
      success: true,
      hasUpdate: !!hasUpdate,
      currentVersion,
      latestVersion: latestVersion || currentVersion,
      releaseUrl: data.html_url || `https://github.com/${UPDATE_REPO}/releases/latest`,
      downloadUrl: asset?.browser_download_url || data.html_url || '',
      notes: data.body || '',
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('app:openExternal', async (_e, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) await shell.openExternal(url);
  return { success: true };
});

ipcMain.handle('log:rendererError', async (_e, { message, stack, source } = {}) => {
  logger.logError(source || 'renderer', stack || message || 'Unknown renderer error');
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
ipcMain.handle('safety:openSnapshotFolder', async () => {
  ensureAppBackupDir();
  if (!fs.existsSync(SAFETY_SNAPSHOT_ROOT)) fs.mkdirSync(SAFETY_SNAPSHOT_ROOT, { recursive: true });
  shell.openPath(SAFETY_SNAPSHOT_ROOT);
  return { success: true };
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
