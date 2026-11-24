const { contextBridge, ipcRenderer } = require('electron');

// Expose window controls and desktop APIs to renderer
contextBridge.exposeInMainWorld('kalamalahDesktop', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  getBounds: () => ipcRenderer.invoke('window:getBounds'),
  setBounds: (bounds) => ipcRenderer.send('window:setBounds', bounds),
  
  // Listen for maximize state changes
  onMaximized: (callback) => {
    ipcRenderer.on('window:maximized', (_, isMaximized) => callback(isMaximized));
    return () => ipcRenderer.off('window:maximized', callback);
  },
  
  // Discord RPC
  discord: {
    getStatus: () => ipcRenderer.invoke('discord:getStatus'),
    setEnabled: (enabled) => ipcRenderer.send('discord:setEnabled', enabled),
    updatePresence: (details) => ipcRenderer.send('discord:updatePresence', details)
  },
  
  // Power save blocker
  powerSave: {
    enable: () => ipcRenderer.send('powerSave:enable'),
    disable: () => ipcRenderer.send('powerSave:disable')
  },
  
  // Auto-updater
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    getVersion: () => ipcRenderer.invoke('updater:getVersion'),
    onStatus: (callback) => {
      ipcRenderer.on('updater:status', (_, status) => callback(status));
      return () => ipcRenderer.off('updater:status');
    },
    onProgress: (callback) => {
      ipcRenderer.on('updater:progress', (_, progress) => callback(progress));
      return () => ipcRenderer.off('updater:progress');
    }
  },
  
  // Settings
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.send('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll')
  },
  
  // Power save blocker
  powerSave: {
    enable: () => ipcRenderer.send('powerSave:enable'),
    disable: () => ipcRenderer.send('powerSave:disable')
  },
  
  // Deep link handling
  onDeepLink: (callback) => {
    ipcRenderer.on('deep-link', (_, url) => callback(url));
    return () => ipcRenderer.off('deep-link');
  },
  
  // Media keys
  media: {
    playPause: () => ipcRenderer.send('media:play-pause'),
    next: () => ipcRenderer.send('media:next'),
    previous: () => ipcRenderer.send('media:previous'),
    stop: () => ipcRenderer.send('media:stop')
  },
  
  // App info
  platform: process.platform,
  version: process.versions.electron,
  appVersion: require('electron').remote ? require('electron').remote.app.getVersion() : '1.2.0'
});

// Inject custom CSS for macOS traffic light spacing
if (process.platform === 'darwin') {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --traffic-light-offset: 78px; /* Space for 3 buttons + padding */
    }
    @media (max-width: 600px) {
      :root { --traffic-light-offset: 60px; }
    }
    .site-header, .header-container {
      padding-left: var(--traffic-light-offset) !important;
    }
  `;
  document.head.appendChild(style);
}