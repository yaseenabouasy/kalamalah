/**
 * Interactive Quran Reading Tools ported and elevated from test.kalamalah.com:
 * 1. Tajweed Colorizer (printed simplified & alquran detailed schemas)
 * 2. Diacritics / Tashkeel Filter (all, basic-only, no-waqf, rasm-only)
 * 3. Memorization Test Mode (word/ayah hiding at 25%, 50%, 75%, 100% density + tap-to-reveal)
 * 4. Strictly 3 Reading Fonts (Uthmani, Amiri, Kitab) + Font Size Stepper
 * 5. Bookmarks & Floating Reading Progress Tracker
 */

import { escapeHtml, getActiveLocale, isRtlLocale, t, formatLocaleDigits } from './i18n';
import {
  fetchTajweedAnnotations,
  applyTajweedToWord,
  clearTajweedCache,
  type TajweedAyahAnnotation,
} from './tajweed-data';

export type ReadingFont = 'uthmani' | 'nastaleeq' | 'kitab' | 'amiri';
export type TajweedSchema = 'printed' | 'alquran';
export type TashkeelPreset = 'all' | 'basic-only' | 'no-waqf' | 'rasm-only';

interface SavedBookmark {
  surahNumber: number;
  surahNameAr: string;
  ayahNumber: number;
  snippet: string;
  savedAt: number;
}

const BOOKMARKS_KEY = 'kalamalah_bookmarks_v1';
const LAST_READ_KEY = 'kalamalah_last_read_v1';

// AbortController for cleaning up listeners on re-init (soft nav)
let readingToolsController: AbortController | null = null;

// Reference to refreshAllWordsRender, set during initReadingTools so
// setTajweedContext can trigger re-render when tajweed data loads.
let refreshAllWordsRenderFn: (() => void) | null = null;

// Tajweed data from quran.islamonline.net (scholar-reviewed)
let currentSurahNumber: number | null = null;
let currentReciterSlug: string | null = null;
let currentAyahTajweed: Map<number, TajweedAyahAnnotation> = new Map();
let tajweedDataLoaded = false;

/**
 * Set the current surah and reciter, and preload tajweed data.
 * Call this from quran-player.ts when the surah or reciter changes.
 */
export function setTajweedContext(surahNumber: number, reciterSlug: string): void {
  if (currentSurahNumber === surahNumber && currentReciterSlug === reciterSlug) return;
  currentSurahNumber = surahNumber;
  currentReciterSlug = reciterSlug;
  tajweedDataLoaded = false;
  currentAyahTajweed = new Map();

  // Preload tajweed data (non-blocking)
  void fetchTajweedAnnotations(reciterSlug, surahNumber).then((annotation) => {
    if (annotation) {
      for (const ayah of annotation.ayahs) {
        currentAyahTajweed.set(ayah.ayah, ayah);
      }
      tajweedDataLoaded = true;
      // Re-render with new tajweed data
      refreshAllWordsRenderFn?.();
    }
  });
}

/**
 * Get tajweed annotation for a specific ayah (null if not loaded yet).
 */
export function getTajweedForAyah(ayahNumber: number): TajweedAyahAnnotation | null {
  return currentAyahTajweed.get(ayahNumber) ?? null;
}

/**
 * Applies Tajweed color markup to an Arabic word without breaking ligatures.
 */
