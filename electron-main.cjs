const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

// ✅ Logger import — logger.cjs same folder me hai
const { logInfo, logWarn, logError, cleanOldLogs, setupGlobalHandlers, getLogDir } = require("./logger.cjs");

let mainWindow;
let whatsappWindow = null;

// ✅ Process-level crashes aur unhandled rejections pakadna
setupGlobalHandlers();

// ✅ IPC: React se error log karna
ipcMain.handle("log:rendererError", (_event, { level, source, message }) => {
  if (level === "warn")       logWarn(source || "renderer", message);
  else if (level === "info")  logInfo(source || "renderer", message);
  else                        logError(source || "renderer", message);
});

// ✅ IPC: Logs folder path dena
ipcMain.handle("log:getDir", () => {
  return getLogDir();
});

// ✅ IPC: Logs folder File Explorer me kholna
ipcMain.handle("log:openFolder", () => {
  shell.openPath(getLogDir());
});

function createWindow() {
  logInfo("main", "App start ho raha hai — window bana raha hai");

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

  // ✅ Renderer crash log karna
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logError("renderer", `Renderer process gone — reason: ${details.reason}, exitCode: ${details.exitCode}`);
  });

  // ✅ Console errors/warnings bhi log hon
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      const lvl = level === 3 ? "error" : "warn";
      if (lvl === "error") logError("console", `${message} (${sourceId}:${line})`);
      else                 logWarn("console",  `${message} (${sourceId}:${line})`);
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.maximize();
    logInfo("main", "Window ready — app visible ho gaya");
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    logInfo("main", "Main window band ho gayi");
    mainWindow = null;
  });
}

// ✅ WhatsApp Window — Ek baar banegi, bar bar reuse hogi
function openWhatsAppWindow(url) {
  if (whatsappWindow && !whatsappWindow.isDestroyed()) {
    whatsappWindow.loadURL(url);
    whatsappWindow.focus();
    return;
  }

  logInfo("main", "WhatsApp window bana raha hai");

  whatsappWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: "WhatsApp Web — Balaji Ortho",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  whatsappWindow.loadURL(url);

  whatsappWindow.on("close", (e) => {
    e.preventDefault();
    whatsappWindow.hide();
  });
}

// ✅ IPC — React se WhatsApp window kholo
ipcMain.on("open-whatsapp", (_event, { url }) => {
  openWhatsAppWindow(url || "https://web.whatsapp.com");
});

app.whenReady().then(() => {
  logInfo("main", `Electron ready — version: ${app.getVersion()}`);
  cleanOldLogs(); // ✅ 14 din purani log files auto-delete
  createWindow();
});

app.on("window-all-closed", () => {
  logInfo("main", "Sab windows band — app quit ho raha hai");
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  logInfo("main", "App band ho raha hai");
  if (whatsappWindow && !whatsappWindow.isDestroyed()) {
    whatsappWindow.removeAllListeners("close");
    whatsappWindow.close();
  }
});
