const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const path = require("path");
const fs   = require("fs");

const {
  logInfo, logWarn, logError,
  writeRendererLog,
  cleanOldLogs, setupGlobalHandlers, getLogDir
} = require("./logger.cjs");

let mainWindow;
let whatsappWindow = null;

// ── Process level crashes ─────────────────────────────────────────────────
setupGlobalHandlers();

// ── IPC: React se full formatted log aata hai — seedha file mein likho ──
ipcMain.handle("log:rendererError", (_event, { level, source, message }) => {
  // clientLogger.ts ne already poora format kar diya hai
  // sirf file mein likhna hai
  writeRendererLog(level, source, message);
});

// ── IPC: Logs folder path ─────────────────────────────────────────────────
ipcMain.handle("log:getDir", () => getLogDir());

// ── IPC: Logs folder File Explorer mein kholna ───────────────────────────
ipcMain.handle("log:openFolder", () => shell.openPath(getLogDir()));

// ── IPC: Safety snapshot directory path ──────────────────────────────────
// FIX: preload.js mein getSafetySnapshotDir() ne 'log:getSnapshotDir' call kiya tha
// lekin ye handler electron-main.cjs mein missing tha — 92 errors/session aa rahe the
// Note: app.getPath() app ready hone ke baad call hona chahiye, isliye lazy init use kar rahe hain
let _safetySnapshotRoot = null;
function getSafetySnapshotRoot() {
  if (!_safetySnapshotRoot) {
    try {
      _safetySnapshotRoot = path.join(app.getPath('documents'), 'Balaji_Ortho_Backups', 'safety_snapshots');
    } catch (_) {
      _safetySnapshotRoot = path.join('C:\\Users', 'konicaminolta', 'Documents', 'Balaji_Ortho_Backups', 'safety_snapshots');
    }
  }
  return _safetySnapshotRoot;
}
ipcMain.handle("log:getSnapshotDir", () => {
  const root = getSafetySnapshotRoot();
  try { if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true }); } catch (_) {}
  return root;
});
ipcMain.handle("safety:getSnapshotDir", () => getSafetySnapshotRoot());

function createWindow() {
  logInfo("main", "App start ho raha hai");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Balaji Ortho Care Connect",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, "preload.js"),
    },
    show: false,
    autoHideMenuBar: true,
  });

  const indexPath = path.join(__dirname, "dist", "index.html");
  if (!fs.existsSync(indexPath)) {
    const errMsg = "dist/index.html not found at: " + indexPath;
    logError("main", errMsg);
    dialog.showErrorBox("Error", errMsg);
    app.quit();
    return;
  }

  mainWindow.loadFile(indexPath);

  // ── Renderer crash — full details log karo ───────────────────────────
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logError("renderer",
      `RENDERER CRASH\n    Reason: ${details.reason}\n    Exit Code: ${details.exitCode}`
    );
  });

  // ── Console errors/warnings — file mein log karo ─────────────────────
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level === 3) {
      logError("console", `${message}`, `File: ${sourceId}\n    Line: ${line}`);
    } else if (level === 2) {
      logWarn("console", `${message}`, `File: ${sourceId}\n    Line: ${line}`);
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.maximize();
    logInfo("main", "App window ready — visible ho gayi");
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    logInfo("main", "Window band ho gayi");
    mainWindow = null;
  });
}

function openWhatsAppWindow(url) {
  if (whatsappWindow && !whatsappWindow.isDestroyed()) {
    whatsappWindow.loadURL(url);
    whatsappWindow.focus();
    return;
  }
  whatsappWindow = new BrowserWindow({
    width: 1000, height: 700,
    title: "WhatsApp Web — Balaji Ortho",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  whatsappWindow.loadURL(url);
  whatsappWindow.on("close", (e) => { e.preventDefault(); whatsappWindow.hide(); });
}

ipcMain.on("open-whatsapp", (_event, { url }) => {
  openWhatsAppWindow(url || "https://web.whatsapp.com");
});

app.whenReady().then(() => {
  logInfo("main", `Electron ready — version: ${app.getVersion()}`);
  cleanOldLogs();
  createWindow();
});

app.on("window-all-closed", () => {
  logInfo("main", "App quit ho raha hai");
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  if (whatsappWindow && !whatsappWindow.isDestroyed()) {
    whatsappWindow.removeAllListeners("close");
    whatsappWindow.close();
  }
});