export function colorizeArabicWordTajweed(word: string, schema: TajweedSchema): string {
  const colors =
    schema === 'printed'
      ? {
          madd: '#dc2626',
          ghunnah: '#16a34a',
          qalqalah: '#0284c7',
          tafkheem: '#2563eb',
        }
      : {
          madd: '#ef4444',
          ghunnah: '#22c55e',
          qalqalah: '#38bdf8',
          tafkheem: '#f59e0b',
        };

  // Group into Arabic grapheme clusters: base character + any trailing combining diacritics
  const clusters: string[] = [];
  for (const ch of word) {
    const code = ch.charCodeAt(0);
    const isCombining =
      (code >= 0x0610 && code <= 0x061a) ||
      (code >= 0x064b && code <= 0x065f) ||
      code === 0x0670 ||
      (code >= 0x06d6 && code <= 0x06ed) ||
      (code >= 0x08d3 && code <= 0x08ff);
    if (isCombining && clusters.length > 0) {
      clusters[clusters.length - 1] += ch;
    } else {
      clusters.push(ch);
    }
  }

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return clusters
    .map((cluster, idx) => {
      const base = cluster[0] ?? '';
      const nextCluster = clusters[idx + 1] ?? '';
      const nextBase = nextCluster[0] ?? '';
      let color: string | null = null;

      // 1. Madd: cluster contains maddah (\u0653) or dagger alif (\u0670), or is a long vowel followed by hamza/maddah
      if (
        /[\u0653\u0670\u06E4]/.test(cluster) ||
        (['ا', 'و', 'ي', 'ى', 'ٱ'].includes(base) && /[\u0653]/.test(nextCluster))
      ) {
        color = colors.madd;
      }
      // 2. Ghunnah / Idgham / Ikhfa: Noon or Meem with Shaddah, or Noon sakinah / Tanween before Ghunnah/Ikhfa letters
      else if (
        (/[نم]/.test(base) && /\u0651/.test(cluster)) ||
        (base === 'ن' && (!/[\u064E\u064F\u0650]/.test(cluster) || /\u0652/.test(cluster))) ||
        /[\u064B\u064C\u064D\u06E2\u06ED]/.test(cluster) ||
        (['ي', 'ن', 'م', 'و'].includes(base) && /\u0651/.test(cluster) && idx > 0)
      ) {
        color = colors.ghunnah;
      }
      // 3. Qalqalah: Qutb Jad (ق ط ب ج د) with Sukoon (\u0652 or \u06E1) or at the end of the word
      else if (
        /[قطبجد]/.test(base) &&
        (/[\u0652\u06E1]/.test(cluster) || idx === clusters.length - 1)
      ) {
        color = colors.qalqalah;
      }
      // 4. Tafkheem (Heavy letters: خ ص ض غ ط ق ظ, or Ra with fatha/damma)
      else if (
        /[خصضغطقظ]/.test(base) ||
        (base === 'ر' && /[\u064E\u064F\u064B\u064C]/.test(cluster))
      ) {
        color = colors.tafkheem;
      }

      const esc = escape(cluster);
      return color ? `<span class="tj-char" style="color:${color}">${esc}</span>` : esc;
    })
    .join('');
}

/**
 * Wraps sukoon (U+0652) in a span with Kitab font to fix rendering issues
 * in Uthmani and Nastaleeq fonts where sukoon may not render correctly.
 */
function wrapSukoonInKitab(html: string): string {
  // Match sukoon character (U+0652) that's not already wrapped
  return html.replace(/([\u0652])/g, '<span class="sukoon-kitab" style="font-family:var(--font-kitab, \'Kitab\', serif);font-size:0.85em;line-height:1;">$1</span>');
}

/**
 * Normalizes Quran text for fonts whose glyph tables do not include Tanzil's extended
 * Unicode 06DF/06E0/06EA..06ED annotations (which otherwise render as dotted-circle
 * or ۞ rub-el-hizb placeholders in KFGQPC UthmanicHafs_V22 and KFGQPCNastaleeq).
 */
export function normalizeQuranTextForFont(rawWord: string, font: ReadingFont): string {
  if (font === 'kitab' || font === 'amiri') {
    return rawWord;
  }
  if (font === 'nastaleeq') {
    return rawWord
      // Replace Alif Wasla (ٱ U+0671) with standard Alif (ا U+0627) for IndoPak Nastaleeq
      .replace(/\u0671/g, '\u0627')
      // Strip Tanzil extended annotations unsupported in KFGQPCNastaleeq
      .replace(/[\u06DF\u06E0\u06E2\u06E5\u06E6\u06EA-\u06ED]/g, '');
  }
  // For 'uthmani' (UthmanicHafs_V22 + Uthmani): strip the unsupported Tanzil extended marks (\u06DF, \u06E0, \u06EA-\u06ED)
  return rawWord.replace(/[\u06DF\u06E0\u06EA-\u06ED]/g, '');
}

/**
 * Filters diacritics (Tashkeel) and Waqf signs on an Arabic word according to preset.
 */
