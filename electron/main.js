const { app, BrowserWindow, Tray, Menu, dialog, shell, ipcMain, globalShortcut, powerSaveBlocker, nativeTheme } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const Store = require('electron-store');
const { DiscordRPC } = require('@xhayper/discord-rpc');

const APP_URL = process.env.KALAMALAH_URL || 'https://kalamalah.com';
const CURRENT_VERSION = '1.2.0';
const ICON_PATH = path.join(__dirname, '..', 'round-logo.png');
const IS_MAC = process.platform === 'darwin';
const IS_DEV = process.env.NODE_ENV === 'development';

// Configure logging
log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Electron Store for settings
const store = new Store({
  defaults: {
    windowBounds: { width: 1200, height: 820 },
    windowMaximized: false,
    theme: 'system',
    playbackPosition: {},
    discordRPCEnabled: true
  }
});

// Discord RPC
let discordRPC = null;
let discordRPCReconnectTimer = null;
const DISCORD_CLIENT_ID = '123456789012345678'; // Replace with your Discord app ID

function initDiscordRPC() {
  if (!store.get('discordRPCEnabled')) return;
  
  try {
    discordRPC = new DiscordRPC(DISCORD_CLIENT_ID, {
      autoThreshold: 1000,
      autoRetry: true,
      autoReconnect: true
    });
    
    discordRPC.on('ready', () => {
      log.info('Discord RPC connected');
      updateDiscordPresence();
    });
    
    discordRPC.on('disconnected', () => {
      log.warn('Discord RPC disconnected');
      scheduleDiscordReconnect();
    });
    
    discordRPC.on('error', (err) => {
      log.error('Discord RPC error:', err);
    });
    
    discordRPC.connect().catch(err => {
      log.error('Discord RPC connection failed:', err);
      scheduleDiscordReconnect();
    });
  } catch (err) {
    log.error('Failed to initialize Discord RPC:', err);
  }
}

function scheduleDiscordReconnect() {
  if (discordRPCReconnectTimer) clearTimeout(discordRPCReconnectTimer);
  discordRPCReconnectTimer = setTimeout(() => {
    if (store.get('discordRPCEnabled')) {
      initDiscordRPC();
    }
  }, 30000);
}

function updateDiscordPresence(details = {}) {
  if (!discordRPC) return;
  
  const state = details.reciter ? `Reciter: ${details.reciter}` : 'Browsing';
  const detailsText = details.surah ? `Surah ${details.surah}` : (details.page || 'Main Menu');
  
  discordRPC.setActivity({
    details: detailsText,
    state: state,
    largeImageKey: 'kalamalah-logo',
    largeImageText: 'Kalamalah Quran Player',
    smallImageKey: details.playing ? 'play' : 'pause',
    smallImageText: details.playing ? 'Playing' : 'Paused',
    instance: false,
    buttons: [
      { label: 'Open Kalamalah', url: 'https://kalamalah.com' }
    ]
  }).catch(err => log.error('Failed to update Discord presence:', err));
}

function stopDiscordRPC() {
  if (discordRPCReconnectTimer) clearTimeout(discordRPCReconnectTimer);
  if (discordRPC) {
    discordRPC.destroy().catch(() => {});
    discordRPC = null;
  }
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      
      // Handle deep link on Windows/Linux
      const url = commandLine.find(arg => arg.startsWith('kalamalah://'));
      if (url && mainWindow.webContents) {
        mainWindow.webContents.send('deep-link', url);
      }
    }
  });
}

// Handle deep links (macOS)
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('deep-link', url);
  }
});

// Power save blocker for audio playback
let powerSaveBlockerId = null;

function enablePowerSaveBlocker() {
  if (powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    log.info('Power save blocker enabled');
  }
}

function disablePowerSaveBlocker() {
  if (powerSaveBlockerId !== null) {
    powerSaveBlocker.stop(powerSaveBlockerId);
    powerSaveBlockerId = null;
    log.info('Power save blocker disabled');
  }
}

const APP_URL = process.env.KALAMALAH_URL || 'https://kalamalah.com';
const CURRENT_VERSION = '1.2.0';
const ICON_PATH = path.join(__dirname, '..', 'round-logo.png');
const IS_MAC = process.platform === 'darwin';

