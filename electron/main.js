const {
  app,
  BrowserWindow,
  nativeTheme,
  Menu,
  Tray,
  ipcMain,
  protocol,
  shell,
  dialog,
  globalShortcut,
  powerSaveBlocker,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const Store = require('electron-store');
const { Client: DiscordClient } = require('@xhayper/discord-rpc');

/**
 * electron-store v9+ is ESM-only and cannot be require()d here.
 * package.json pins ^8.x (CommonJS) for that reason.
 */

const APP_URL = process.env.KALAMALAH_URL || 'https://kalamalah.com';
const ICON_PATH = path.join(__dirname, 'round-logo.png');
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const DISCORD_CLIENT_ID = process.env.KALAMALAH_DISCORD_CLIENT_ID || '';

const ALLOWED_SETTINGS_KEYS = new Set([
  'windowBounds',
  'windowMaximized',
  'discordRPCEnabled',
]);

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
// Discord Rich Presence (LyricsFlow-style)
// ---------------------------------------------------------------------------
let discordRPC = null;
let isDiscordConnected = false;
let currentActivity = null;
let discordReconnectTimer = null;
let lastActivityError = '';

const artworkCache = new Map();
let artworkFetchInFlight = null;

const DISCORD_SHORT_TITLE_PADDING = '\u200B';
const DISCORD_TRUNCATION_SUFFIX = '\u2026';
const LOGO = 'https://kalamalah.com/images/icon.png';

function truncateDiscordField(value, maxLength = 128) {
  if (!value) return '';
  const s = String(value).trim();
  if (s.length <= maxLength) return s;
  return s.slice(0, maxLength - 1) + DISCORD_TRUNCATION_SUFFIX;
}

function normalizeTitle(title, maxLength = 128) {
  if (!title) return null;
  const normalized = String(title).trim();
  if (!normalized) return null;
  const padded = normalized.length === 1 ? `${normalized}${DISCORD_SHORT_TITLE_PADDING}` : normalized;
  return truncateDiscordField(padded, maxLength);
}

function upscaleArtworkTo900(url) {
  if (!url || typeof url !== 'string') return null;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null;
  if (url.startsWith('blob:') || url.startsWith('data:')) return null;

  let u = url;
  if (u.includes('{w}x{h}')) {
    return u.replace('{w}', '900').replace('{h}', '900').replace('{c}', '').replace('{f}', 'jpg');
  }
  if (u.includes('100x100')) return u.replace('100x100', '900x900');
  if (u.includes('600x600')) return u.replace('600x600', '900x900');
  if (u.includes('512x512')) return u.replace('512x512', '900x900');
  return u;
}

async function fetchAndCacheArtwork900(trackId) {
  if (!trackId || artworkCache.has(trackId) || artworkFetchInFlight === trackId) return;
  artworkFetchInFlight = trackId;

  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${trackId}`);
    if (res.ok) {
      const data = await res.json();
      const rawUrl = data?.results?.[0]?.artworkUrl100;
      if (rawUrl) {
        artworkCache.set(trackId, upscaleArtworkTo900(rawUrl));
        if (currentActivity && String(currentActivity.songId) === String(trackId)) {
          setActivity(currentActivity);
        }
      }
    }
  } catch {
  } finally {
    if (artworkFetchInFlight === trackId) artworkFetchInFlight = null;
  }
}

function sendRawSetActivity(rawActivity) {
  if (typeof discordRPC?.request === 'function') {
    return discordRPC.request('SET_ACTIVITY', {
      pid: process.pid,
      activity: rawActivity,
    });
  }
  return Promise.reject(new Error('client.request is unavailable'));
}

let lastSentKey = '';
let lastSentTime = 0;

function setActivity(data) {
  if (!DISCORD_CLIENT_ID) return;
  currentActivity = data;
  if (!discordRPC || !isDiscordConnected || !discordRPC.user) return;

  if (!data || !data.title) {
    lastSentKey = '';
    discordRPC.user.clearActivity?.().catch(() => {});
    return;
  }

  const posSec = Math.max(0, Math.floor(data.position || 0));
  const durSec = Math.max(0, Math.floor(data.duration || 0));
  const isPlaying = Boolean(data.isPlaying);
  const trackId = data.songId ? String(data.songId).trim() : null;
  const audioQuality = data.audioQuality ? String(data.audioQuality).trim() : '';
  const hasTrackId = Boolean(trackId && /^\d+$/.test(trackId));

  const nowMs = Date.now();
  if (lastSentKey) {
    try {
      const prev = JSON.parse(lastSentKey);
      const sameTrack = prev.trackId === (trackId || data.title) && prev.audioQuality === audioQuality;
      const samePlayState = prev.isPlaying === isPlaying;

      if (sameTrack && samePlayState) {
        const elapsedRealSec = Math.floor((nowMs - lastSentTime) / 1000);
        const expectedPosSec = prev.isPlaying ? prev.posSec + elapsedRealSec : prev.posSec;
        const isSeekOrDrift = Math.abs(posSec - expectedPosSec) > 1;

        if (!isSeekOrDrift) return;
      }
    } catch {}
  }

  lastSentKey = JSON.stringify({ trackId: trackId || data.title, audioQuality, isPlaying, posSec, durSec });
  lastSentTime = nowMs;

  const details = normalizeTitle(data.title, 128) || 'Quran Recitation';
  const artistClean = data.reciter ? String(data.reciter).trim() : 'Unknown Reciter';
  const surahClean = data.surah ? `Surah ${data.surah}` : '';
  const stateText = artistClean + (surahClean ? ` • ${surahClean}` : '');
  const state = truncateDiscordField(isPlaying ? stateText : `Paused • ${stateText}`, 128);

  let largeImageText = 'Kalamalah';
  if (surahClean) largeImageText = truncateDiscordField(`${surahClean} • ${artistClean}`, 128);
  else if (artistClean) largeImageText = truncateDiscordField(artistClean, 128);

  let largeImageKey = LOGO;
  if (data.artUrl) {
    const upscaled = upscaleArtworkTo900(data.artUrl);
    if (upscaled) largeImageKey = upscaled;
  }

  const trackUrl = hasTrackId ? `https://kalamalah.com/surah/${trackId}` : 'https://kalamalah.com';
  const smallIcon = isPlaying ? LOGO : LOGO;
  const smallText = isPlaying ? 'Playing' : 'Paused';

  const buttons = [
    { label: 'Open Kalamalah', url: 'https://kalamalah.com' },
    ...(trackId ? [{ label: 'View Surah', url: `https://kalamalah.com/surah/${trackId}` }] : []),
  ];

  const startSec = isPlaying && durSec > 0 ? Math.floor((nowMs / 1000) - posSec) : undefined;
  const endSec = isPlaying && durSec > 0 ? Math.floor((nowMs / 1000) + (durSec - posSec)) : undefined;

  const rawActivity = {
    type: 2, // Listening
    status_display_type: 1, // Show state (artist) in sidebar
    details,
    ...(trackUrl ? { details_url: trackUrl } : {}),
    state,
    state_url: 'https://kalamalah.com',
    assets: {
      large_image: largeImageKey,
      large_text: largeImageText,
      large_url: trackUrl,
      small_image: smallIcon,
      small_text: smallText,
      small_url: 'https://kalamalah.com',
    },
    ...(startSec !== undefined && endSec !== undefined ? { timestamps: { start: startSec, end: endSec } } : {}),
    ...(buttons.length > 0 ? { buttons: buttons.slice(0, 2) } : {}),
    instance: false,
  };

  sendRawSetActivity(rawActivity).catch(() => {
    const activity = {
      type: 2,
      statusDisplayType: 1,
      details,
      ...(trackUrl ? { detailsUrl: trackUrl } : {}),
      state,
      stateUrl: 'https://kalamalah.com',
      largeImageKey,
      largeImageText,
      largeUrl: trackUrl,
      smallImageKey: smallIcon,
      smallImageText: smallText,
      ...(isPlaying && durSec > 0
        ? {
            startTimestamp: Math.floor(nowMs - posSec * 1000),
            endTimestamp: Math.floor(nowMs + (durSec - posSec) * 1000),
          }
        : {}),
      ...(buttons.length > 0 ? { buttons: buttons.slice(0, 2) } : {}),
      instance: false,
    };

    discordRPC.user.setActivity(activity).catch((err) => {
      if (err?.message && err.message !== lastActivityError) {
        lastActivityError = err.message;
        log.warn('[Discord RPC] Error setting activity:', err.message);
      }
    });
  });
}

function clearActivity() {
  currentActivity = null;
  if (!discordRPC || !isDiscordConnected || !discordRPC.user) return;
  discordRPC.user.clearActivity?.().catch(() => {});
}

function initDiscordRPC() {
  if (!DISCORD_CLIENT_ID) return;
  if (!store.get('discordRPCEnabled')) return;
  if (discordRPC) return;

  try {
    discordRPC = new DiscordClient({ clientId: DISCORD_CLIENT_ID });

    discordRPC.on('ready', () => {
      isDiscordConnected = true;
      log.info('[Discord RPC] Connected as', discordRPC.user?.username || 'User');
      if (currentActivity) setActivity(currentActivity);
    });

    discordRPC.on('disconnected', () => {
      isDiscordConnected = false;
      log.warn('[Discord RPC] Disconnected');
      discordRPC = null;
      scheduleDiscordReconnect();
    });

    tryConnect();
  } catch (err) {
    log.warn('Failed to initialize Discord RPC:', err?.message || err);
    discordRPC = null;
  }
}

function scheduleDiscordReconnect() {
  if (discordReconnectTimer) return;
  discordReconnectTimer = setTimeout(() => {
    discordReconnectTimer = null;
    tryConnect();
  }, 15000);
}

function tryConnect() {
  if (!discordRPC) return;
  discordRPC.login().catch((err) => {
    log.warn('[Discord RPC] Login failed (Discord may not be running):', err?.message || err);
    scheduleDiscordReconnect();
  });
}

function stopDiscordRPC() {
  if (discordReconnectTimer) {
    clearTimeout(discordReconnectTimer);
    discordReconnectTimer = null;
  }
  try {
    discordRPC?.destroy?.()?.catch(() => {});
  } catch {}
  discordRPC = null;
  isDiscordConnected = false;
}

// ---------------------------------------------------------------------------
// Power save blocker
// ---------------------------------------------------------------------------
function enablePowerSaveBlocker() {
  if (powerSaveBlockerId === null) powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
}

function disablePowerSaveBlocker() {
  if (powerSaveBlockerId !== null) {
    powerSaveBlocker.stop(powerSaveBlockerId);
    powerSaveBlockerId = null;
  }
}

// ---------------------------------------------------------------------------
// Navigation policy
// ---------------------------------------------------------------------------
const ALLOWED_EXTERNAL_PROTOCOLS = ['https:', 'http:', 'mailto:'];

function isInternalUrl(rawUrl) {
  try {
    const { protocol, hostname } = new URL(rawUrl);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    return hostname === 'kalamalah.com';
  } catch {
    return false;
  }
}

function openExternal(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!ALLOWED_EXTERNAL_PROTOCOLS.includes(u.protocol)) {
      log.warn('Blocked external url with non-allowed protocol:', u.protocol);
      return;
    }
    void shell.openExternal(u.href);
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

  const options = {
    title: 'Kalamalah Player',
    width: savedBounds.width || 1200,
    height: savedBounds.height || 820,
    x: savedBounds.x,
    y: savedBounds.y,
    minWidth: 420,
    minHeight: 600,
    show: false,
    icon: ICON_PATH,
    roundedCorners: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  };

  if (IS_MAC) {
    options.titleBarStyle = 'hiddenInset';
    options.trafficLightPosition = { x: 16, y: 16 };
    options.vibrancy = 'sidebar';
  } else if (IS_WIN) {
    options.titleBarStyle = 'hidden';
    options.backgroundMaterial = 'mica';
  } else {
    options.titleBarStyle = 'hidden';
    options.titleBarOverlay = {
      color: '#00000000',
      symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#000000',
      height: 36,
    };
  }

  mainWindow = new BrowserWindow(options);

  if (shouldMaximize) mainWindow.maximize();

  const persistBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) return;
    store.set('windowBounds', mainWindow.getBounds());
  };

  mainWindow.on('resize', persistBounds);
  mainWindow.on('move', persistBounds);

  mainWindow.on('maximize', () => {
    store.set('windowMaximized', true);
    mainWindow?.webContents.send('maximize-state', true);
  });

  mainWindow.on('unmaximize', () => {
    store.set('windowMaximized', false);
    mainWindow?.webContents.send('maximize-state', false);
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && !IS_MAC && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
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

  // Offline fallback
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
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
    mainWindow.webContents.send('navigate-to', url);
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
// IPC
// ---------------------------------------------------------------------------
function registerIpc() {
  // Windows build version (for Mica/acrylic detection)
  ipcMain.on('win-build', (event) => {
    try {
      const release = require('os').release();
      event.returnValue = Number(String(release).split('.').pop() || 0);
    } catch {
      event.returnValue = 0;
    }
  });
  // Window controls (LyricsFlow-style)
  ipcMain.on('window-controls', (_event, action) => {
    if (!mainWindow) return;
    if (action === 'minimize') mainWindow.minimize();
    else if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    else if (action === 'close') mainWindow.close();
  });

  // Legacy kalamalahElectron API
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (!mainWindow) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle('window:getBounds', () => mainWindow?.getBounds() ?? {});

  // Navigation (used by custom toolbar)
  ipcMain.handle('nav:canGoBack', () => mainWindow?.webContents.canGoBack() ?? false);
  ipcMain.handle('nav:canGoForward', () => mainWindow?.webContents.canGoForward() ?? false);
  ipcMain.on('nav:back', () => mainWindow?.webContents.canGoBack() && mainWindow.webContents.goBack());
  ipcMain.on('nav:forward', () => mainWindow?.webContents.canGoForward() && mainWindow.webContents.goForward());
  ipcMain.on('nav:reload', () => mainWindow?.webContents.reload());
  ipcMain.on('nav:home', () => void mainWindow?.loadURL(APP_URL));

  // Discord RPC
  ipcMain.handle('discord:getStatus', () => ({
    enabled: Boolean(store.get('discordRPCEnabled')),
    connected: isDiscordConnected,
    configured: Boolean(DISCORD_CLIENT_ID),
  }));

  ipcMain.on('discord:setEnabled', (_event, enabled) => {
    store.set('discordRPCEnabled', Boolean(enabled));
    if (enabled) initDiscordRPC();
    else stopDiscordRPC();
  });

  ipcMain.on('discord:updatePresence', (_event, details) => setActivity(details));
  ipcMain.on('discord:clear', clearActivity);

  // Power save blocker
  ipcMain.on('powerSave:enable', enablePowerSaveBlocker);
  ipcMain.on('powerSave:disable', disablePowerSaveBlocker);

  // Auto-updater
  ipcMain.handle('updater:check', () => checkForUpdates());
  ipcMain.handle('updater:download', () => autoUpdater.downloadUpdate());
  ipcMain.handle('updater:install', () => {
    isQuitting = true;
    autoUpdater.quitAndInstall();
  });
  ipcMain.handle('updater:getVersion', () => app.getVersion());

  // Settings
  ipcMain.handle('settings:get', (_event, key) => store.get(key));
  ipcMain.on('settings:set', (_event, key, value) => {
    if (!ALLOWED_SETTINGS_KEYS.has(key)) {
      log.warn('Rejected settings:set for disallowed key:', key);
      return;
    }
    store.set(key, value);
  });
  ipcMain.handle('settings:getAll', () => store.store);

  // App info
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

  // Command line switches for performance
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('high-dpi-support', '1');

  if (IS_WIN) {
    app.setAppUserModelId('com.kalamalah.player');
  }

  app.whenReady().then(() => {
    createWindow();
    createTray();
    registerMediaKeys();
    initDiscordRPC();

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

// Register protocol handler
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('kalamalah', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('kalamalah');
}