export function filterWordDiacritics(rawWord: string, preset: TashkeelPreset): string {
  if (preset === 'all') return rawWord;
  if (preset === 'no-waqf') {
    return rawWord.replace(/[\u06D6-\u06ED]/g, '');
  }
  if (preset === 'basic-only') {
    return rawWord.replace(/[\u0653-\u065F\u0670\u06D6-\u06ED]/g, '');
  }
  if (preset === 'rasm-only') {
    return rawWord.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
  }
  return rawWord;
}

export function initReadingTools(): void {
  // Abort previous listeners to prevent leaks on soft navigation
  readingToolsController?.abort();
  readingToolsController = new AbortController();
  const signal = readingToolsController.signal;

  let tajweedEnabled = localStorage.getItem('kalamalah_tajweed_enabled') === '1';
  let currentTajweedSchema: TajweedSchema = 'printed';
  let currentTashkeelPreset: TashkeelPreset = 'all';
  let currentMemoDensity = 0;
  let currentReadingFont: ReadingFont = (localStorage.getItem('kalamalah_reading_font') || 'uthmani') as ReadingFont;
  let fontSizePercent = Number(localStorage.getItem('kalamalah_font_scale') || 100);
  let diacriticsEnabled = localStorage.getItem('kalamalah_diacritics_enabled') === '1';
  let memorizationEnabled = localStorage.getItem('kalamalah_memorization_enabled') === '1';

  const wordEls = () => Array.from(document.querySelectorAll<HTMLElement>('.quran-word'));

  function refreshAllWordsRender(): void {
    const words = wordEls();
    words.forEach((el, idx) => {
      const raw = el.getAttribute('data-raw-word') || el.textContent || '';
      const fontNormalized = normalizeQuranTextForFont(raw, currentReadingFont);
      const filtered = filterWordDiacritics(fontNormalized, currentTashkeelPreset);

      if (tajweedEnabled) {
        let html: string;
        // Try server tajweed data first (quran.islamonline.net), fall back to heuristic
        const ayahNum = Number(el.getAttribute('data-ayah') || 0);
        const ayahTajweed = ayahNum > 0 ? getTajweedForAyah(ayahNum) : null;
        if (ayahTajweed && tajweedDataLoaded) {
          const result = applyTajweedToWord(filtered, idx, ayahTajweed, escapeHtml);
          html = result.html;
          // If no tajweed annotations for this word, fall back to heuristic
          if (!result.hasTajweed) {
            html = colorizeArabicWordTajweed(filtered, currentTajweedSchema);
          }
        } else {
          html = colorizeArabicWordTajweed(filtered, currentTajweedSchema);
        }
        // Fix sukoon rendering for Uthmani/Nastaleeq by wrapping in Kitab font
        if (currentReadingFont !== 'kitab' && currentReadingFont !== 'amiri') {
          html = wrapSukoonInKitab(html);
        }
        el.innerHTML = html;
      } else {
        let text = filtered;
        // Fix sukoon rendering for Uthmani/Nastaleeq
        if (currentReadingFont !== 'kitab' && currentReadingFont !== 'amiri') {
          el.innerHTML = wrapSukoonInKitab(escapeHtml(text));
        } else {
          el.textContent = text;
        }
      }

      if (currentMemoDensity > 0) {
        const hash = ((idx * 2654435761) >>> 0) % 100;
        const shouldHide = hash < currentMemoDensity * 100;
        el.classList.toggle('memo-hidden-word', shouldHide);
        el.classList.remove('memo-revealed-word');
      } else {
        el.classList.remove('memo-hidden-word', 'memo-revealed-word');
      }
    });
  }

  refreshAllWordsRenderFn = refreshAllWordsRender;

  // Click to reveal hidden word in Memorization Mode
  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('.quran-word.memo-hidden-word');
    if (target) {
      e.stopPropagation();
      target.classList.toggle('memo-revealed-word');
    }
  }, { signal });

  // 0. Collapsible Reading Toolbar Section
  const toolbarSection = document.getElementById('reading-toolbar-section');
  const toolbarToggleBtn = document.getElementById('reading-toolbar-toggle-btn');
  const filterShortcutBtn = document.getElementById('surah-filter-shortcut-btn');

  const setToolbarCollapsed = (collapsed: boolean) => {
    if (!toolbarSection) return;
    toolbarSection.classList.toggle('is-collapsed', collapsed);
    toolbarToggleBtn?.setAttribute('aria-expanded', String(!collapsed));
    localStorage.setItem('kalamalah_reading_toolbar_collapsed', collapsed ? '1' : '0');
  };

  const isSavedCollapsed = localStorage.getItem('kalamalah_reading_toolbar_collapsed') === '1';
  if (isSavedCollapsed) {
    setToolbarCollapsed(true);
  }

  toolbarToggleBtn?.addEventListener('click', () => {
    const isNowCollapsed = !toolbarSection?.classList.contains('is-collapsed');
    setToolbarCollapsed(isNowCollapsed);
  }, { signal });

  filterShortcutBtn?.addEventListener('click', () => {
    setToolbarCollapsed(false);
    const rangeToggle = document.getElementById('range-filter-toggle');
    const rangePanel = document.getElementById('range-settings-panel');
    if (rangePanel?.classList.contains('hidden')) {
      rangeToggle?.click();
    }
    toolbarSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, { signal });

  // 1. Reading Fonts Switcher (Uthmani, Kitab, Amiri, and Nastaleeq last)
  const rawSavedFont = localStorage.getItem('kalamalah_reading_font') || 'kitab';
  const savedFont = (['uthmani', 'kitab', 'amiri', 'nastaleeq'].includes(rawSavedFont)
    ? rawSavedFont
    : 'kitab') as ReadingFont;
  const setReadingFont = (font: ReadingFont) => {
    if (!['uthmani', 'kitab', 'amiri', 'nastaleeq'].includes(font)) return;
    currentReadingFont = font;
    document.documentElement.setAttribute('data-reading-font', font);
    localStorage.setItem('kalamalah_reading_font', font);
    document.querySelectorAll<HTMLElement>('[data-set-reading-font]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-set-reading-font') === font);
    });
    refreshAllWordsRender();
  };
  setReadingFont(savedFont);

  document.querySelectorAll<HTMLElement>('[data-set-reading-font]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const font = btn.getAttribute('data-set-reading-font') as ReadingFont;
      setReadingFont(font);
    }, { signal });
  });

  // Sync with mobile sidebar reading font dropdown
  window.addEventListener('kalamalah:reading-font-changed', (e: Event) => {
    const ce = e as CustomEvent<{ font: ReadingFont }>;
    setReadingFont(ce.detail.font);
  }, { signal });

  // 2. Font Size Stepper
  const fontValEl = document.getElementById('font-size-val');
  const applyFontScale = (scale: number) => {
    fontSizePercent = Math.max(75, Math.min(160, scale));
    document.documentElement.style.setProperty('--quran-font-scale', (fontSizePercent / 100).toFixed(2));
    if (fontValEl) fontValEl.textContent = `${fontSizePercent}%`;
    localStorage.setItem('kalamalah_font_scale', String(fontSizePercent));
  };
  applyFontScale(fontSizePercent);

  document.getElementById('font-size-dec')?.addEventListener('click', () => applyFontScale(fontSizePercent - 10), { signal });
  document.getElementById('font-size-inc')?.addEventListener('click', () => applyFontScale(fontSizePercent + 10), { signal });

  // Sync with the shared Settings sheet
  window.addEventListener('kalamalah:font-scale-changed', (e: Event) => {
    const scale = Number((e as CustomEvent<{ scale: number }>).detail?.scale);
    if (Number.isFinite(scale)) applyFontScale(scale);
  }, { signal });

  // 3. View Mode Switcher (Cards / Continuous Mushaf / With Inline Tafseer)
  const wrapperEl = document.getElementById('surah-ayahs-wrapper');
  document.querySelectorAll<HTMLElement>('[data-reader-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-reader-view') || 'cards';
      document.querySelectorAll('[data-reader-view]').forEach((b) => b.classList.toggle('active', b === btn));
      if (wrapperEl) {
        wrapperEl.classList.toggle('mushaf-flow-mode', mode === 'mushaf-flow');
      }
      document.querySelectorAll<HTMLElement>('.ayah-inline-tafseer').forEach((tf) => {
        tf.classList.toggle('hidden', mode !== 'tafseer-open');
      });
    }, { signal });
  });

  // 4. Tajweed Color Toggle & Subpanel
  const tajweedToggleBtn = document.getElementById('tajweed-color-toggle');
  const tajweedPanel = document.getElementById('tajweed-settings-panel');
  tajweedToggleBtn?.addEventListener('click', () => {
    tajweedEnabled = !tajweedEnabled;
    localStorage.setItem('kalamalah_tajweed_enabled', tajweedEnabled ? '1' : '0');
    tajweedToggleBtn.classList.toggle('active', tajweedEnabled);
    tajweedToggleBtn.setAttribute('aria-pressed', String(tajweedEnabled));
    tajweedPanel?.classList.toggle('hidden', !tajweedEnabled);
    refreshAllWordsRender();
  }, { signal });

  // Sync with mobile sidebar tajweed toggle
  window.addEventListener('kalamalah:tajweed-changed', (e: Event) => {
    const ce = e as CustomEvent<{ enabled: boolean }>;
    tajweedEnabled = ce.detail.enabled;
    tajweedToggleBtn?.classList.toggle('active', tajweedEnabled);
    tajweedToggleBtn?.setAttribute('aria-pressed', String(tajweedEnabled));
    tajweedPanel?.classList.toggle('hidden', !tajweedEnabled);
    refreshAllWordsRender();
  }, { signal });

  document.querySelectorAll<HTMLElement>('[data-tajweed-schema]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTajweedSchema = (btn.getAttribute('data-tajweed-schema') as TajweedSchema) || 'printed';
      document.querySelectorAll('[data-tajweed-schema]').forEach((b) => b.classList.toggle('active', b === btn));
      refreshAllWordsRender();
    }, { signal });
  });

  // 5. Diacritics Panel & Presets
  const diacriticsBtn = document.getElementById('diacritics-panel-toggle');
  const diacriticsPanel = document.getElementById('diacritics-settings-panel');
  diacriticsBtn?.addEventListener('click', () => {
    const hidden = diacriticsPanel?.classList.toggle('hidden');
    diacriticsBtn.classList.toggle('active', !hidden);
    localStorage.setItem('kalamalah_diacritics_enabled', (!hidden) ? '1' : '0');
  }, { signal });

  // Sync with mobile sidebar diacritics toggle
  window.addEventListener('kalamalah:diacritics-changed', (e: Event) => {
    const ce = e as CustomEvent<{ enabled: boolean }>;
    const hidden = ce.detail.enabled ? false : true;
    diacriticsPanel?.classList.toggle('hidden', hidden);
    diacriticsBtn?.classList.toggle('active', ce.detail.enabled);
  }, { signal });

  document.querySelectorAll<HTMLElement>('[data-tashkeel-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTashkeelPreset = (btn.getAttribute('data-tashkeel-preset') as TashkeelPreset) || 'all';
      document.querySelectorAll('[data-tashkeel-preset]').forEach((b) => b.classList.toggle('active', b === btn));
      refreshAllWordsRender();
    }, { signal });
  });

  window.addEventListener('kalamalah:tashkeel-changed', (e: Event) => {
    const preset = (e as CustomEvent<{ preset: TashkeelPreset }>).detail?.preset || 'all';
    currentTashkeelPreset = preset;
    document.querySelectorAll<HTMLElement>('[data-tashkeel-preset]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-tashkeel-preset') === preset);
    });
    refreshAllWordsRender();
  }, { signal });

  // 6. Memorization Panel & Density
  const memoBtn = document.getElementById('memorization-panel-toggle');
  const memoPanel = document.getElementById('memorization-settings-panel');
  memoBtn?.addEventListener('click', () => {
    const hidden = memoPanel?.classList.toggle('hidden');
    memoBtn.classList.toggle('active', !hidden);
    localStorage.setItem('kalamalah_memorization_enabled', (!hidden) ? '1' : '0');
  }, { signal });

  // Sync with mobile sidebar memorization toggle
  window.addEventListener('kalamalah:memorization-changed', (e: Event) => {
    const ce = e as CustomEvent<{ enabled: boolean }>;
    const hidden = ce.detail.enabled ? false : true;
    memoPanel?.classList.toggle('hidden', hidden);
    memoBtn?.classList.toggle('active', ce.detail.enabled);
  }, { signal });

  document.querySelectorAll<HTMLElement>('[data-memo-density]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentMemoDensity = Number(btn.getAttribute('data-memo-density') || 0);
      document.querySelectorAll('[data-memo-density]').forEach((b) => b.classList.toggle('active', b === btn));
      refreshAllWordsRender();
    }, { signal });
  });

  document.getElementById('memo-reveal-all-btn')?.addEventListener('click', () => {
    wordEls().forEach((w) => w.classList.add('memo-revealed-word'));
  }, { signal });

  // 7. Range Filter & In-Surah Search Panel
  const rangeToggleBtn = document.getElementById('range-filter-toggle');
  const rangePanel = document.getElementById('range-settings-panel');
  rangeToggleBtn?.addEventListener('click', () => {
    const hidden = rangePanel?.classList.toggle('hidden');
    rangeToggleBtn.classList.toggle('active', !hidden);
  }, { signal });

  document.getElementById('apply-range-btn')?.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLElement;
    const sNum = btn.getAttribute('data-surah') || '1';
    const fromVal = (document.getElementById('range-from-input') as HTMLInputElement | null)?.value || '1';
    const toVal = (document.getElementById('range-to-input') as HTMLInputElement | null)?.value || '7';
    window.location.href = `/view-${sNum},from-${fromVal},to-${toVal}`;
  }, { signal });

  const inSurahInput = document.getElementById('in-surah-search-input') as HTMLInputElement | null;
  inSurahInput?.addEventListener('input', () => {
    const q = inSurahInput.value.trim();
    document.querySelectorAll<HTMLElement>('.ayah-block').forEach((card) => {
      const raw = card.getAttribute('data-raw-arabic') || '';
      const num = card.getAttribute('data-ayah') || '';
      const stripped = filterWordDiacritics(raw, 'rasm-only');
      const match = !q || raw.includes(q) || stripped.includes(q) || num === q;
      card.style.display = match ? '' : 'none';
    });
  }, { signal });

  // 8. Copy Ayah, Bookmark Ayah, & Reading Tracker
  initBookmarksAndTracker(signal);
}

