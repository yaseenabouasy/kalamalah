const { contextBridge, ipcRenderer } = require('electron');

// Expose window controls to renderer
contextBridge.exposeInMainWorld('kalamalahElectron', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  
  // Listen for maximize state changes
  onMaximized: (callback) => {
    ipcRenderer.on('window:maximized', (_, isMaximized) => callback(isMaximized));
    return () => ipcRenderer.off('window:maximized', callback);
  },

  // App info
  platform: process.platform,
  version: process.versions.electron,
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