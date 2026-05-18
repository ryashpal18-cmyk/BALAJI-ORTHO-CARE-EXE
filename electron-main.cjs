const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;
let whatsappWindow = null; // ✅ Ek hi window reuse hogi

function createWindow() {
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
    dialog.showErrorBox(
      "Error",
      "dist/index.html not found at: " + indexPath
    );
    app.quit();
    return;
  }

  mainWindow.loadFile(indexPath);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ✅ WhatsApp Window — Ek baar banegi, bar bar reuse hogi
function openWhatsAppWindow(url) {
  if (whatsappWindow && !whatsappWindow.isDestroyed()) {
    // Window pehle se hai — sirf URL change karo aur focus karo
    whatsappWindow.loadURL(url);
    whatsappWindow.focus();
    return;
  }

  // Nayi window banao (pehli baar)
  whatsappWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    title: "WhatsApp Web — Balaji Ortho",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // ✅ Updated Chrome user agent — WhatsApp Web chalega
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  whatsappWindow.loadURL(url);

  // ✅ Close karne pe destroy nahi hogi — sirf hide hogi
  whatsappWindow.on("close", (e) => {
    e.preventDefault();
    whatsappWindow.hide();
  });
}

// ✅ IPC — React se message aane pe WhatsApp window kholo
ipcMain.on("open-whatsapp", (_event, { url }) => {
  openWhatsAppWindow(url || "https://web.whatsapp.com");
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { app.quit(); });
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ✅ App quit hone pe WhatsApp window bhi band ho
app.on("before-quit", () => {
  if (whatsappWindow && !whatsappWindow.isDestroyed()) {
    whatsappWindow.removeAllListeners("close");
    whatsappWindow.close();
  }
});