function getBookmarks(): SavedBookmark[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBookmarks(list: SavedBookmark[]): void {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list));
  } catch {}
}

export function toggleBookmarkAyah(surahNumber: number, surahNameAr: string, ayahNumber: number, snippet: string): boolean {
  const list = getBookmarks();
  const existingIdx = list.findIndex((b) => b.surahNumber === surahNumber && b.ayahNumber === ayahNumber);
  let added = false;
  if (existingIdx !== -1) {
    list.splice(existingIdx, 1);
  } else {
    list.unshift({
      surahNumber,
      surahNameAr,
      ayahNumber,
      snippet: snippet.slice(0, 90),
      savedAt: Date.now(),
    });
    added = true;
  }
  saveBookmarks(list);
  renderBookmarksModalList();
  return added;
}

function renderBookmarksModalList(): void {
  const container = document.getElementById('bookmarks-list-container');
  if (!container) return;
  const list = getBookmarks();
  if (list.length === 0) {
    container.innerHTML = `<p class="empty-hint">لا توجد علامات مرجعية محفوظة بعد. اضغط على أيقونة الحفظ بجانب أي آية لإضافتها هنا.</p>`;
    return;
  }

  container.innerHTML = list
    .map(
      (b, idx) => `<div class="bookmark-item-row">
        <a href="/surah-${Number(b.surahNumber) || 1}#ayah-${Number(b.ayahNumber) || 1}" class="bm-link">
          <strong>سورة ${escapeHtml(String(b.surahNameAr ?? ''))}، الآية ${Number(b.ayahNumber) || 1}</strong>
          <p class="quran-reading-text">${escapeHtml(String(b.snippet ?? ''))}...</p>
        </a>
        <button type="button" class="bm-remove-btn" data-remove-bm="${idx}" aria-label="حذف العلامة">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>`
    )
    .join('\n');

  container.querySelectorAll<HTMLElement>('[data-remove-bm]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-remove-bm'));
      const current = getBookmarks();
      current.splice(idx, 1);
      saveBookmarks(current);
      renderBookmarksModalList();
    });
  });
}

