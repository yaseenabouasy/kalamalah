const { contextBridge, ipcRenderer } = require('electron');

const isWin = process.platform === 'win32';

const subscribe = (channel, callback) => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

// Primary API: kalamalahElectron (used by existing renderer code)
const api = {
  // Window controls (legacy API)
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  getBounds: () => ipcRenderer.invoke('window:getBounds'),
  onMaximized: (callback) => subscribe('maximize-state', callback),

  // LyricsFlow-style window controls
  windowControls: (action) => ipcRenderer.send('window-controls', action),
  onMaximizeChange: (callback) => subscribe('maximize-state', callback),

  // Navigation
  nav: {
    canGoBack: () => ipcRenderer.invoke('nav:canGoBack'),
    canGoForward: () => ipcRenderer.invoke('nav:canGoForward'),
    back: () => ipcRenderer.send('nav:back'),
    forward: () => ipcRenderer.send('nav:forward'),
    reload: () => ipcRenderer.send('nav:reload'),
    home: () => ipcRenderer.send('nav:home'),
  },
  onNavigate: (callback) => subscribe('navigate-to', callback),

  // Discord RPC (LyricsFlow-style)
  updateDiscordPresence: (data) => ipcRenderer.send('discord:updatePresence', data),
  clearDiscordPresence: () => ipcRenderer.send('discord:clear'),

  // Legacy Discord API
  discord: {
    getStatus: () => ipcRenderer.invoke('discord:getStatus'),
    setEnabled: (enabled) => ipcRenderer.send('discord:setEnabled', enabled),
    updatePresence: (details) => ipcRenderer.send('discord:updatePresence', details),
  },

  // Playback helpers
  powerSave: {
    enable: () => ipcRenderer.send('powerSave:enable'),
    disable: () => ipcRenderer.send('powerSave:disable'),
  },

  // Auto updater
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    getVersion: () => ipcRenderer.invoke('updater:getVersion'),
    onStatus: (callback) => subscribe('updater:status', callback),
    onProgress: (callback) => subscribe('updater:progress', callback),
  },

  // Settings
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.send('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },

  // Deep link
  onDeepLink: (callback) => subscribe('navigate-to', callback),

  // Metadata
  appInfo: () => ipcRenderer.invoke('app:info'),
  platform: process.platform,
  win10: isWin && (() => {
    try { return ipcRenderer.sendSync('win-build') < 22621; } catch { return true; }
  })(),
};

contextBridge.exposeInMainWorld('kalamalahElectron', api);
// Backwards-compatible alias
contextBridge.exposeInMainWorld('kalamalahDesktop', api);

// macOS: reserve space for the native traffic lights
if (process.platform === 'darwin') {
  window.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
      :root { --traffic-light-offset: 78px; }
      @media (max-width: 600px) { :root { --traffic-light-offset: 60px; } }
      .site-header, .header-container {
        padding-left: var(--traffic-light-offset) !important;
        -webkit-app-region: drag;
      }
      .site-header a, .site-header button, .header-container a, .header-container button {
        -webkit-app-region: no-drag;
      }
    `;
    document.head.appendChild(style);
  });
} else {
  // Windows/Linux: the custom window controls (window-controls.ts) create their own
  // drag region on the controls container. No extra drag region needed here.
}