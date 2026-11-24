// VVSM desktop client (Electron) — wraps the customer portal in a native window with tray support.
// Build:  cd apps/desktop && npm install && npm run dist
const { app, BrowserWindow, Menu, Tray, shell, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
  } catch {
    return {};
  }
}
const cfg = readConfig();
const BASE = (process.env.VVSM_URL || cfg.url || "https://vvsm.online").replace(/\/$/, "");
let win;
let tray;

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 380,
    minHeight: 560,
    title: "VVSM",
    backgroundColor: "#0a0f1f",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.loadURL(`${BASE}/portal`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(BASE)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  // deep links like hiddify://, v2rayng:// are handed to the OS so the VPN client opens
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(BASE) && !url.startsWith("http")) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  win.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      win.hide();
    }
  });
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on("second-instance", () => {
    if (win) {
      win.show();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    createWindow();
    try {
      const img = nativeImage.createFromPath(path.join(__dirname, "icon.png"));
      tray = new Tray(img.resize({ width: 18, height: 18 }));
      tray.setToolTip("VVSM");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "Open VVSM", click: () => win.show() },
          { label: "Renew subscription", click: () => { win.show(); win.loadURL(`${BASE}/portal`); } },
          { label: "Apps & downloads", click: () => { win.show(); win.loadURL(`${BASE}/apps`); } },
          { type: "separator" },
          { label: "Quit", click: () => { app.isQuiting = true; app.quit(); } },
        ])
      );
      tray.on("click", () => win.show());
    } catch {}
  });
  app.on("window-all-closed", () => {});
}
