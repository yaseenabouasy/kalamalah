const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  dialog,
  shell,
  ipcMain,
  globalShortcut,
  powerSaveBlocker,
} = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const Store = require('electron-store');
const { Client: DiscordClient } = require('@xhayper/discord-rpc');

/**
 * IMPORTANT: electron-store v9+ is ESM-only and cannot be require()d here.
 * package.json pins ^8.x (CommonJS) for that reason.
 */

const APP_URL = process.env.KALAMALAH_URL || 'https://kalamalah.com';
const ICON_PATH = path.join(__dirname, 'round-logo.png');
const IS_MAC = process.platform === 'darwin';
const DISCORD_CLIENT_ID = process.env.KALAMALAH_DISCORD_CLIENT_ID || '';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const store = new Store({
  name: 'settings',
  defaults: {
    windowBounds: { width: 1200, height: 820 },
    windowMaximized: false,
    discordRPCEnabled: true,
  },
});

// ---------------------------------------------------------------------------
// Logging / updater
// ---------------------------------------------------------------------------
log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow = null;
let tray = null;
let isQuitting = false;
let pendingDeepLink = null;
let powerSaveBlockerId = null;
let mediaKeysRegistered = false;

// ---------------------------------------------------------------------------
// Discord Rich Presence
// ---------------------------------------------------------------------------
let discordRPC = null;
let discordReconnectTimer = null;

function initDiscordRPC() {
  if (!DISCORD_CLIENT_ID) return; // No app id configured -> stay silent
  if (!store.get('discordRPCEnabled')) return;
  if (discordRPC) return;

  try {
    discordRPC = new DiscordClient({ clientId: DISCORD_CLIENT_ID });

    discordRPC.on('ready', () => {
      log.info('Discord RPC connected');
      updateDiscordPresence({ page: 'Main Menu' });
    });

    discordRPC.on('disconnected', () => {
      log.warn('Discord RPC disconnected');
      discordRPC = null;
      scheduleDiscordReconnect();
    });

    discordRPC.login().catch((err) => {
      log.warn('Discord RPC unavailable:', err?.message || err);
      discordRPC = null;
      scheduleDiscordReconnect();
    });
  } catch (err) {
    log.warn('Failed to initialize Discord RPC:', err?.message || err);
    discordRPC = null;
  }
}

function scheduleDiscordReconnect() {
  if (discordReconnectTimer) clearTimeout(discordReconnectTimer);
  discordReconnectTimer = setTimeout(() => {
    if (store.get('discordRPCEnabled')) initDiscordRPC();
  }, 60000);
}

function updateDiscordPresence(details = {}) {
  if (!discordRPC) return;

  const state = details.reciter ? `Reciter: ${details.reciter}` : 'Browsing';
  const detailsText = details.surah
    ? `Surah ${details.surah}`
    : details.page || 'Main Menu';

  try {
    discordRPC.user?.setActivity({
      details: detailsText,
      state,
      largeImageKey: 'kalamalah-logo',
      largeImageText: 'Kalamalah Quran Player',
      smallImageKey: details.playing ? 'play' : 'pause',
      smallImageText: details.playing ? 'Playing' : 'Paused',
      instance: false,
      buttons: [{ label: 'Open Kalamalah', url: 'https://kalamalah.com' }],
    });
  } catch (err) {
    log.warn('Failed to update Discord presence:', err?.message || err);
  }
}

function stopDiscordRPC() {
  if (discordReconnectTimer) {
    clearTimeout(discordReconnectTimer);
    discordReconnectTimer = null;
  }
  try {
    void discordRPC?.destroy()?.catch(() => {});
  } catch {
    /* ignore */
  }
  discordRPC = null;
}

// ---------------------------------------------------------------------------
// Power save blocker
// ---------------------------------------------------------------------------
function enablePowerSaveBlocker() {
  if (powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  }
}

function disablePowerSaveBlocker() {
  if (powerSaveBlockerId !== null) {
    powerSaveBlocker.stop(powerSaveBlockerId);
    powerSaveBlockerId = null;
  }
}

// ---------------------------------------------------------------------------
// Navigation policy: kalamalah.com + subdomains stay in app, everything else
// is handed to the OS default browser.
// ---------------------------------------------------------------------------
function isInternalUrl(rawUrl) {
  try {
    const { protocol, hostname } = new URL(rawUrl);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    return hostname === 'kalamalah.com' || hostname.endsWith('.kalamalah.com');
  } catch {
    return false;
  }
}

function openExternal(rawUrl) {
  try {
    void shell.openExternal(rawUrl);
  } catch (err) {
    log.warn('Failed to open external url:', err?.message || err);
  }
}