let mainWindow = null;
let tray = null;
let mediaKeysRegistered = false;

function createWindow() {
  // Load saved window bounds
  const savedBounds = store.get('windowBounds');
  const savedMaximized = store.get('windowMaximized');

  const windowOptions = {
    width: savedBounds?.width || 1200,
    height: savedBounds?.height || 820,
    minWidth: 420,
    minHeight: 600,
    x: savedBounds?.x,
    y: savedBounds?.y,
    icon: ICON_PATH,
    title: 'Kalamalah Player',
    backgroundColor: '#09090b',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false
    },
    frame: !IS_MAC,
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'hidden',
    trafficLightPosition: IS_MAC ? { x: 18, y: 18 } : undefined,
    vibrancy: IS_MAC ? 'under-window' : undefined,
    visualEffectState: IS_MAC ? 'active' : undefined,
    show: false
  };

  if (savedMaximized) {
    windowOptions.maximizable = true;
  }

  mainWindow = new BrowserWindow(windowOptions);

  if (savedMaximized) {
    mainWindow.maximize();
  }

  // Handle macOS traffic light buttons
  if (IS_MAC) {
    mainWindow.setWindowButtonVisibility(true);
  }

  // Handle window state changes
  mainWindow.on('resize', () => {
    if (!mainWindow.isMaximized()) {
      store.set('windowBounds', mainWindow.getBounds());
    }
  });

  mainWindow.on('move', () => {
    if (!mainWindow.isMaximized()) {
      store.set('windowBounds', mainWindow.getBounds());
    }
  });

  mainWindow.on('maximize', () => {
    store.set('windowMaximized', true);
    mainWindow.webContents.send('window:maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    store.set('windowMaximized', false);
    mainWindow.webContents.send('window:maximized', false);
  });

  // Handle window close
  mainWindow.on('close', (e) => {
    if (process.platform !== 'darwin') {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Load the app URL
  mainWindow.loadURL(APP_URL);

  // Handle kalamalah.com and subdomains - open in app
  // External domains - open in default browser
  const handleNavigation = (url) => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      // Allow kalamalah.com and all subdomains
      if (hostname === 'kalamalah.com' || hostname.endsWith('.kalamalah.com')) {
        return { action: 'allow' };
      }
      
      // External domains - open in default browser
      shell.openExternal(url);
      return { action: 'deny' };
    } catch {
      // Invalid URL - deny
      return { action: 'deny' };
    }
  };

  mainWindow.webContents.setWindowOpenHandler(({ url }) => handleNavigation(url));

  // Handle will-navigate for main frame navigation
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const decision = handleNavigation(url);
    if (decision.action === 'deny') {
      event.preventDefault();
    }
  });

  // Handle new window creation (target="_blank" etc)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => handleNavigation(url));

  // Window controls IPC
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle('window:getBounds', () => mainWindow?.getBounds() ?? {});
  ipcMain.on('window:setBounds', (_, bounds) => mainWindow?.setBounds(bounds));

  // Discord RPC control
  ipcMain.handle('discord:getStatus', () => ({ enabled: store.get('discordRPCEnabled') }));
  ipcMain.on('discord:setEnabled', (_, enabled) => {
    store.set('discordRPCEnabled', enabled);
    if (enabled) {
      initDiscordRPC();
    } else {
      stopDiscordRPC();
    }
  });
  ipcMain.on('discord:updatePresence', (_, details) => updateDiscordPresence(details));

  // Power save blocker control
  ipcMain.on('powerSave:enable', () => enablePowerSaveBlocker());
  ipcMain.on('powerSave:disable', () => disablePowerSaveBlocker());

  // Auto-updater
  ipcMain.handle('updater:check', () => autoUpdater.checkForUpdates());
  ipcMain.handle('updater:download', () => autoUpdater.downloadUpdate());
  ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall());
  ipcMain.handle('updater:getVersion', () => CURRENT_VERSION);

  // Settings
  ipcMain.handle('settings:get', (_, key) => store.get(key));
  ipcMain.on('settings:set', (_, key, value) => store.set(key, value));
  ipcMain.handle('settings:getAll', () => store.store);

  // Check for updates on ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    void checkGitHubRelease();
    initDiscordRPC();
    registerMediaKeys();
  });

  // Notify renderer of maximized state changes
  mainWindow.on('maximize', () => {
    store.set('windowMaximized', true);
    mainWindow.webContents.send('window:maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    store.set('windowMaximized', false);
    mainWindow.webContents.send('window:maximized', false);
  });

  // Auto-updater events
  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('updater:status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('updater:status', { status: 'available', info });
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('updater:status', { status: 'not-available' });
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err);
    mainWindow.webContents.send('updater:status', { status: 'error', error: err.message });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('updater:progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('updater:status', { status: 'downloaded', info });
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Restart Now', 'Later'],
      title: 'Update Ready',
      message: `Kalamalah v${info.version} has been downloaded.`,
      detail: 'The application will restart to apply the update.'
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });
}

