const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel, callback) => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const api = {
  // ----- Window controls (used by src/client/window-controls.ts) -----
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  getBounds: () => ipcRenderer.invoke('window:getBounds'),
  onMaximized: (callback) => subscribe('window:maximized', callback),

  // ----- In-app navigation -----
  nav: {
    canGoBack: () => ipcRenderer.invoke('nav:canGoBack'),
    canGoForward: () => ipcRenderer.invoke('nav:canGoForward'),
    back: () => ipcRenderer.send('nav:back'),
    forward: () => ipcRenderer.send('nav:forward'),
    reload: () => ipcRenderer.send('nav:reload'),
    home: () => ipcRenderer.send('nav:home'),
  },

  // ----- Discord Rich Presence -----
  discord: {
    getStatus: () => ipcRenderer.invoke('discord:getStatus'),
    setEnabled: (enabled) => ipcRenderer.send('discord:setEnabled', enabled),
    updatePresence: (details) => ipcRenderer.send('discord:updatePresence', details),
  },

  // ----- Playback helpers -----
  powerSave: {
    enable: () => ipcRenderer.send('powerSave:enable'),
    disable: () => ipcRenderer.send('powerSave:disable'),
  },

  // ----- Auto updater -----
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    getVersion: () => ipcRenderer.invoke('updater:getVersion'),
    onStatus: (callback) => subscribe('updater:status', callback),
    onProgress: (callback) => subscribe('updater:progress', callback),
  },

  // ----- Settings -----
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.send('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },

  // ----- Shell integration -----
  onDeepLink: (callback) => subscribe('deep-link', callback),
  onMediaKey: (callback) => subscribe('media:play-pause', () => callback('play-pause')),

  // ----- Metadata -----
  appInfo: () => ipcRenderer.invoke('app:info'),
  platform: process.platform,
};

contextBridge.exposeInMainWorld('kalamalahElectron', api);
// Backwards-compatible alias used by the newer desktop integrations.
contextBridge.exposeInMainWorld('kalamalahDesktop', api);

window.addEventListener('DOMContentLoaded', () => {
  // macOS: reserve space for the native traffic lights.
  if (process.platform === 'darwin') {
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
    return;
  }

  // Drag region for the frameless Windows/Linux shell.
  if (!document.getElementById('kalamalah-drag-region')) {
    const drag = document.createElement('div');
    drag.id = 'kalamalah-drag-region';
    drag.style.cssText =
      'position:fixed;inset:0 0 auto 0;height:32px;z-index:9998;-webkit-app-region:drag;';
    document.body.appendChild(drag);
  }
});
