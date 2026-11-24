/**
 * Lazy Import Utilities - Code Splitting for Heavy Modules
 * Reduces initial bundle size by dynamically importing heavy features
 */

// Track loaded modules to prevent duplicate loads
const loadedModules = new Map<string, Promise<any>>();

/**
 * Dynamically import a module with caching
 */
export async function lazyImport<T>(modulePath: string, importName: string): Promise<T> {
  const key = `${modulePath}:${importName}`;
  
  if (!loadedModules.has(key)) {
    loadedModules.set(key, import(modulePath).then(mod => mod[importName]));
  }
  
  return loadedModules.get(key)!;
}

/**
 * Preload a module (call on user interaction hints)
 */
export function preloadModule(modulePath: string): void {
  // Use modulepreload link for modern browsers
  const link = document.createElement('link');
  link.rel = 'modulepreload';
  link.href = modulePath;
  document.head.appendChild(link);
}

/**
 * Lazy-load heavy features on demand
 */
export const LazyFeatures = {
  // Settings sheet - heavy with many components
  async settingsSheet() {
    const { initSettingsSheet } = await import('./settings-sheet.js');
    return initSettingsSheet();
  },

  // Ambient mixer - audio context, heavy
  async ambientMixer() {
    const { initAmbientMixer } = await import('./ambient-mixer.js');
    return initAmbientMixer();
  },

  // TV display / dual screen - WebRTC, heavy
  async tvDisplay() {
    const { initDualScreenMode } = await import('./tv-display.js');
    return initDualScreenMode();
  },

  // Hijri calendar - date calculations
  async hijriCalendar() {
    const { initHijriCalendarBanner } = await import('./hijri-calendar.js');
    return initHijriCalendarBanner();
  },

  // Debug overlay - dev only
  async debugOverlay() {
    const { initDebugOverlay } = await import('./debug-overlay.js');
    return initDebugOverlay();
  },

  // Changelog modal - markdown parsing
  async changelogModal() {
    const { initChangelogModal } = await import('./changelog-modal.js');
    return initChangelogModal();
  },

  // Sleep timer - audio scheduling
  async sleepTimer() {
    const { initSleepTimer } = await import('./sleep-timer.js');
    return initSleepTimer();
  },

  // Hifz tools - memorization features
  async hifzTools() {
    const { initHifzTools } = await import('./hifz-tools.js');
    return initHifzTools();
  },

  // Ayah card generator - canvas, heavy
  async ayahCard() {
    const { initAyahCardGenerator } = await import('./ayah-card.js');
    return initAyahCardGenerator();
  },

  // Ayah embed widget
  async ayahEmbed() {
    const { initAyahEmbedWidget } = await import('./ayah-embed.js');
    return initAyahEmbedWidget();
  },

  // Cast controller - WebRTC
  async castController() {
    const { initCastController } = await import('./cast-controller.js');
    return initCastController();
  },

  // Window controls - Electron only
  async windowControls() {
    const { initWindowControls } = await import('./window-controls.js');
    return initWindowControls();
  },

  // Media session - notification handling
  async mediaSession() {
    const { initMediaSession } = await import('./media-session.js');
    return initMediaSession();
  },

  // Zaraz consent
  async zaraz() {
    const { initZarazConsent, setZarazConsent, trackPageView } = await import('./zaraz.js');
    return { initZarazConsent, setZarazConsent, trackPageView };
  },
};

/**
 * Preload critical features on user interaction
 * Call this on first user interaction (click, scroll, keydown)
 */
export function preloadCriticalFeatures(): void {
  // Preload modules that are likely needed soon
  const criticalPaths = [
    '/src/client/settings-sheet.js',
    '/src/client/ambient-mixer.js',
    '/src/client/zaraz.js',
  ];
  
  criticalPaths.forEach(path => {
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = path;
    document.head.appendChild(link);
  });
}

/**
 * Initialize feature on first user interaction with its trigger
 */
export function initOnInteraction(triggerSelector: string, featureName: keyof typeof LazyFeatures): void {
  const trigger = document.querySelector(triggerSelector);
  if (!trigger) return;

  let initialized = false;
  const handler = async () => {
    if (initialized) return;
    initialized = true;
    
    try {
      await LazyFeatures[featureName]();
    } catch (err) {
      console.warn(`Failed to lazy-load ${featureName}:`, err);
    }
    
    // Remove listeners after first use
    trigger.removeEventListener('click', handler);
    trigger.removeEventListener('keydown', handler);
  };

  trigger.addEventListener('click', handler, { once: true, passive: true });
  trigger.addEventListener('keydown', handler, { once: true, passive: true });
}

export { loadedModules };