function createTray() {
  tray = new Tray(ICON_PATH);
  tray.setToolTip('Kalamalah Player');
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Kalamalah', click: () => mainWindow?.show() },
    { type: 'separator' },
    { 
      label: 'Play/Pause', 
      click: () => mainWindow?.webContents.send('media:play-pause'),
      accelerator: 'MediaPlayPause'
    },
    { 
      label: 'Next', 
      click: () => mainWindow?.webContents.send('media:next'),
      accelerator: 'MediaNextTrack'
    },
    { 
      label: 'Previous', 
      click: () => mainWindow?.webContents.send('media:previous'),
      accelerator: 'MediaPreviousTrack'
    },
    { type: 'separator' },
    { label: 'Check for Updates', click: () => void checkGitHubRelease() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow?.show());
}

function registerMediaKeys() {
  if (mediaKeysRegistered) return;
  
  const ret = globalShortcut.register('MediaPlayPause', () => {
    mainWindow?.webContents.send('media:play-pause');
  });
  
  if (ret) {
    globalShortcut.register('MediaNextTrack', () => {
      mainWindow?.webContents.send('media:next');
    });
    
    globalShortcut.register('MediaPreviousTrack', () => {
      mainWindow?.webContents.send('media:previous');
    });
    
    globalShortcut.register('MediaStop', () => {
      mainWindow?.webContents.send('media:stop');
    });
    
    mediaKeysRegistered = true;
    log.info('Global media keys registered');
  }
}

function unregisterMediaKeys() {
  globalShortcut.unregisterAll();
  mediaKeysRegistered = false;
}

async function checkGitHubRelease() {
  try {
    const res = await fetch('https://api.github.com/repos/yaseenabouasy/kalamalah/releases/latest', {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!res.ok) return;
    
    const release = await res.json();
    const latestVersion = release.tag_name.replace('v', '');
    const currentVersion = CURRENT_VERSION;
    
    if (compareVersions(latestVersion, currentVersion) > 0) {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['Download Update', 'View Release Notes', 'Later'],
        title: 'Kalamalah Update Available',
        message: `Kalamalah v${latestVersion} is available!`,
        detail: `Current version: v${currentVersion}\n\n${release.body || 'No release notes provided.'}`,
      });
      
      if (result.response === 0 && mainWindow) {
        shell.openExternal(release.html_url);
      } else if (result.response === 1) {
        shell.openExternal(release.html_url);
      }
    }
  } catch (err) {
    log.error('Update check failed:', err.message);
  }
}

function compareVersions(a, b) {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aVal = aParts[i] || 0;
    const bVal = bParts[i] || 0;
    if (aVal > bVal) return 1;
    if (aVal < bVal) return -1;
  }
  return 0;
}

function createTray() {
  tray = new Tray(ICON_PATH);
  tray.setToolTip('Kalamalah Player');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Kalamalah', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Play/Pause', click: () => mainWindow?.webContents.send('media:play-pause') },
    { label: 'Next', click: () => mainWindow?.webContents.send('media:next') },
    { label: 'Previous', click: () => mainWindow?.webContents.send('media:previous') },
    { type: 'separator' },
    { label: 'Check for Updates', click: () => void checkGitHubRelease() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));
  tray.on('click', () => mainWindow?.show());
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  initDiscordRPC();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopDiscordRPC();
  unregisterMediaKeys();
  disablePowerSaveBlocker();
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'kalamalah.com' || urlObj.hostname.endsWith('.kalamalah.com')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
});