function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusMainWindow();
    return;
  }

  const savedBounds = store.get('windowBounds') || {};
  const shouldMaximize = Boolean(store.get('windowMaximized'));

  const windowOptions = {
    width: savedBounds.width || 1200,
    height: savedBounds.height || 820,
    x: savedBounds.x,
    y: savedBounds.y,
    minWidth: 420,
    minHeight: 600,
    icon: ICON_PATH,
    title: 'Kalamalah Player',
    backgroundColor: '#09090b',
    show: false,
    frame: !IS_MAC,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  };

  if (IS_MAC) {
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.trafficLightPosition = { x: 16, y: 16 };
    windowOptions.vibrancy = 'under-window';
    windowOptions.visualEffectState = 'active';
  }

  mainWindow = new BrowserWindow(windowOptions);

  if (shouldMaximize) mainWindow.maximize();

  const persistBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) return;
    store.set('windowBounds', mainWindow.getBounds());
  };

  mainWindow.on('resize', persistBounds);
  mainWindow.on('move', persistBounds);

  mainWindow.on('maximize', () => {
    store.set('windowMaximized', true);
    mainWindow?.webContents.send('window:maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    store.set('windowMaximized', false);
    mainWindow?.webContents.send('window:maximized', false);
  });

  // Close -> hide to tray, except on macOS or when actually quitting.
  mainWindow.on('close', (event) => {
    if (!isQuitting && !IS_MAC && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Keep third-party links out of the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) {
      void mainWindow?.loadURL(url);
    } else {
      openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isInternalUrl(url)) return;
    event.preventDefault();
    openExternal(url);
  });

  // Offline fallback so a dead network does not leave a blank window.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 /* aborted */) return;
    log.warn('Failed to load:', validatedURL, errorCode, errorDescription);
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const offline = `<!doctype html><html><head><meta charset="utf-8">
      <title>Kalamalah — offline</title>
      <style>
        body{margin:0;height:100vh;display:grid;place-items:center;background:#09090b;color:#e8e1d3;
             font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;text-align:center}
        h1{font-size:20px;margin:0 0 8px;font-weight:600}
        p{margin:0 0 24px;opacity:.65;max-width:32ch}
        button{font:inherit;padding:10px 20px;border-radius:10px;border:1px solid #3a3a3a;
               background:#17171b;color:inherit;cursor:pointer}
        button:hover{background:#22222a}
      </style></head><body><main>
      <h1>Can't reach Kalamalah</h1>
      <p>Check your connection and try again.</p>
      <button onclick="location.replace(${JSON.stringify(APP_URL)})">Retry</button>
      </main></body></html>`;

    void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(offline)}`);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    flushPendingDeepLink();
  });

  void mainWindow.loadURL(APP_URL);
}

// ---------------------------------------------------------------------------
// Deep links
// ---------------------------------------------------------------------------
function sendDeepLink(url) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('deep-link', url);
  } else {
    pendingDeepLink = url;
  }
}

function flushPendingDeepLink() {
  if (!pendingDeepLink || !mainWindow) return;
  const url = pendingDeepLink;
  pendingDeepLink = null;
  sendDeepLink(url);
}

function extractDeepLink(argv) {
  return argv.find((arg) => arg.startsWith('kalamalah://')) || null;
}

// ---------------------------------------------------------------------------
// IPC (registered once)
// ---------------------------------------------------------------------------
function registerIpc() {
  ipcMain.on('window:minimize', () => mainWindow?.minimize());

  ipcMain.on('window:maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });

  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle('window:getBounds', () => mainWindow?.getBounds() ?? {});

  // Navigation (used by an optional custom toolbar)
  ipcMain.handle('nav:canGoBack', () => mainWindow?.webContents.canGoBack() ?? false);
  ipcMain.handle('nav:canGoForward', () => mainWindow?.webContents.canGoForward() ?? false);
  ipcMain.on('nav:back', () => {
    if (mainWindow?.webContents.canGoBack()) mainWindow.webContents.goBack();
  });
  ipcMain.on('nav:forward', () => {
    if (mainWindow?.webContents.canGoForward()) mainWindow.webContents.goForward();
  });
  ipcMain.on('nav:reload', () => mainWindow?.webContents.reload());
  ipcMain.on('nav:home', () => void mainWindow?.loadURL(APP_URL));

  ipcMain.handle('discord:getStatus', () => ({
    enabled: Boolean(store.get('discordRPCEnabled')),
    connected: Boolean(discordRPC),
    configured: Boolean(DISCORD_CLIENT_ID),
  }));

  ipcMain.on('discord:setEnabled', (_event, enabled) => {
    store.set('discordRPCEnabled', Boolean(enabled));
    if (enabled) initDiscordRPC();
    else stopDiscordRPC();
  });

  ipcMain.on('discord:updatePresence', (_event, details) => updateDiscordPresence(details));

  ipcMain.on('powerSave:enable', enablePowerSaveBlocker);
  ipcMain.on('powerSave:disable', disablePowerSaveBlocker);

  ipcMain.handle('updater:check', () => checkForUpdates());
  ipcMain.handle('updater:download', () => autoUpdater.downloadUpdate());
  ipcMain.handle('updater:install', () => {
    isQuitting = true;
    autoUpdater.quitAndInstall();
  });
  ipcMain.handle('updater:getVersion', () => app.getVersion());

  ipcMain.handle('settings:get', (_event, key) => store.get(key));
  ipcMain.on('settings:set', (_event, key, value) => store.set(key, value));
  ipcMain.handle('settings:getAll', () => store.store);

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  }));
}

// ---------------------------------------------------------------------------
// Tray + media keys
// ---------------------------------------------------------------------------
function sendMedia(action) {
  mainWindow?.webContents.send(`media:${action}`);
}

function createTray() {
  if (tray) return;

  tray = new Tray(ICON_PATH);
  tray.setToolTip('Kalamalah Player');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Kalamalah', click: focusMainWindow },
      { type: 'separator' },
      { label: 'Play / Pause', click: () => sendMedia('play-pause') },
      { label: 'Next', click: () => sendMedia('next') },
      { label: 'Previous', click: () => sendMedia('previous') },
      { type: 'separator' },
      { label: 'Check for Updates…', click: () => void checkForUpdates() },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );

  tray.on('click', focusMainWindow);
  tray.on('double-click', focusMainWindow);
}

function registerMediaKeys() {
  if (mediaKeysRegistered) return;

  const bindings = [
    ['MediaPlayPause', 'play-pause'],
    ['MediaNextTrack', 'next'],
    ['MediaPreviousTrack', 'previous'],
    ['MediaStop', 'stop'],
  ];

  let any = false;
  for (const [accelerator, action] of bindings) {
    try {
      any = globalShortcut.register(accelerator, () => sendMedia(action)) || any;
    } catch (err) {
      log.warn(`Could not register ${accelerator}:`, err?.message || err);
    }
  }
  mediaKeysRegistered = any;
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------
async function checkForUpdates() {
  try {
    return await autoUpdater.checkForUpdates();
  } catch (err) {
    // Offline / unsigned build / no published release: fail quietly.
    const message = err?.message || String(err);
    log.warn('Update check failed:', message);
    return { error: message };
  }
}

async function promptForUpdate(info) {
  const result = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: 'info',
    buttons: ['Download Update', 'View Release Notes', 'Later'],
    defaultId: 0,
    cancelId: 2,
    title: 'Kalamalah Update Available',
    message: `Kalamalah v${info.version} is available.`,
    detail: `You are on v${app.getVersion()}.`,
  });

  if (result.response === 0) {
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      log.warn('Update download failed:', err?.message || err);
    }
  } else if (result.response === 1) {
    openExternal('https://github.com/yaseenabouasy/kalamalah/releases/latest');
  }
}

function registerUpdaterEvents() {
  autoUpdater.on('checking-for-update', () =>
    mainWindow?.webContents.send('updater:status', { status: 'checking' }),
  );

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('updater:status', { status: 'available', info });
    void promptForUpdate(info);
  });

  autoUpdater.on('update-not-available', () =>
    mainWindow?.webContents.send('updater:status', { status: 'not-available' }),
  );

  autoUpdater.on('error', (err) =>
    mainWindow?.webContents.send('updater:status', { status: 'error', error: err?.message }),
  );

  autoUpdater.on('download-progress', (progress) =>
    mainWindow?.webContents.send('updater:progress', progress),
  );

  autoUpdater.on('update-downloaded', async (info) => {
    mainWindow?.webContents.send('updater:status', { status: 'downloaded', info });
    const result = await dialog.showMessageBox(mainWindow ?? undefined, {
      type: 'info',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update Ready',
      message: `Kalamalah v${info.version} has been downloaded.`,
      detail: 'Restart to apply the update.',
    });
    if (result.response === 0) {
      isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  pendingDeepLink = extractDeepLink(process.argv);

  app.on('second-instance', (_event, commandLine) => {
    focusMainWindow();
    const deepLink = extractDeepLink(commandLine);
    if (deepLink) sendDeepLink(deepLink);
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    sendDeepLink(url);
  });

  registerIpc();
  registerUpdaterEvents();

  app.whenReady().then(() => {
    createWindow();
    createTray();
    registerMediaKeys();
    initDiscordRPC();

    // Delay the update probe so startup stays fast.
    setTimeout(() => void checkForUpdates(), 8000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else focusMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (!IS_MAC) app.quit();
  });

  app.on('before-quit', () => {
    isQuitting = true;
    stopDiscordRPC();
    globalShortcut.unregisterAll();
    mediaKeysRegistered = false;
    disablePowerSaveBlocker();
  });
}

// Register protocol handler (packaged builds register this at install time,
// this covers dev runs and Linux desktops).
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('kalamalah', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('kalamalah');
}