export function initBookmarksAndTracker(signal: AbortSignal): void {
  renderBookmarksModalList();

  document.getElementById('open-bookmarks-btn')?.addEventListener('click', () => {
    renderBookmarksModalList();
    document.getElementById('bookmarksModal')?.classList.remove('hidden');
  }, { signal });

  const wrapper = document.getElementById('surah-ayahs-wrapper');
  const surahNum = Number(wrapper?.getAttribute('data-surah-number') || 0);
  const surahNameAr = wrapper?.getAttribute('data-surah-name-ar') || '';
  const surahNameEn = wrapper?.getAttribute('data-surah-name-en') || '';

  // Copy & Bookmark buttons on Ayah cards
  document.addEventListener('click', (e) => {
    const copyBtn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-copy-ayah]');
    if (copyBtn) {
      const w = document.getElementById('surah-ayahs-wrapper');
      const sNameAr = w?.getAttribute('data-surah-name-ar') || '';
      const ayahNum = copyBtn.getAttribute('data-copy-ayah');
      const card = document.getElementById(`ayah-${ayahNum}`);
      const text = card?.getAttribute('data-raw-arabic') || '';
      if (text) {
        navigator.clipboard?.writeText(`${text} ﴿سورة ${sNameAr}: ${ayahNum}﴾`);
        const span = copyBtn.querySelector('span');
        if (span) {
          const prev = span.textContent;
          span.textContent = 'تم النسخ';
          setTimeout(() => {
            span.textContent = prev;
          }, 1600);
        }
      }
      return;
    }

    const bmBtn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-bookmark-ayah]');
    const w = document.getElementById('surah-ayahs-wrapper');
    const sNum = Number(w?.getAttribute('data-surah-number') || 0);
    const sNameAr = w?.getAttribute('data-surah-name-ar') || '';
    if (bmBtn && sNum > 0) {
      const ayahNum = Number(bmBtn.getAttribute('data-bookmark-ayah') || 1);
      const card = document.getElementById(`ayah-${ayahNum}`);
      const text = card?.getAttribute('data-raw-arabic') || '';
      const isAdded = toggleBookmarkAyah(sNum, sNameAr, ayahNum, text);
      bmBtn.classList.toggle('active', isAdded);
    }
  }, { signal });

  // Reading Tracker banner restoration
  const trackerEl = document.getElementById('reading-tracker');
  const trackerLabel = document.getElementById('rt-label');
  const trackerLink = document.getElementById('rt-continue-link') as HTMLAnchorElement | null;

  try {
    const savedRaw = localStorage.getItem(LAST_READ_KEY);
    if (savedRaw && trackerEl && trackerLabel && trackerLink) {
      const parsed = JSON.parse(savedRaw);
      if (parsed?.surahNumber && parsed?.surahNameAr) {
        const loc = getActiveLocale();
        const sName = isRtlLocale(loc) ? parsed.surahNameAr : parsed.surahNameEn || parsed.surahNameAr;
        trackerLabel.textContent = `${t('surahPrefix', loc)} ${sName}, ${t('ayahPrefix', loc)} ${formatLocaleDigits(parsed.ayahNumber || 1, loc)}`;
        trackerLink.href = `/surah-${parsed.surahNumber}#ayah-${parsed.ayahNumber || 1}`;
        trackerEl.classList.remove('hidden');
      }
    }
  } catch {}

  document.getElementById('rt-dismiss-btn')?.addEventListener('click', () => {
    trackerEl?.classList.add('hidden');
  }, { signal });

  // Save current reading position when scrolling through a Surah
  if (surahNum > 0 && surahNameAr) {
    // Use IntersectionObserver instead of scroll + getBoundingClientRect to avoid forced reflows
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const b = entry.target as HTMLElement;
          const aNum = Number(b.getAttribute('data-ayah') || 1);
          localStorage.setItem(
            LAST_READ_KEY,
            JSON.stringify({ surahNumber: surahNum, surahNameAr, surahNameEn, ayahNumber: aNum })
          );
          break;
        }
      }
    }, {
      rootMargin: '-60px 0px -40% 0px',
      threshold: 0
    });

    const blocks = document.querySelectorAll<HTMLElement>('.ayah-block');
    for (const b of Array.from(blocks)) {
      observer.observe(b);
    }
  }
}
