// CineFTP Desktop — Electron main process.
// Starts the original CineFTP backend locally and opens the original UI in a window.
const { app, BrowserWindow, Menu, shell, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

// A fixed port keeps the app's saved data (localStorage: servers, settings, history)
// on the same origin every launch. Falls back to a random free port if it is busy.
const PREFERRED_PORT = 38417;

// ffmpeg / ffprobe bundled with the installer (resources/bin) -> put them on PATH
// BEFORE the backend loads, because it detects them at startup.
const binDir = app.isPackaged
  ? path.join(process.resourcesPath, 'bin')
  : path.join(__dirname, '..', 'build-bin');
if (fs.existsSync(binDir)) {
  process.env.PATH = binDir + path.delimiter + (process.env.PATH || '');
}
process.env.NODE_ENV = 'production';
process.env.CINEFTP_DIRECT_LAN = '1'; // talk to 172.16.x.x DhakaFlix servers directly

// Optional: GEMINI_API_KEY for the AI assistant. Put it in
// %APPDATA%\CineFTP\.env as:  GEMINI_API_KEY=your_key
try {
  const envFile = path.join(app.getPath('userData'), '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;

async function boot() {
  const distPath = path.join(__dirname, '..', 'dist');
  const { startServer } = require('./server.cjs');

  let port;
  try {
    port = await startServer(distPath, PREFERRED_PORT);
  } catch {
    port = await startServer(distPath, 0);
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#090A0F',
    title: 'CineFTP',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // F11 = fullscreen, Ctrl+R = reload, Ctrl+Shift+I = devtools
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') mainWindow.setFullScreen(!mainWindow.isFullScreen());
    if (input.control && !input.shift && input.key.toLowerCase() === 'r') mainWindow.webContents.reload();
    if (input.control && input.shift && input.key.toLowerCase() === 'i') mainWindow.webContents.toggleDevTools();
  });

  // Links to other websites open in the normal browser, not inside the app.
  const appOrigin = `http://127.0.0.1:${port}`;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(appOrigin)) shell.openExternal(url);
    return { action: url.startsWith(appOrigin) ? 'allow' : 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(appOrigin)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  await mainWindow.loadURL(appOrigin);
  mainWindow.on('closed', () => (mainWindow = null));
  setupAutoUpdate();
}


// ---------------------------------------------------------------------------
// Auto update (GitHub Releases). Checks shortly after start and every 4 hours.
// New version found -> desktop notification + "Update now / Later" box.
// "Update now" downloads it (taskbar progress), installs silently and restarts the app.
// ---------------------------------------------------------------------------
function setupAutoUpdate() {
  if (!app.isPackaged) return; // only the installed app updates itself
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return;
  }
  app.setAppUserModelId('com.cineftp.desktop');
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  let asking = false;
  autoUpdater.on('update-available', (info) => {
    try {
      new Notification({
        title: 'CineFTP update available',
        body: `Version ${info.version} is ready to install.`,
      }).show();
    } catch {}
    if (asking) return;
    asking = true;
    const opts = {
      type: 'info',
      buttons: ['Update now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'CineFTP update',
      message: `A new version of CineFTP (${info.version}) is available.`,
      detail: 'Download and install it now? CineFTP restarts when the update is done.',
    };
    (mainWindow ? dialog.showMessageBox(mainWindow, opts) : dialog.showMessageBox(opts))
      .then((r) => {
        if (r.response === 0) autoUpdater.downloadUpdate().catch(() => {});
        else asking = false;
      })
      .catch(() => {
        asking = false;
      });
  });
  autoUpdater.on('download-progress', (p) => {
    if (mainWindow) mainWindow.setProgressBar(Math.max(0, Math.min(1, (p.percent || 0) / 100)));
  });
  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) mainWindow.setProgressBar(-1);
    autoUpdater.quitAndInstall(true, true); // silent install, then reopen CineFTP
  });
  autoUpdater.on('error', () => {
    asking = false;
    if (mainWindow) mainWindow.setProgressBar(-1);
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 8000);
  setInterval(check, 4 * 60 * 60 * 1000);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  boot().catch((err) => {
    dialog.showErrorBox('CineFTP failed to start', String((err && err.stack) || err));
    app.quit();
  });
});

app.on('window-all-closed', () => app.quit());
