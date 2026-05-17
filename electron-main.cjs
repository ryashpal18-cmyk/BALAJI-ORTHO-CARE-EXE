const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;

function getIndexPath() {
  // Multiple paths try karo - jo mile wahi use karo
  const candidates = [
    path.join(__dirname, "dist", "index.html"),
    path.join(app.getAppPath(), "dist", "index.html"),
    path.join(process.resourcesPath, "app", "dist", "index.html"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // Fallback
  return candidates[0];
}

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
    },
    show: false,
    autoHideMenuBar: true,
  });

  const indexPath = getIndexPath();
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

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { app.quit(); });
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
