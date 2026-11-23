const { app, BrowserWindow, Tray, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');

const APP_URL = process.env.KALAMALAH_URL || 'https://kalamalah.com';
const CURRENT_VERSION = '1.2.0';
const ICON_PATH = path.join(__dirname, '..', 'round-logo.png');
const IS_MAC = process.platform === 'darwin';

let mainWindow = null;
let tray = null;

async function checkGitHubRelease() {
  try {
    // Fetch latest release from GitHub
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
        // Open download page
        shell.openExternal(release.html_url);
      } else if (result.response === 1) {
        shell.openExternal(release.html_url);
      }
    }
  } catch (err) {
    console.log('Update check failed:', err.message);
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

function createWindow() {
  const windowOptions = {
    width: 1200,
    height: 820,
    minWidth: 420,
    minHeight: 600,
    icon: ICON_PATH,
    title: 'Kalamalah Player',
    backgroundColor: '#09090b',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    // macOS: native traffic lights (requires frame: true)
    // Windows/Linux: frameless with custom controls
    frame: !IS_MAC,
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'hidden',
    trafficLightPosition: IS_MAC ? { x: 18, y: 18 } : undefined,
    // Visual
    vibrancy: IS_MAC ? 'under-window' : undefined,
    visualEffectState: IS_MAC ? 'active' : undefined,
  };

  mainWindow = new BrowserWindow(windowOptions);

  // Handle macOS traffic light buttons
  if (IS_MAC) {
    mainWindow.setWindowButtonVisibility(true);
  }

  mainWindow.loadURL(APP_URL);

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Window controls IPC
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

  // Check for updates on ready
  mainWindow.once('ready-to-show', () => {
    void checkGitHubRelease();
  });

  // Notify renderer of maximized state changes
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false));
}

function createTray() {
  tray = new Tray(ICON_PATH);
  tray.setToolTip('Kalamalah Player');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Kalamalah', click: () => mainWindow?.show() },
      { label: 'Check for Updates', click: () => void checkGitHubRelease() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
  tray.on('click', () => mainWindow?.show());
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});