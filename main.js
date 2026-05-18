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

// ─── PATHS ────────────────────────────────────────────────────────────────────
const BACKUP_DIR    = 'C:\\Balaji_Health_Backup';
const PATIENTS_FILE = path.join(BACKUP_DIR, 'patients.json');
const BILLS_FILE    = path.join(BACKUP_DIR, 'bills.json');
const REPORTS_FILE  = path.join(BACKUP_DIR, 'reports.json');
const XRAYS_FILE    = path.join(BACKUP_DIR, 'xrays.json');
const PENDING_FILE  = path.join(BACKUP_DIR, 'pending_sync.json');
const SETTINGS_FILE = path.join(BACKUP_DIR, 'settings.json');
const FRACTURE_FILE = path.join(BACKUP_DIR, 'fractures.json'); // 🔥 Fracture Data File
const XRAYS_DIR     = path.join(BACKUP_DIR, 'xray_images');

// Seed file bundled inside the app's resources
const SEED_FILE = path.join(__dirname, 'public', 'patients_seed.json');

// ─── ENSURE DIRECTORIES ───────────────────────────────────────────────────────
function ensureDirs() {
  [BACKUP_DIR, XRAYS_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

// ─── SEED DATABASE ON FIRST RUN ───────────────────────────────────────────────
function seedPatientsOnFirstRun() {
  if (fs.existsSync(PATIENTS_FILE)) return;
  console.log('[SEED] First run detected — loading seed patients…');
  if (fs.existsSync(SEED_FILE)) {
    fs.copyFileSync(SEED_FILE, PATIENTS_FILE);
    console.log('[SEED] ✅ patients_seed.json copied to', PATIENTS_FILE);
  } else {
    fs.writeFileSync(PATIENTS_FILE, JSON.stringify([], null, 2));
    console.log('[SEED] No seed file found — created empty patients.json');
  }
}

// ─── JSON HELPERS ─────────────────────────────────────────────────────────────
function readJSON(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[readJSON] Error:', filePath, e.message);
    return fallback;
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('[writeJSON] Error:', filePath, e.message);
    return false;
  }
}

// ─── INIT ALL JSON FILES ──────────────────────────────────────────────────────
function initFiles() {
  if (!fs.existsSync(BILLS_FILE))    writeJSON(BILLS_FILE,    []);
  if (!fs.existsSync(REPORTS_FILE))  writeJSON(REPORTS_FILE,  []);
  if (!fs.existsSync(XRAYS_FILE))    writeJSON(XRAYS_FILE,    []);
  if (!fs.existsSync(PENDING_FILE))  writeJSON(PENDING_FILE,  []);
  if (!fs.existsSync(FRACTURE_FILE)) writeJSON(FRACTURE_FILE, []); // 🔥 Init Fracture file
  if (!fs.existsSync(SETTINGS_FILE)) writeJSON(SETTINGS_FILE, {
    centerName: 'Balaji Ortho Care Center',
    doctorName: 'Dr. Balaji',
    supabaseUrl: '',
    supabaseKey: '',
    autoSync: true
  });
}

// ─── CREATE WINDOW ────────────────────────────────────────────────────────────
let mainWindow;

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
    mainWindow.loadURL('data:text/html,<h1 style="color:red;font-family:sans-serif;padding:40px">Please run <code>npm run build</code> first, then <code>npm run dist</code></h1>');
  }

  mainWindow.webContents.on('did-finish-load', () => {
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ═══════════════════════════════════════════════════════════════
//  IPC HANDLERS
// ═══════════════════════════════════════════════════════════════

// ── Patient: Save / Update ─────────────────────────────────────
ipcMain.handle('db:savePatient', async (_event, patient) => {
  try {
    const patients = readJSON(PATIENTS_FILE);
    const mobile   = String(patient.mobile || '').replace(/\D/g, '');
    const idx      = patients.findIndex(p => String(p.mobile || '').replace(/\D/g, '') === mobile);

    const entry = {
      ...patient,
      mobile,
      updated_at: new Date().toISOString(),
      synced: false
    };

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
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── Patient: Get All ───────────────────────────────────────────
ipcMain.handle('db:getAllPatients', async () => {
  const patients = readJSON(PATIENTS_FILE);
  return { success: true, data: patients };
});

// ── Patient: Search by mobile ──────────────────────────────────
ipcMain.handle('db:searchPatient', async (_event, query) => {
  const patients = readJSON(PATIENTS_FILE);
  const q = String(query || '').replace(/\D/g, '');
  if (!q) return { success: true, data: null };
  const found = patients.find(p => {
    const pm = String(p.mobile || '').replace(/\D/g, '');
    return pm === q || pm.endsWith(q) || pm.startsWith(q);
  });
  return { success: true, data: found || null };
});

// ── Patient: Search by name or mobile ─────────────────────────
ipcMain.handle('db:searchPatients', async (_event, query) => {
  const patients = readJSON(PATIENTS_FILE);
  const q = String(query || '').toLowerCase();
  if (!q) return { success: true, data: [] };
  const found = patients.filter(p =>
    (p.name  || '').toLowerCase().includes(q) ||
    (p.mobile|| '').includes(q)
  ).slice(0, 20);
  return { success: true, data: found };
});

// ── Bill: Save ─────────────────────────────────────────────────
ipcMain.handle('db:saveBill', async (_event, bill) => {
  try {
    const bills = readJSON(BILLS_FILE);
    const entry = { ...bill, id: `bill_${Date.now()}`, created_at: new Date().toISOString(), synced: false };
    bills.push(entry);
    writeJSON(BILLS_FILE, bills);
    addPending({ type: 'bill', payload: entry });
    return { success: true, data: entry };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── Bill: Get ─────────────────────────────────────────────────
ipcMain.handle('db:getBills', async (_event, mobile) => {
  const bills = readJSON(BILLS_FILE);
  const data  = mobile ? bills.filter(b => String(b.patient_mobile || b.mobile || '').includes(String(mobile))) : bills;
  return { success: true, data };
});

// ── Report: Save ───────────────────────────────────────────────
ipcMain.handle('db:saveReport', async (_event, report) => {
  try {
    const reports = readJSON(REPORTS_FILE);
    const entry   = { ...report, id: `rpt_${Date.now()}`, created_at: new Date().toISOString(), synced: false };
    reports.push(entry);
    writeJSON(REPORTS_FILE, reports);
    return { success: true, data: entry };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── Report: Get ────────────────────────────────────────────────
ipcMain.handle('db:getReports', async (_event, mobile) => {
  const reports = readJSON(REPORTS_FILE);
  const data    = mobile ? reports.filter(r => (r.patient_mobile || '').includes(mobile)) : reports;
  return { success: true, data };
});

// ── X-Ray: Save ────────────────────────────────────────────────
ipcMain.handle('db:saveXray', async (_event, xray) => {
  try {
    const xrays = readJSON(XRAYS_FILE);
    const entry  = { ...xray, id: `xr_${Date.now()}`, created_at: new Date().toISOString(), synced: false };
    xrays.push(entry);
    writeJSON(XRAYS_FILE, xrays);
    addPending({ type: 'xray', payload: entry });
    return { success: true, data: entry };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── X-Ray: Get ─────────────────────────────────────────────────
ipcMain.handle('db:getXrays', async (_event, mobile) => {
  const xrays = readJSON(XRAYS_FILE);
  const data  = mobile ? xrays.filter(x => (x.patient_mobile || '').includes(mobile)) : xrays;
  return { success: true, data };
});

// 🔥 ── Ortho / Fracture: Save ──────────────────────────────────
ipcMain.handle('db:saveFractureCase', async (_event, orthoCase) => {
  try {
    const cases = readJSON(FRACTURE_FILE);
    const entry = { ...orthoCase, id: orthoCase.id || `ortho_${Date.now()}`, created_at: orthoCase.created_at || new Date().toISOString(), synced: false };
    cases.push(entry);
    writeJSON(FRACTURE_FILE, cases);
    addPending({ type: 'ortho', payload: entry });
    return { success: true, data: entry };
  } catch (e) {
    console.error('Save Fracture Error:', e);
    return { success: false, error: e.message };
  }
});

// 🔥 ── Ortho / Fracture: Get ───────────────────────────────────
ipcMain.handle('db:getFractureCases', async () => {
  try {
    const cases = readJSON(FRACTURE_FILE);
    return { success: true, data: cases };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── Copy X-ray image file to backup dir ───────────────────────
ipcMain.handle('db:copyXrayImage', async (_event, srcPath) => {
  try {
    const ext      = path.extname(srcPath);
    const fileName = `xray_${Date.now()}${ext}`;
    const destPath = path.join(XRAYS_DIR, fileName);
    fs.copyFileSync(srcPath, destPath);
    return { success: true, localPath: destPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── Legacy: save-offline-data (backward compatible) ───────────
ipcMain.on('save-offline-data', (_event, fileName, data) => {
  try {
    const filePath = path.join(BACKUP_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[legacy save-offline-data]', e.message);
  }
});

// ── Settings ───────────────────────────────────────────────────
ipcMain.handle('db:getSettings', async () => {
  return { success: true, data: readJSON(SETTINGS_FILE, {}) };
});

ipcMain.handle('db:saveSettings', async (_event, settings) => {
  writeJSON(SETTINGS_FILE, settings);
  return { success: true };
});

// ── Pending Sync Queue ─────────────────────────────────────────
ipcMain.handle('db:getPending', async () => {
  return { success: true, data: readJSON(PENDING_FILE) };
});

ipcMain.handle('db:clearPending', async (_event, ids) => {
  const pending = readJSON(PENDING_FILE);
  const cleared = ids ? pending.filter(p => !ids.includes(p.id)) : [];
  writeJSON(PENDING_FILE, cleared);
  return { success: true };
});

ipcMain.handle('db:markSynced', async (_event, { type, mobile }) => {
  if (type === 'patient' && mobile) {
    const patients = readJSON(PATIENTS_FILE);
    const idx = patients.findIndex(p => String(p.mobile || '') === String(mobile));
    if (idx >= 0) { patients[idx].synced = true; writeJSON(PATIENTS_FILE, patients); }
  }
  return { success: true };
});

// ── Stats for Dashboard ────────────────────────────────────────
ipcMain.handle('db:getStats', async () => {
  const patients  = readJSON(PATIENTS_FILE);
  const bills     = readJSON(BILLS_FILE);
  const reports   = readJSON(REPORTS_FILE);
  const xrays     = readJSON(XRAYS_FILE);
  const fractures = readJSON(FRACTURE_FILE); // 🔥 Fracture count add ho gaya
  const pending   = readJSON(PENDING_FILE);
  const today     = new Date().toDateString();

  return {
    success: true,
    data: {
      totalPatients:  patients.length,
      totalBills:     bills.length,
      totalReports:   reports.length,
      totalXrays:     xrays.length,
      totalFractures: fractures.length, 
      pendingSync:    pending.length,
      todayPatients:  patients.filter(p => new Date(p.created_at || 0).toDateString() === today).length,
      todayBills:     bills.filter(b => new Date(b.created_at || 0).toDateString() === today).length,
    }
  };
});

// ── Open folder ────────────────────────────────────────────────
ipcMain.handle('shell:openFolder', async (_event, folderPath) => {
  shell.openPath(folderPath || BACKUP_DIR);
});

// ── Print ──────────────────────────────────────────────────────
ipcMain.handle('shell:print', async (_event, htmlContent) => {
  const pw = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
  pw.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
  pw.webContents.on('did-finish-load', () => {
    pw.webContents.print({ silent: false, printBackground: true }, () => pw.close());
  });
  return { success: true };
});

// ── Path helpers ───────────────────────────────────────────────
ipcMain.handle('app:getBackupDir', async () => BACKUP_DIR);
ipcMain.handle('app:getXraysDir', async () => XRAYS_DIR);

// ── Open External URL (website, WhatsApp web, etc.) ───────────────────────────
ipcMain.on('open-external-url', (_event, url) => {
  if (url && typeof url === 'string') {
    shell.openExternal(url).catch(e => console.warn('[open-external-url] Error:', e));
  }
});

// ── Open WhatsApp (Desktop or Web fallback) ────────────────────────────────────
ipcMain.on('open-whatsapp', (_event, { desktopUrl, webUrl }) => {
  shell.openExternal(desktopUrl || webUrl).catch(() => {
    if (webUrl) shell.openExternal(webUrl).catch(e => console.warn('[open-whatsapp] Error:', e));
  });
});

// ─── PENDING SYNC HELPER ──────────────────────────────────────────────────────
function addPending(item) {
  const pending = readJSON(PENDING_FILE);
  item.id  = `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  item.ts  = new Date().toISOString();
  pending.push(item);
  // Keep only last 500 items
  if (pending.length > 500) pending.splice(0, pending.length - 500);
  writeJSON(PENDING_FILE, pending);
}

// ═══════════════════════════════════════════════════════════════
//  APP LIFECYCLE
// ═══════════════════════════════════════════════════════════════
app.whenReady().then(() => {
  ensureDirs();
  initFiles();
  seedPatientsOnFirstRun();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Security: Prevent new window creation
app.on('web-contents-created', (_event, contents) => {
  contents.on('new-window', (e) => e.preventDefault());
});
