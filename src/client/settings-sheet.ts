/**
 * Settings sheet shared by desktop (right drawer) and mobile (bottom sheet).
 * Every control writes to localStorage and broadcasts a CustomEvent so the
 * reading toolbar, the fullscreen player and the scene mixer stay in sync
 * without duplicating state.
 */

export type SceneId = 'islamic' | 'rain' | 'forest' | 'dybg' | 'off';
export type DisplayModeId = 'default' | 'cinematic';

export const SETTINGS_KEYS = {
  fontScale: 'kalamalah_font_scale',
  readingFont: 'kalamalah_reading_font',
  quranView: 'kalamalah_quran_view',
  translation: 'kalamalah_fs_translation',
  tajweed: 'kalamalah_tajweed_enabled',
  tashkeel: 'kalamalah_tashkeel_preset',
  displayMode: 'kalamalah_display_mode',
  scene: 'kalamalah_fs_bg_mode',
  reduceMotion: 'kalamalah_reduce_motion',
  quranVolume: 'kalamalah_quran_volume',
  ambientVolume: 'kalamalah_ambient_volume',
} as const;

export function readSetting(key: string, fallback = ''): string {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function readFlag(key: string, fallback = true): boolean {
  const raw = readSetting(key, fallback ? '1' : '0');
  return raw !== '0';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function broadcast(name: string, detail: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function settingsDict(): Record<string, string> {
  return {
    settingsTitle: 'الإعدادات',
    settingsSubtitle: 'النص والعرض والخلفية',
    settingsText: 'النص',
    settingsDisplay: 'العرض',
    settingsBackground: 'الخلفية والصوت',
    fontSize: 'حجم الخط',
    fontFamily: 'نوع الخط',
    quranView: 'عرض نص القرآن',
    translation: 'الترجمة',
    tajweed: 'ألوان التجويد',
    diacritics: 'التشكيل',
    diacriticsAll: 'كامل',
    diacriticsRasm: 'الرسم فقط',
    displayMode: 'وضع العرض',
    displayDefault: 'افتراضي',
    displayCinematic: 'سينمائي',
    scene: 'مشهد الخلفية',
    sceneIslamic: 'الكعبة والحرمين',
    sceneRain: 'مطر',
    sceneForest: 'غابة',
    sceneDynamic: 'ديناميكية',
    sceneOff: 'بدون خلفية',
    reduceMotion: 'تقليل الحركة',
    quranVolume: 'صوت التلاوة',
    backgroundSound: 'الصوت الخلفي',
    resetDefaults: 'استعادة الافتراضي',
    settingsSaved: 'تم الحفظ',
  };
}

let globalBound = false;

export function initSettingsSheet(): void {
  const root = document.getElementById('settingsSheet');
  if (!root) return;

  const dict = settingsDict();
  root.querySelectorAll<HTMLElement>('[data-settings-label]').forEach((el) => {
    const key = el.getAttribute('data-settings-label') || '';
    if (dict[key]) el.textContent = dict[key];
  });

  const sheet = root.querySelector<HTMLElement>('.settings-sheet');
  const closeBtn = root.querySelector<HTMLElement>('[data-settings-close]');

  // ── Elements ────────────────────────────────────────────────────────────
  const fontScaleInput = document.getElementById('settings-font-scale') as HTMLInputElement | null;
  const fontScaleOut = document.getElementById('settings-font-scale-val');
  const fontBtns = root.querySelectorAll<HTMLElement>('[data-settings-font]');

  const quranViewInput = document.getElementById('settings-quran-view') as HTMLInputElement | null;
  const translationInput = document.getElementById('settings-translation') as HTMLInputElement | null;
  const tajweedInput = document.getElementById('settings-tajweed') as HTMLInputElement | null;
  const tashkeelBtns = root.querySelectorAll<HTMLElement>('[data-settings-tashkeel]');
  const displayModeBtns = root.querySelectorAll<HTMLElement>('[data-settings-display-mode]');

  const sceneBtns = root.querySelectorAll<HTMLElement>('[data-settings-scene]');
  const reduceMotionInput = document.getElementById('settings-reduce-motion') as HTMLInputElement | null;
  const quranVolumeInput = document.getElementById('settings-quran-volume') as HTMLInputElement | null;
  const quranVolumeOut = document.getElementById('settings-quran-volume-val');
  const ambientVolumeInput = document.getElementById('settings-ambient-volume') as HTMLInputElement | null;
  const ambientVolumeOut = document.getElementById('settings-ambient-volume-val');

  // ── Open / close ────────────────────────────────────────────────────────
  let lastFocus: HTMLElement | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  const focusables = (): HTMLElement[] => {
    if (!sheet) return [];
    return Array.from(
      sheet.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null || el === closeBtn);
  };

  const openSheet = () => {
    if (!root.classList.contains('hidden') && root.classList.contains('is-open')) return;
    if (closeTimer) clearTimeout(closeTimer);
    lastFocus = document.activeElement as HTMLElement | null;
    syncFromStorage();
    root.classList.remove('hidden');
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('settings-sheet-open');
    requestAnimationFrame(() => root.classList.add('is-open'));
    setTimeout(() => closeBtn?.focus(), 40);
  };

  const closeSheet = () => {
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('settings-sheet-open');
    closeTimer = setTimeout(() => root.classList.add('hidden'), 260);
    lastFocus?.focus?.();
  };

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('[data-open-settings]')) {
      e.preventDefault();
      openSheet();
      return;
    }
    if (target.closest('[data-settings-close]') || target === root) {
      closeSheet();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (root.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSheet();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = focusables();
    if (list.length === 0) return;
    const first = list[0]!;
    const last = list[list.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // ── State sync ──────────────────────────────────────────────────────────
  const applyFontScale = (value: number) => {
    const scale = clamp(Math.round(value / 5) * 5, 75, 160);
    writeSetting(SETTINGS_KEYS.fontScale, String(scale));
    document.documentElement.style.setProperty('--quran-font-scale', (scale / 100).toFixed(2));
    if (fontScaleInput) fontScaleInput.value = String(scale);
    if (fontScaleOut) fontScaleOut.textContent = `${scale}%`;
    broadcast('kalamalah:font-scale-changed', { scale });
  };

  const setReadingFont = (font: string) => {
    if (!['uthmani', 'kitab', 'amiri', 'nastaleeq'].includes(font)) return;
    writeSetting(SETTINGS_KEYS.readingFont, font);
    document.documentElement.setAttribute('data-reading-font', font);
    fontBtns.forEach((btn) => btn.classList.toggle('is-active', btn.getAttribute('data-settings-font') === font));
    document.querySelectorAll<HTMLElement>('[data-set-reading-font]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-set-reading-font') === font);
    });
    broadcast('kalamalah:reading-font-changed', { font });
  };

  const setToggleVisual = (input: HTMLInputElement | null, on: boolean) => {
    if (!input) return;
    input.checked = on;
    input.setAttribute('aria-checked', String(on));
  };

  const setQuranView = (on: boolean, notify = true) => {
    writeSetting(SETTINGS_KEYS.quranView, on ? '1' : '0');
    setToggleVisual(quranViewInput, on);
    if (notify) broadcast('kalamalah:quran-view-changed', { enabled: on });
  };

  const setTranslation = (on: boolean, notify = true) => {
    writeSetting(SETTINGS_KEYS.translation, on ? '1' : '0');
    setToggleVisual(translationInput, on);
    if (notify) broadcast('kalamalah:translation-changed', { enabled: on });
  };

  const setTajweed = (on: boolean, notify = true) => {
    writeSetting(SETTINGS_KEYS.tajweed, on ? '1' : '0');
    setToggleVisual(tajweedInput, on);
    if (notify) broadcast('kalamalah:tajweed-changed', { enabled: on });
  };

  const setTashkeel = (preset: string) => {
    writeSetting(SETTINGS_KEYS.tashkeel, preset);
    tashkeelBtns.forEach((btn) =>
      btn.classList.toggle('is-active', btn.getAttribute('data-settings-tashkeel') === preset)
    );
    broadcast('kalamalah:tashkeel-changed', { preset });
  };

  const setDisplayMode = (mode: string, notify = true) => {
    const normalized = mode === 'cinematic' ? 'cinematic' : 'default';
    writeSetting(SETTINGS_KEYS.displayMode, normalized);
    document.documentElement.setAttribute('data-display-mode', normalized);
    displayModeBtns.forEach((btn) =>
      btn.classList.toggle('is-active', btn.getAttribute('data-settings-display-mode') === normalized)
    );
    if (notify) broadcast('kalamalah:display-mode-changed', { mode: normalized });
  };

  const setScene = (scene: string, notify = true) => {
    const allowed: SceneId[] = ['islamic', 'rain', 'forest', 'dybg', 'off'];
    const normalized = (allowed.includes(scene as SceneId) ? scene : 'islamic') as SceneId;
    writeSetting(SETTINGS_KEYS.scene, normalized);
    sceneBtns.forEach((btn) =>
      btn.classList.toggle('is-active', btn.getAttribute('data-settings-scene') === normalized)
    );
    if (notify) broadcast('kalamalah:scene-changed', { scene: normalized });
  };

  const setReduceMotion = (on: boolean, notify = true) => {
    writeSetting(SETTINGS_KEYS.reduceMotion, on ? '1' : '0');
    setToggleVisual(reduceMotionInput, on);
    document.documentElement.toggleAttribute('data-reduce-motion', on);
    if (notify) broadcast('kalamalah:reduce-motion-changed', { enabled: on });
  };

  const setQuranVolume = (value: number, notify = true) => {
    const volume = clamp(value, 0, 1);
    writeSetting(SETTINGS_KEYS.quranVolume, volume.toFixed(2));
    if (quranVolumeInput) quranVolumeInput.value = String(volume);
    if (quranVolumeOut) quranVolumeOut.textContent = `${Math.round(volume * 100)}%`;
    if (notify) broadcast('kalamalah:quran-volume-changed', { volume });
  };

  const setAmbientVolume = (value: number, notify = true) => {
    const volume = clamp(value, 0, 1);
    writeSetting(SETTINGS_KEYS.ambientVolume, volume.toFixed(2));
    if (ambientVolumeInput) ambientVolumeInput.value = String(volume);
    if (ambientVolumeOut) ambientVolumeOut.textContent = `${Math.round(volume * 100)}%`;
    if (notify) broadcast('kalamalah:ambient-volume-changed', { volume });
  };

  function syncFromStorage(): void {
    const scale = clamp(Number(readSetting(SETTINGS_KEYS.fontScale, '100')) || 100, 75, 160);
    if (fontScaleInput) fontScaleInput.value = String(scale);
    if (fontScaleOut) fontScaleOut.textContent = `${scale}%`;

    const font = readSetting(SETTINGS_KEYS.readingFont, 'kitab');
    fontBtns.forEach((btn) => btn.classList.toggle('is-active', btn.getAttribute('data-settings-font') === font));

    setToggleVisual(quranViewInput, readFlag(SETTINGS_KEYS.quranView, true));
    setToggleVisual(translationInput, readFlag(SETTINGS_KEYS.translation, true));
    setToggleVisual(tajweedInput, readFlag(SETTINGS_KEYS.tajweed, false));

    const tashkeel = readSetting(SETTINGS_KEYS.tashkeel, 'all');
    tashkeelBtns.forEach((btn) =>
      btn.classList.toggle('is-active', btn.getAttribute('data-settings-tashkeel') === tashkeel)
    );

    const mode = readSetting(SETTINGS_KEYS.displayMode, 'default');
    displayModeBtns.forEach((btn) =>
      btn.classList.toggle('is-active', btn.getAttribute('data-settings-display-mode') === mode)
    );

    const scene = readSetting(SETTINGS_KEYS.scene, 'islamic');
    sceneBtns.forEach((btn) =>
      btn.classList.toggle('is-active', btn.getAttribute('data-settings-scene') === scene)
    );

    setToggleVisual(reduceMotionInput, readFlag(SETTINGS_KEYS.reduceMotion, false));

    const qv = clamp(Number(readSetting(SETTINGS_KEYS.quranVolume, '1')) || 0, 0, 1);
    if (quranVolumeInput) quranVolumeInput.value = String(qv);
    if (quranVolumeOut) quranVolumeOut.textContent = `${Math.round(qv * 100)}%`;

    const av = clamp(Number(readSetting(SETTINGS_KEYS.ambientVolume, '0.35')) || 0, 0, 1);
    if (ambientVolumeInput) ambientVolumeInput.value = String(av);
    if (ambientVolumeOut) ambientVolumeOut.textContent = `${Math.round(av * 100)}%`;
  }

  // ── Inputs ──────────────────────────────────────────────────────────────
  fontScaleInput?.addEventListener('input', () => applyFontScale(Number(fontScaleInput.value)));
  fontBtns.forEach((btn) =>
    btn.addEventListener('click', () => setReadingFont(btn.getAttribute('data-settings-font') || 'uthmani'))
  );

  quranViewInput?.addEventListener('change', () => setQuranView(quranViewInput.checked));
  translationInput?.addEventListener('change', () => setTranslation(translationInput.checked));
  tajweedInput?.addEventListener('change', () => setTajweed(tajweedInput.checked));

  tashkeelBtns.forEach((btn) =>
    btn.addEventListener('click', () => setTashkeel(btn.getAttribute('data-settings-tashkeel') || 'all'))
  );
  displayModeBtns.forEach((btn) =>
    btn.addEventListener('click', () => setDisplayMode(btn.getAttribute('data-settings-display-mode') || 'default'))
  );
  sceneBtns.forEach((btn) =>
    btn.addEventListener('click', () => setScene(btn.getAttribute('data-settings-scene') || 'islamic'))
  );

  reduceMotionInput?.addEventListener('change', () => setReduceMotion(reduceMotionInput.checked));
  quranVolumeInput?.addEventListener('input', () => setQuranVolume(Number(quranVolumeInput.value)));
  ambientVolumeInput?.addEventListener('input', () => setAmbientVolume(Number(ambientVolumeInput.value)));

  document.getElementById('settings-reset-btn')?.addEventListener('click', () => {
    Object.values(SETTINGS_KEYS).forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {}
    });
    document.documentElement.style.removeProperty('--quran-font-scale');
    document.documentElement.removeAttribute('data-display-mode');
    document.documentElement.removeAttribute('data-reduce-motion');
    const scale = 100;
    document.documentElement.style.setProperty('--quran-font-scale', '1.00');
    if (fontScaleInput) fontScaleInput.value = String(scale);
    if (fontScaleOut) fontScaleOut.textContent = '100%';
    setReadingFont('kitab');
    setQuranView(true);
    setTranslation(true);
    setTajweed(false);
    setTashkeel('all');
    setDisplayMode('default');
    setScene('islamic');
    setReduceMotion(false);
    setQuranVolume(1);
    setAmbientVolume(0.35);
  });

  // Keep the sheet honest when the player or reading toolbar changes state.
  const playerEvents: Array<[string, () => void]> = [
    ['kalamalah:scene-changed', () => {
      const scene = readSetting(SETTINGS_KEYS.scene, 'islamic');
      sceneBtns.forEach((btn) =>
        btn.classList.toggle('is-active', btn.getAttribute('data-settings-scene') === scene)
      );
    }],
    ['kalamalah:quran-view-changed', () => setQuranView(readFlag(SETTINGS_KEYS.quranView, true), false)],
    ['kalamalah:translation-changed', () => setTranslation(readFlag(SETTINGS_KEYS.translation, true), false)],
    ['kalamalah:tajweed-changed', () => setTajweed(readFlag(SETTINGS_KEYS.tajweed, false), false)],
  ];
  playerEvents.forEach(([name, handler]) => window.addEventListener(name, handler));

  // Reflect initial values without broadcasting (no player yet on first paint).
  document.documentElement.toggleAttribute('data-reduce-motion', readFlag(SETTINGS_KEYS.reduceMotion, false));
  const initialScale = clamp(Number(readSetting(SETTINGS_KEYS.fontScale, '100')) || 100, 75, 160);
  document.documentElement.style.setProperty('--quran-font-scale', (initialScale / 100).toFixed(2));
  document.documentElement.setAttribute(
    'data-display-mode',
    readSetting(SETTINGS_KEYS.displayMode, 'default') === 'cinematic' ? 'cinematic' : 'default'
  );

  if (!globalBound) {
    globalBound = true;
    window.addEventListener('kalamalah:open-settings', () => openSheet());
  }
}
