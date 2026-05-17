const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

let mainWindow;

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

  // ✅ FIX: loadFile use karo - file:// protocol ke liye
  mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  // External links browser mein open honge
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
