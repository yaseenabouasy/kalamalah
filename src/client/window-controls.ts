/**
 * Window Controls Component
 * 
 * Handles custom window controls for non-macOS platforms.
 * On macOS, uses native traffic lights via titleBarStyle: 'hiddenInset'.
 */

export function initWindowControls(): void {
  if (typeof window === 'undefined') return;
  if (!window.kalamalahElectron) return;

  const { minimize, maximize, close, isMaximized, onMaximized, platform } = window.kalamalahElectron;
  
  // On macOS, native traffic lights are used
  if (platform === 'darwin') {
    // Native traffic lights are handled by Electron
    return;
  }

  // Create custom window controls for Windows/Linux
  createCustomControls();
}

function createCustomControls(): void {
  if (document.getElementById('kalamalah-window-controls')) return;

  const controls = document.createElement('div');
  controls.id = 'kalamalah-window-controls';
  controls.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    z-index: 10000;
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg-elevated, #1a1f27);
    border-bottom-left-radius: 12px;
    border: 1px solid var(--border, rgba(214, 187, 138, 0.14));
    border-top: none;
    border-right: none;
    backdrop-filter: blur(12px);
    -webkit-app-region: drag;
  `;

  const buttonStyle = `
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s ease, background 0.15s ease;
    -webkit-app-region: no-drag;
  `;

  const minimizeBtn = document.createElement('button');
  minimizeBtn.style.cssText = buttonStyle + `
    background: #f5c542;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  `;
  minimizeBtn.title = 'Minimize';
  minimizeBtn.innerHTML = '−';
  minimizeBtn.addEventListener('click', () => window.kalamalahElectron?.minimize());

  const maximizeBtn = document.createElement('button');
  maximizeBtn.id = 'kalamalah-maximize-btn';
  maximizeBtn.style.cssText = buttonStyle + `
    background: #34c759;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  `;
  maximizeBtn.title = 'Maximize';
  maximizeBtn.innerHTML = '□';
  maximizeBtn.addEventListener('click', () => window.kalamalahElectron?.maximize());

  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = buttonStyle + `
    background: #ff3b30;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  `;
  closeBtn.title = 'Close';
  closeBtn.innerHTML = '✕';
  closeBtn.addEventListener('click', () => window.kalamalahElectron?.close());

  // Hover effects
  [minimizeBtn, maximizeBtn, closeBtn].forEach(btn => {
    btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.15)');
    btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');
    btn.addEventListener('mousedown', () => btn.style.transform = 'scale(0.9)');
    btn.addEventListener('mouseup', () => btn.style.transform = 'scale(1.15)');
  });

  controls.append(minimizeBtn, maximizeBtn, closeBtn);
  document.body.appendChild(controls);

  // Update maximize button icon based on window state
  const updateMaximizeIcon = async () => {
    const isMax = await window.kalamalahElectron?.isMaximized();
    const btn = document.getElementById('kalamalah-maximize-btn');
    if (btn) btn.innerHTML = isMax ? '❐' : '□';
  };

  // Listen for maximize state changes
  window.kalamalahElectron?.onMaximized((isMaximized) => {
    const btn = document.getElementById('kalamalah-maximize-btn');
    if (btn) btn.innerHTML = isMaximized ? '❐' : '□';
  });

  // Initial sync
  updateMaximizeIcon();

  // Add CSS to prevent content from hiding behind controls
  const style = document.createElement('style');
  style.textContent = `
    @media (min-width: 1025px) {
      .site-header {
        padding-right: 60px !important;
      }
    }
    /* Ensure controls are above everything */
    #kalamalah-window-controls {
      pointer-events: auto;
    }
    #kalamalah-window-controls * {
      -webkit-app-region: no-drag !important;
    }
  `;
  document.head.appendChild(style);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWindowControls);
} else {
  initWindowControls();
}

// Also re-init on SPA navigation
window.addEventListener('kalamalah:page-swapped', initWindowControls);