import { applyUiLocale, escapeHtml, getActiveLocale, isRtlLocale, type UiLocale } from './i18n';
import { QuranPlayerController, type BootstrapCatalog } from './quran-player';
import { initReadingTools } from './reading-tools';
import { initWordMeaningPopover } from './word-meaning';
import { SearchableDropdown, type DropdownOption } from './searchable-dropdown';
import {
  fetchSurahApi,
  fetchTafseerAyahApi,
  getDownloadUrl,
  isStaticMode,
} from './static-api';
import { resolveStaticRouteIfNeeded } from './static-router';
// @ts-ignore - AeroUI components have no declaration files
import { initPlayerButtons, setPlayerIcon } from './aeroui/components/player-button/player-button.js';
// @ts-ignore
import { initElasticSliders } from './aeroui/components/elastic-slider/elastic-slider.js';
// @ts-ignore
import { initSkipLabels, playSkip } from './aeroui/components/skip-label/skip-label.js';
// @ts-ignore
import { initSkipButtons, setSkipIcon } from './aeroui/components/skip-button/skip-button.js';
import { initZarazConsent, setZarazConsent, trackPageView } from './zaraz.js';

// Lazy imports for heavy features (code splitting)
import { preloadCriticalFeatures, initOnInteraction, LazyFeatures } from './lazy-imports.js';

function parseBootstrapCatalog(): BootstrapCatalog {
  try {
    const el = document.getElementById('kalamalah-bootstrap');
    if (el?.textContent) {
      return JSON.parse(el.textContent) as BootstrapCatalog;
    }
  } catch {}
  return { surahs: [], reciters: [] };
}

function initThemeController(): void {
  const getBrowserTheme = (): 'dark' | 'light' =>
    window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

  const applyResolvedTheme = (resolved: 'dark' | 'light', persist: boolean) => {
    if (persist) {
      try {
        localStorage.setItem('kalamalah_theme', resolved);
      } catch {}
      document.documentElement.setAttribute('data-theme-mode', resolved);
    } else {
      document.documentElement.setAttribute('data-theme-mode', 'auto');
    }
    document.documentElement.setAttribute('data-theme', resolved);

    document.querySelectorAll<HTMLElement>('[data-set-theme]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-set-theme') === resolved);
    });

    const toggleBtn = document.getElementById('header-theme-btn');
    if (toggleBtn) {
      toggleBtn.setAttribute(
        'title',
        resolved === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'
      );
    }
  };

  let saved: string | null = null;
  try {
    saved = localStorage.getItem('kalamalah_theme');
  } catch {}

  if (saved === 'dark' || saved === 'light') {
    applyResolvedTheme(saved, false);
    document.documentElement.setAttribute('data-theme-mode', saved);
  } else {
    // No saved preference (or legacy 'system'): automatically match browser theme
    applyResolvedTheme(getBrowserTheme(), false);
  }

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    let currentSaved: string | null = null;
    try {
      currentSaved = localStorage.getItem('kalamalah_theme');
    } catch {}
    if (currentSaved !== 'dark' && currentSaved !== 'light') {
      applyResolvedTheme(getBrowserTheme(), false);
    }
  });

  document.getElementById('header-theme-btn')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyResolvedTheme(current === 'dark' ? 'light' : 'dark', true);
  });

  document.querySelectorAll<HTMLElement>('[data-set-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-set-theme');
      if (mode === 'dark' || mode === 'light') {
        applyResolvedTheme(mode, true);
      }
    });
  });
}

function initSearchableDropdowns(
  catalog: BootstrapCatalog,
  player: QuranPlayerController
): { syncReciterDropdowns: (slug: string) => void } {
  const surahOptions: DropdownOption[] = catalog.surahs.map((s) => ({
    value: String(s.n),
    label: `${s.n}. سورة ${s.ar} (${s.en})`,
    group: s.rev === 'مكية' ? 'السور المكية (Meccan)' : 'السور المدنية (Medinan)',
    searchText: `${s.n} ${s.ar} ${s.en}`,
  }));

  const reciterOptions: DropdownOption[] = catalog.reciters.map((r) => ({
    value: r.slug,
    label: `${r.ar} (${r.en})`,
    group: r.wbw
      ? 'مزامنة كلمة بكلمة (Word-by-Word)'
      : r.cc
        ? 'مزامنة الآيات (CC Timings)'
        : 'المصحف المرتل الكامل',
    searchText: `${r.ar} ${r.en} ${r.riwayah}`,
  }));

  const reciterDropdownInstances: SearchableDropdown[] = [];

  // 1. Bottom Player Bar Reciter Selector
  const barReciterEl = document.getElementById('qp-bar-reciter-dropdown');
  if (barReciterEl) {
    const dd = new SearchableDropdown(barReciterEl, {
      options: reciterOptions,
      placeholder: 'اختر القارئ...',
      searchPlaceholder: 'ابحث عن قارئ...',
      initial: [player.getCurrentReciterSlug()],
      clearable: false,
      showFooterHints: false,
      onChange: (vals) => {
        if (vals[0]) {
          player.setReciter(vals[0], false);
        }
      },
    });
    reciterDropdownInstances.push(dd);
  }

  // 3. Surah Hero Reciter Selector (on /surah-:id)
  const surahReciterEl = document.getElementById('surah-reciter-dropdown');
  if (surahReciterEl) {
    const initialSlug = catalog.pageData?.initialReciterSlug || player.getCurrentReciterSlug();
    const heroPlayBtnInit = document.getElementById('surah-hero-play-btn');
    if (heroPlayBtnInit) heroPlayBtnInit.setAttribute('data-play-reciter', initialSlug);
    const dd = new SearchableDropdown(surahReciterEl, {
      options: reciterOptions,
      placeholder: 'اختر القارئ...',
      searchPlaceholder: 'ابحث عن قارئ...',
      initial: [initialSlug],
      clearable: false,
      onChange: (vals) => {
        if (vals[0]) {
          player.setReciter(vals[0], true);
          const heroPlayBtn = document.getElementById('surah-hero-play-btn');
          if (heroPlayBtn) heroPlayBtn.setAttribute('data-play-reciter', vals[0]);
          const heroReciterDisplay = document.getElementById('hero-reciter-name-display');
          const matched = catalog.reciters.find((r) => r.slug === vals[0]);
          if (heroReciterDisplay && matched) {
            heroReciterDisplay.textContent = isRtlLocale(getActiveLocale()) ? matched.ar : matched.en;
          }
        }
      },
    });
    reciterDropdownInstances.push(dd);
  }

  // 4. Home Mushaf Page Jumper & Mushaf Viewer Page Jumper
  const pageOptions: DropdownOption[] = Array.from({ length: 604 }, (_, i) => {
    const p = i + 1;
    const juz = Math.min(30, Math.ceil(p / 20));
    return {
      value: String(p),
      label: `صفحة ${p} (الجزء ${juz})`,
      group: `الجزء ${juz}`,
      searchText: `صفحة ${p} page ${p} juz ${juz}`,
    };
  });

  const homeMushafEl = document.getElementById('home-mushaf-page-dropdown');
  if (homeMushafEl) {
    new SearchableDropdown(homeMushafEl, {
      options: pageOptions,
      placeholder: 'انتقل إلى صفحة (1 - 604)...',
      searchPlaceholder: 'اكتب رقم الصفحة (مثال: 293)...',
      clearable: false,
      onChange: (vals) => {
        if (vals[0]) window.location.href = `/mushaf-${vals[0]}`;
      },
    });
  }

  const mushafViewerEl = document.getElementById('mushaf-page-dropdown');
  if (mushafViewerEl) {
    const curPage = mushafViewerEl.getAttribute('data-current-page') || '1';
    new SearchableDropdown(mushafViewerEl, {
      options: pageOptions,
      placeholder: 'اختر الصفحة...',
      searchPlaceholder: 'اكتب رقم الصفحة...',
      initial: [curPage],
      clearable: false,
      showFooterHints: false,
      onChange: (vals) => {
        if (vals[0] && vals[0] !== curPage) {
          window.location.href = `/mushaf-${vals[0]}`;
        }
      },
    });
  }

  // 6. Surah Translation, Tafseer, & Jump-to-Ayah Selectors (on /surah-:id)
  const surahTransEl = document.getElementById('surah-translation-dropdown');
  const surahTafseerEl = document.getElementById('surah-tafseer-dropdown');
  const surahAyahJumpEl = document.getElementById('surah-ayah-jump-dropdown');

  let activeTranslationEdition =
    localStorage.getItem('kalamalah_translation_edition') || 'en.sahih';
  let activeTafseerEdition =
    localStorage.getItem('kalamalah_tafseer_edition') || 'ar.muyassar';

  const refreshSurahEditionsLive = async () => {
    const surahNum = Number(
      document.getElementById('surah-ayahs-wrapper')?.getAttribute('data-surah-number') ||
        catalog.pageData?.surahNumber ||
        0
    );
    if (!surahNum) return;

    if (activeTranslationEdition === 'off') {
      document.querySelectorAll<HTMLElement>('.ayah-translation').forEach((el) => {
        el.classList.add('hidden');
      });
    }

    try {
      const transParam = activeTranslationEdition === 'off' ? 'en.sahih' : activeTranslationEdition;
      const data = await fetchSurahApi(surahNum, transParam, activeTafseerEdition, catalog);
      if (!data?.ok || !Array.isArray(data.ayahs)) return;

      const byAyah = new Map<number, { n: number; text: string; tr: string; taf: string }>(
        data.ayahs.map((a: any) => [Number(a.n), a])
      );

      document.querySelectorAll<HTMLElement>('.ayah-block').forEach((block) => {
        const aNum = Number(block.getAttribute('data-ayah') || 0);
        const item = byAyah.get(aNum);
        if (!item) return;

        const trBox = block.querySelector<HTMLElement>('.ayah-translation');
        if (trBox) {
          if (activeTranslationEdition === 'off' || !item.tr) {
            trBox.classList.add('hidden');
          } else {
            trBox.classList.remove('hidden');
            trBox.setAttribute('dir', data.translationDir || 'ltr');
            const p = trBox.querySelector('p');
            if (p) p.textContent = item.tr;
          }
        }

        const tafBox = block.querySelector<HTMLElement>('.ayah-inline-tafseer');
        if (tafBox) {
          const hdrStrong = tafBox.querySelector('.inline-tafseer-book-name');
          if (hdrStrong && data.tafseerNameAr) hdrStrong.textContent = data.tafseerNameAr;
          const cmpLink = tafBox.querySelector<HTMLAnchorElement>('.more-tafseer-link');
          if (cmpLink && data.tafseerBookId) {
            cmpLink.href = `/t-${surahNum}-${data.tafseerBookId}-${aNum}`;
          }
          const bodyP = tafBox.querySelector('.inline-tafseer-body-text');
          if (bodyP) bodyP.textContent = item.taf || '';
        }
      });

      player.setSurahAyahsData(
        data.ayahs.map((a: any) => ({
          n: Number(a.n),
          text: String(a.text || ''),
          tr: activeTranslationEdition === 'off' ? '' : String(a.tr || ''),
          taf: String(a.taf || ''),
        }))
      );
    } catch {}
  };

  const activeLoc = getActiveLocale();
  const isRtlUi = activeLoc === 'ar' || activeLoc === 'ur';

  if (surahTransEl && Array.isArray((catalog as any).translations)) {
    const transOptions: DropdownOption[] = [
      ...(catalog as any).translations.map((tr: any) => ({
        value: String(tr.editionId),
        label: isRtlUi ? `${tr.translatorName} — ${tr.languageNameAr}` : `${tr.translatorName} (${tr.languageNameEn})`,
        searchText: `${tr.translatorName} ${tr.languageNameEn} ${tr.languageNameAr} ${tr.code}`,
      })),
      {
        value: 'off',
        label: isRtlUi ? 'إخفاء الترجمة' : 'Hide Translation',
        searchText: 'off hide بدون ترجمة',
      },
    ];
    new SearchableDropdown(surahTransEl, {
      options: transOptions,
      placeholder: isRtlUi ? 'اختر الترجمة...' : 'Choose Translation...',
      searchPlaceholder: isRtlUi ? 'ابحث عن لغة أو مترجم...' : 'Search language or translator...',
      initial: [activeTranslationEdition],
      clearable: false,
      showFooterHints: false,
      onChange: (vals) => {
        if (vals[0]) {
          activeTranslationEdition = vals[0];
          localStorage.setItem('kalamalah_translation_edition', activeTranslationEdition);
          refreshSurahEditionsLive();
        }
      },
    });
  }

  if (surahTafseerEl && Array.isArray((catalog as any).tafseers)) {
    const tafOptions: DropdownOption[] = (catalog as any).tafseers.map((tf: any) => ({
      value: String(tf.editionId),
      label: isRtlUi ? `${tf.nameAr} — ${tf.authorAr}` : `${tf.nameEn} (${tf.nameAr})`,
      searchText: `${tf.nameAr} ${tf.nameEn} ${tf.authorAr}`,
    }));
    new SearchableDropdown(surahTafseerEl, {
      options: tafOptions,
      placeholder: isRtlUi ? 'اختر التفسير...' : 'Choose Tafseer...',
      searchPlaceholder: isRtlUi ? 'ابحث عن كتاب التفسير...' : 'Search tafseer book...',
      initial: [activeTafseerEdition],
      clearable: false,
      showFooterHints: false,
      onChange: (vals) => {
        if (vals[0]) {
          activeTafseerEdition = vals[0];
          localStorage.setItem('kalamalah_tafseer_edition', activeTafseerEdition);
          // Automatically reveal inline tafseer when user picks a Tafseer book
          document.querySelectorAll<HTMLElement>('.ayah-inline-tafseer').forEach((tf) => {
            tf.classList.remove('hidden');
          });
          document.querySelectorAll<HTMLElement>('[data-reader-view]').forEach((b) => {
            b.classList.toggle('active', b.getAttribute('data-reader-view') === 'tafseer-open');
          });
          document.getElementById('surah-ayahs-wrapper')?.classList.remove('mushaf-flow-mode');
          refreshSurahEditionsLive();
        }
      },
    });
  }

  if (surahAyahJumpEl) {
    const ayahCount = Number(surahAyahJumpEl.getAttribute('data-ayah-count') || 7);
    const pageAyahs = catalog.pageData?.ayahs ?? [];
    const ayahByNum = new Map(pageAyahs.map((a) => [a.n, a.text]));
    const ayahLabelPrefix = isRtlUi ? 'الآية' : 'Ayah';
    const ayahOptions: DropdownOption[] = Array.from({ length: ayahCount }, (_, idx) => {
      const aNum = idx + 1;
      const snippet = (ayahByNum.get(aNum) || '').split(/\s+/).slice(0, 7).join(' ');
      return {
        value: String(aNum),
        label: snippet ? `${ayahLabelPrefix} ${aNum} — ${snippet}...` : `${ayahLabelPrefix} ${aNum}`,
        searchText: `آية ${aNum} ayah ${aNum} ${snippet}`,
      };
    });
    new SearchableDropdown(surahAyahJumpEl, {
      options: ayahOptions,
      placeholder: isRtlUi ? `انتقل إلى آية (1 - ${ayahCount})...` : `Jump to Ayah (1 - ${ayahCount})...`,
      searchPlaceholder: isRtlUi ? 'اكتب رقم الآية أو كلمة منها...' : 'Type ayah number or word...',
      clearable: false,
      showFooterHints: false,
      onChange: (vals) => {
        const targetAyah = Number(vals[0] || 0);
        if (!targetAyah) return;
        const ayahCard = document.getElementById(`ayah-${targetAyah}`);
        if (ayahCard) {
          ayahCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          ayahCard.classList.add('ayah-jump-flash');
          setTimeout(() => ayahCard.classList.remove('ayah-jump-flash'), 2200);
        }
        player.seekToAyah(targetAyah, false);
      },
    });
  }

  // If user had a non-default translation or tafseer saved, hydrate it on load
  if (
    (surahTransEl || surahTafseerEl) &&
    (activeTranslationEdition !== 'en.sahih' || activeTafseerEdition !== 'ar.muyassar')
  ) {
    refreshSurahEditionsLive();
  }

  // 7. Top Navbar & Footer Multi-Language Selectors (Synced)
  const savedLang = getActiveLocale();
  const langOptions: DropdownOption[] = [
    { value: 'ar', label: 'العربية (Arabic)' },
    { value: 'en', label: 'English' },
    { value: 'fr', label: 'Français' },
    { value: 'tr', label: 'Türkçe' },
    { value: 'id', label: 'Bahasa Indonesia' },
    { value: 'ur', label: 'اردو (Urdu)' },
  ];
  const langDropdownInstances: SearchableDropdown[] = [];
  const syncHeaderLangOpts = (lang: UiLocale) => {
    document.querySelectorAll<HTMLElement>('.header-lang-opt').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-select-lang') === lang);
    });
    // Also sync mobile dropdown if it exists (it's a SearchableDropdown instance)
    for (const dd of langDropdownInstances) {
      dd.setValue([lang], false);
    }
  };
  const onSelectLang = (nextLang: UiLocale) => {
    applyUiLocale(nextLang, catalog);
    syncHeaderLangOpts(nextLang);
    for (const dd of langDropdownInstances) {
      dd.setValue([nextLang], false);
    }
  };

  syncHeaderLangOpts(savedLang);
  const hdrLangBtn = document.getElementById('header-lang-btn');
  const hdrLangMenu = document.getElementById('header-lang-menu');
  if (hdrLangBtn && hdrLangMenu) {
    const closeLangMenu = () => {
      hdrLangMenu.classList.add('hidden');
      hdrLangBtn.setAttribute('aria-expanded', 'false');
    };
    hdrLangBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = hdrLangMenu.classList.contains('hidden');
      hdrLangMenu.classList.toggle('hidden', !willOpen);
      hdrLangBtn.setAttribute('aria-expanded', String(willOpen));
    });
    hdrLangMenu.querySelectorAll<HTMLElement>('[data-select-lang]').forEach((opt) => {
      opt.addEventListener('click', () => {
        const lang = opt.getAttribute('data-select-lang') as UiLocale;
        if (lang) onSelectLang(lang);
        closeLangMenu();
      });
    });
    document.addEventListener('click', (e) => {
      if (!hdrLangMenu.contains(e.target as Node) && e.target !== hdrLangBtn) {
        closeLangMenu();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLangMenu();
    });
  }

  const footerLangEl = document.getElementById('footer-lang-dropdown');
  if (footerLangEl) {
    langDropdownInstances.push(
      new SearchableDropdown(footerLangEl, {
        options: langOptions,
        initial: [savedLang],
        clearable: false,
        searchable: false,
        showFooterHints: false,
        onChange: (vals) => {
          if (vals[0]) onSelectLang(vals[0] as UiLocale);
        },
      })
    );
  }

  // Mobile sidebar language dropdown
  const mobileLangEl = document.getElementById('mobile-lang-dropdown');
  if (mobileLangEl) {
    langDropdownInstances.push(
      new SearchableDropdown(mobileLangEl, {
        options: langOptions,
        initial: [savedLang],
        clearable: false,
        searchable: false,
        showFooterHints: false,
        onChange: (vals) => {
          if (vals[0]) onSelectLang(vals[0] as UiLocale);
        },
      })
    );
  }

  applyUiLocale(savedLang, catalog);

  return {
    syncReciterDropdowns: (slug: string) => {
      for (const dd of reciterDropdownInstances) {
        dd.setValue([slug], false);
      }
      const heroPlayBtn = document.getElementById('surah-hero-play-btn');
      if (heroPlayBtn) heroPlayBtn.setAttribute('data-play-reciter', slug);
      const heroReciterDisplay = document.getElementById('hero-reciter-name-display');
      const matched = catalog.reciters.find((r) => r.slug === slug);
      if (heroReciterDisplay && matched) {
        heroReciterDisplay.textContent = isRtlLocale(getActiveLocale()) ? matched.ar : matched.en;
      }
    },
  };
}

function initHomeTabsAndFilters(): void {
  const tabBtns = document.querySelectorAll<HTMLElement>('[data-switch-tab]');
  const switchTab = (targetId: string) => {
    tabBtns.forEach((btn) => {
      const isMatch = btn.getAttribute('data-switch-tab') === targetId;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-selected', String(isMatch));
    });
    document.querySelectorAll<HTMLElement>('.tab-panel').forEach((panel) => {
      const isActive = panel.id === targetId;
      panel.classList.toggle('hidden', !isActive);
      panel.classList.toggle('active', isActive);
      if (isActive && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        panel.animate(
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'translateY(0)' }
          ],
          { duration: 240, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' }
        ).finished.then(() => {
          panel.style.opacity = '';
          panel.style.transform = '';
        });
      }
    });
    const filterWrap = document.getElementById('surah-filter-controls');
    if (filterWrap) {
      filterWrap.style.display = targetId === 'view-surah' ? '' : 'none';
    }
  };

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-switch-tab');
      if (target) switchTab(target);
    });
  });

  const checkHashTab = () => {
    const hash = window.location.hash.replace(/^#/, '');
    if (['view-surah', 'view-juz', 'view-page'].includes(hash)) {
      switchTab(hash);
    }
  };
  checkHashTab();
  window.addEventListener('hashchange', checkHashTab);

  // Home Surah Search & Revelation Filter
  let activeRevFilter = 'all';
  const homeSearchInput = document.getElementById('home-surah-search') as HTMLInputElement | null;
  const applySurahCardFilters = () => {
    const q = (homeSearchInput?.value || '').trim().toLowerCase();
    document.querySelectorAll<HTMLElement>('#home-surahs-grid .surah-card').forEach((card) => {
      const name = (card.getAttribute('data-surah-name') || '').toLowerCase();
      const num = card.getAttribute('data-surah-number') || '';
      const rev = card.getAttribute('data-revelation') || '';
      const matchesQuery = !q || name.includes(q) || num === q;
      const matchesRev = activeRevFilter === 'all' || rev === activeRevFilter;
      card.style.display = matchesQuery && matchesRev ? '' : 'none';
    });
  };

  homeSearchInput?.addEventListener('input', applySurahCardFilters);
  document.querySelectorAll<HTMLElement>('[data-filter-rev]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeRevFilter = btn.getAttribute('data-filter-rev') || 'all';
      document.querySelectorAll('[data-filter-rev]').forEach((b) => b.classList.toggle('active', b === btn));
      applySurahCardFilters();
    });
  });

  // Reciters Directory Search & Filter (/reciters)
  let activeReciterFilter = 'all';
  const reciterSearchInput = document.getElementById('reciters-search-input') as HTMLInputElement | null;
  const applyReciterDirectoryFilters = () => {
    const q = (reciterSearchInput?.value || '').trim().toLowerCase();
    document.querySelectorAll<HTMLElement>('#reciters-directory-grid .reciter-dir-card').forEach((card) => {
      const name = (card.getAttribute('data-reciter-name') || '').toLowerCase();
      const syncType = card.getAttribute('data-sync-type') || '';
      const matchQ = !q || name.includes(q);
      const matchType =
        activeReciterFilter === 'all' ||
        (activeReciterFilter === 'wbw' && syncType === 'wbw') ||
        (activeReciterFilter === 'cc' && (syncType === 'wbw' || syncType === 'cc'));
      card.style.display = matchQ && matchType ? '' : 'none';
    });
  };

  reciterSearchInput?.addEventListener('input', applyReciterDirectoryFilters);
  document.querySelectorAll<HTMLElement>('[data-filter-reciter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeReciterFilter = btn.getAttribute('data-filter-reciter') || 'all';
      document.querySelectorAll('[data-filter-reciter]').forEach((b) => b.classList.toggle('active', b === btn));
      applyReciterDirectoryFilters();
    });
  });

  // Reciter Profile 114-Surah Filter (/reciter-:id)
  const recSurahInput = document.getElementById('reciter-surah-filter-input') as HTMLInputElement | null;
  recSurahInput?.addEventListener('input', () => {
    const q = recSurahInput.value.trim().toLowerCase();
    document.querySelectorAll<HTMLElement>('#reciter-surahs-list .reciter-surah-row').forEach((row) => {
      const name = (row.getAttribute('data-surah-name') || '').toLowerCase();
      const num = row.getAttribute('data-surah-number') || '';
      row.style.display = !q || name.includes(q) || num === q ? '' : 'none';
    });
  });
}

function initModalsAndTafseer(catalog: BootstrapCatalog): void {
  let activeModalSurah = catalog.pageData?.surahNumber || 1;
  let activeModalAyah = 1;
  let activeTafseerBookId = 1;

  const modalEl = document.getElementById('ayahTafseerModal');
  const arabicBox = document.getElementById('modal-ayah-arabic');
  const contentBox = document.getElementById('modal-tafseer-content');
  const modalDdEl = document.getElementById('modal-tafseer-dropdown');

  const loadTafseerIntoModal = async (bookId: number, surah: number, ayah: number) => {
    if (!contentBox) return;
    contentBox.innerHTML = `<p class="loading-text">جاري جلب التفسير...</p>`;
    try {
      const data = await fetchTafseerAyahApi(bookId, surah, ayah, catalog);
      if (data) {
        if (arabicBox && data.arabicText) {
          arabicBox.textContent = `${data.arabicText} ﴿${ayah}﴾`;
        }
        contentBox.innerHTML = `
          <div class="tafseer-modal-book-hdr">${escapeHtml(String(data.bookNameAr ?? ''))} (${escapeHtml(String(data.authorAr ?? ''))})</div>
          <p>${escapeHtml(String(data.tafseerText || 'لا يوجد نص متاح لهذه الآية.'))}</p>
        `;
      }
    } catch {
      contentBox.innerHTML = `<p>تعذر تحميل التفسير حالياً.</p>`;
    }
  };

  if (modalDdEl && Array.isArray((catalog as any).tafseers)) {
    const tafOptions: DropdownOption[] = (catalog as any).tafseers.map((t: any) => ({
      value: String(t.id),
      label: `${t.nameAr} (${t.authorAr})`,
    }));
    new SearchableDropdown(modalDdEl, {
      options: tafOptions,
      initial: ['1'],
      clearable: false,
      showFooterHints: false,
      onChange: (vals) => {
        if (vals[0]) {
          activeTafseerBookId = Number(vals[0]);
          loadTafseerIntoModal(activeTafseerBookId, activeModalSurah, activeModalAyah);
        }
      },
    });
  }

  // Share Modal Wiring — prefer the browser's native share sheet
  const shareModal = document.getElementById('shareModal');
  const openShareBtn = document.getElementById('open-share-modal-btn');
  openShareBtn?.addEventListener('click', () => {
    const shareData = { title: document.title, url: window.location.href };
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      navigator.share(shareData).catch(() => {
        /* user dismissed the native sheet — do nothing */
      });
      return;
    }

    const pageUrl = encodeURIComponent(window.location.href);
    const pageTitle = encodeURIComponent(document.title);
    const wa = document.getElementById('share-whatsapp') as HTMLAnchorElement | null;
    const tg = document.getElementById('share-telegram') as HTMLAnchorElement | null;
    const x = document.getElementById('share-x') as HTMLAnchorElement | null;
    const fb = document.getElementById('share-facebook') as HTMLAnchorElement | null;
    const urlInput = document.getElementById('share-url-input') as HTMLInputElement | null;

    if (wa) wa.href = `https://wa.me/?text=${pageTitle}%20${pageUrl}`;
    if (tg) tg.href = `https://t.me/share/url?url=${pageUrl}&text=${pageTitle}`;
    if (x) x.href = `https://twitter.com/intent/tweet?url=${pageUrl}&text=${pageTitle}`;
    if (fb) fb.href = `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}`;
    if (urlInput) urlInput.value = window.location.href;

    shareModal?.classList.remove('hidden');
  });

  document.getElementById('share-copy-btn')?.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    navigator.clipboard?.writeText(window.location.href);
    const prev = btn.textContent;
    btn.textContent = 'تم النسخ';
    setTimeout(() => {
      btn.textContent = prev;
    }, 1600);
  });

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const openDevBtn = target.closest<HTMLElement>('[data-open-about-dev]');
    if (openDevBtn) {
      e.preventDefault();
      document.getElementById('aboutDeveloperModal')?.classList.remove('hidden');
      return;
    }

    const openTafBtn = target.closest<HTMLElement>('[data-open-tafseer]');
    if (openTafBtn) {
      activeModalAyah = Number(openTafBtn.getAttribute('data-open-tafseer') || 1);
      activeModalSurah = Number(
        document.getElementById('surah-ayahs-wrapper')?.getAttribute('data-surah-number') || 1
      );
      modalEl?.classList.remove('hidden');
      loadTafseerIntoModal(activeTafseerBookId, activeModalSurah, activeModalAyah);
      return;
    }

    const closeBtn = target.closest<HTMLElement>('[data-close-modal]');
    if (closeBtn) {
      const mId = closeBtn.getAttribute('data-close-modal') || '';
      document.getElementById(mId)?.classList.add('hidden');
      return;
    }

    if (target.classList.contains('modal-backdrop')) {
      target.classList.add('hidden');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll<HTMLElement>('.modal-backdrop:not(.hidden)').forEach((m) => {
        m.classList.add('hidden');
      });
    }
  });
}

function initScrollToTopAndIslamicPages(): void {
  // 1. Floating Bottom-Left Gold Scroll-to-Top Button
  const scrollBtn = document.getElementById('scroll-to-top-btn');
  if (scrollBtn) {
    const updateScrollBtnVisibility = () => {
      const show = window.scrollY > 280;
      scrollBtn.classList.toggle('hidden', !show);
    };
    window.addEventListener('scroll', updateScrollBtnVisibility, { passive: true });
    updateScrollBtnVisibility();

    scrollBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // 2. Duas & Adhkar Page (/duas): Categories, Search, Copy, & Tasbih Counter
  const duasGrid = document.getElementById('duas-grid-container');
  if (duasGrid) {
    const TASBIH_STORAGE_KEY = 'kalamalah_tasbih_counts_v1';
    const arDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    const toAr = (n: number) => String(n).replace(/\d/g, (d) => arDigits[Number(d)] ?? d);

    let savedCounts: Record<string, number> = {};
    try {
      const raw = localStorage.getItem(TASBIH_STORAGE_KEY);
      if (raw) savedCounts = JSON.parse(raw);
    } catch {}

    const saveCounts = () => {
      try {
        localStorage.setItem(TASBIH_STORAGE_KEY, JSON.stringify(savedCounts));
      } catch {}
    };

    const syncTasbihUI = () => {
      duasGrid.querySelectorAll<HTMLElement>('[data-dua-counter]').forEach((btn) => {
        const id = btn.getAttribute('data-dua-counter') || '';
        const target = Number(btn.getAttribute('data-target-count') || 1);
        const cur = Number(savedCounts[id] || 0);
        const curEl = btn.querySelector('.tasbih-current');
        if (curEl) {
          curEl.setAttribute('data-current-count', String(cur));
          curEl.textContent = toAr(cur);
        }
        btn.classList.toggle('completed', cur >= target);
        btn.closest('.dua-card')?.classList.toggle('dua-completed', cur >= target);
      });
    };
    syncTasbihUI();

    duasGrid.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const counterBtn = target.closest<HTMLElement>('[data-dua-counter]');
      if (counterBtn) {
        const id = counterBtn.getAttribute('data-dua-counter') || '';
        const maxCount = Number(counterBtn.getAttribute('data-target-count') || 1);
        const cur = Number(savedCounts[id] || 0);
        savedCounts[id] = cur >= maxCount ? 0 : cur + 1;
        saveCounts();
        syncTasbihUI();
        return;
      }

      const copyBtn = target.closest<HTMLElement>('[data-copy-dua]');
      if (copyBtn) {
        const card = copyBtn.closest('.dua-card');
        const text = card?.querySelector('[data-dua-text]')?.getAttribute('data-dua-text') || '';
        const source = card?.querySelector('.dua-source-chip')?.textContent || '';
        if (text) {
          navigator.clipboard?.writeText(`${text}\n(${source})`);
          const span = copyBtn.querySelector('span');
          if (span) {
            const prev = span.textContent;
            span.textContent = 'تم النسخ';
            setTimeout(() => {
              span.textContent = prev;
            }, 1500);
          }
        }
      }
    });

    document.getElementById('reset-all-tasbih-btn')?.addEventListener('click', () => {
      savedCounts = {};
      saveCounts();
      syncTasbihUI();
    });

    let activeDuaCat = 'all';
    const duaSearchInput = document.getElementById('duas-search-input') as HTMLInputElement | null;
    const filterDuas = () => {
      const q = (duaSearchInput?.value || '').trim().toLowerCase();
      duasGrid.querySelectorAll<HTMLElement>('.dua-card').forEach((card) => {
        const cat = card.getAttribute('data-category') || '';
        const hay = (card.getAttribute('data-search') || '').toLowerCase();
        const matchCat = activeDuaCat === 'all' || cat === activeDuaCat;
        const matchQ = !q || hay.includes(q);
        card.style.display = matchCat && matchQ ? '' : 'none';
      });
    };

    duaSearchInput?.addEventListener('input', filterDuas);
    document.querySelectorAll<HTMLElement>('[data-dua-category]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeDuaCat = btn.getAttribute('data-dua-category') || 'all';
        document
          .querySelectorAll('[data-dua-category]')
          .forEach((b) => b.classList.toggle('active', b === btn));
        filterDuas();
      });
    });
  }

  // 3. 99 Names of Allah Page (/names) Search
  const asmaSearchInput = document.getElementById('asma-search-input') as HTMLInputElement | null;
  const asmaGrid = document.getElementById('asma-grid-container');
  if (asmaSearchInput && asmaGrid) {
    asmaSearchInput.addEventListener('input', () => {
      const q = asmaSearchInput.value.trim().toLowerCase();
      asmaGrid.querySelectorAll<HTMLElement>('.asma-card').forEach((card) => {
        const hay = (card.getAttribute('data-search') || '').toLowerCase();
        card.style.display = !q || hay.includes(q) ? '' : 'none';
      });
    });
  }
}

function initMobileDrawerNavigation(): void {
  const toggleBtn = document.getElementById('mobile-nav-toggle-btn');
  const drawerEl = document.getElementById('mobile-nav-drawer');
  const backdropEl = document.getElementById('mobile-nav-backdrop');
  const closeBtn = document.getElementById('mobile-sidebar-close-btn');

  if (!drawerEl || !toggleBtn) return;

  const openDrawer = () => {
    drawerEl.classList.add('is-open');
    drawerEl.setAttribute('aria-hidden', 'false');
    toggleBtn.setAttribute('aria-expanded', 'true');
    toggleBtn.querySelector('.icon-hamburger')?.classList.add('hidden');
    toggleBtn.querySelector('.icon-close')?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  };

  const closeDrawer = () => {
    drawerEl.classList.remove('is-open');
    drawerEl.setAttribute('aria-hidden', 'true');
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.querySelector('.icon-hamburger')?.classList.remove('hidden');
    toggleBtn.querySelector('.icon-close')?.classList.add('hidden');
    document.body.style.overflow = '';
  };

  toggleBtn.addEventListener('click', () => {
    const isOpen = drawerEl.classList.contains('is-open');
    if (isOpen) closeDrawer();
    else openDrawer();
  });

  backdropEl?.addEventListener('click', closeDrawer);
  closeBtn?.addEventListener('click', closeDrawer);

  document.querySelectorAll<HTMLElement>('.mobile-nav-link').forEach((link) => {
    link.addEventListener('click', closeDrawer);
  });

  document.getElementById('mobile-open-bookmarks-btn')?.addEventListener('click', () => {
    closeDrawer();
    document.getElementById('bookmarksModal')?.classList.remove('hidden');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawerEl.classList.contains('is-open')) {
      closeDrawer();
    }
  });
}

async function initReciterBioFromApi(): Promise<void> {
  const bioEl = document.getElementById('rp-reciter-bio');
  if (!bioEl) return;

  const slug = bioEl.getAttribute('data-reciter-slug') || '';
  const kSlug = bioEl.getAttribute('data-k-slug') || '';

  try {
    const res = await fetch('https://api.kalamalah.com/api/reciters', {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return;
    const data = (await res.json()) as Record<string, { description?: string }>;
    const entry = data[kSlug] || data[slug];
    const desc = String(entry?.description || '').trim();
    if (desc.length < 85) return; // Skip placeholder strings; keep catalog bio

    const parts = desc
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);
    const arPart = parts.find((p) => /[\u0600-\u06FF]/.test(p));
    const enPart = parts.find((p) => !/[\u0600-\u06FF]/.test(p)) || parts[0];

    if (enPart) bioEl.setAttribute('data-bio-en', enPart);
    if (arPart) bioEl.setAttribute('data-bio-ar', arPart);

    const isRtl = isRtlLocale(getActiveLocale());
    bioEl.textContent = isRtl ? (arPart || enPart || bioEl.textContent) : (enPart || arPart || bioEl.textContent);
  } catch {}
}

function initCookieConsentBanner(): void {
  const banner = document.getElementById('cookie-consent-banner');
  if (!banner) return;

  const KEY = 'kalamalah_cookie_consent_v1';
  try {
    if (localStorage.getItem(KEY)) return;
  } catch {}

  const localizeBanner = () => {
    const isRtl = isRtlLocale(getActiveLocale());
    const textEl = document.getElementById('cookie-consent-text');
    const acceptBtn = document.getElementById('cookie-accept-btn');
    const essBtn = document.getElementById('cookie-essential-btn');
    if (textEl) {
      textEl.textContent = isRtl
        ? 'نستخدم تخزين المتصفح المحلي لحفظ المظهر، اللغة، العلامات المرجعية، وموضع القراءة.'
        : 'We use browser storage for your theme, language, bookmarks, and reading position.';
    }
    if (acceptBtn) acceptBtn.textContent = isRtl ? 'موافق' : 'Accept';
    if (essBtn) essBtn.textContent = isRtl ? 'الأساسية فقط' : 'Essential Only';
  };
  localizeBanner();
  window.addEventListener('kalamalah:locale-changed', localizeBanner);

  banner.classList.remove('hidden');
  requestAnimationFrame(() => banner.classList.add('is-visible'));

  const dismiss = (choice: 'accepted' | 'essential') => {
    try {
      localStorage.setItem(KEY, choice);
    } catch {}
    // Tell Zaraz right away; purposes stay denied until it is loaded.
    setZarazConsent(choice);
    banner.classList.remove('is-visible');
    setTimeout(() => banner.classList.add('hidden'), 240);
  };

  document.getElementById('cookie-accept-btn')?.addEventListener('click', () => dismiss('accepted'));
  document.getElementById('cookie-essential-btn')?.addEventListener('click', () => dismiss('essential'));
}

function rewriteStaticDownloadLinks(catalog: BootstrapCatalog): void {
  if (!isStaticMode()) return;
  document.querySelectorAll<HTMLAnchorElement>('a[href^="/api/download/"]').forEach((link) => {
    const m = /^\/api\/download\/([^/]+)\/(\d+)/.exec(link.getAttribute('href') || '');
    if (!m) return;
    const rec = catalog.reciters.find((r) => r.slug === decodeURIComponent(m[1]!));
    if (rec) {
      link.href = getDownloadUrl(rec, Number(m[2]));
      link.setAttribute('download', '');
    }
  });
}

function initSoftSpaNavigation(
  catalog: BootstrapCatalog,
  player: QuranPlayerController,
  onPageSwapped: () => void
): void {
  let navAbort: AbortController | null = null;

  const syncNavActiveState = (doc: Document) => {
    const nextLinks = Array.from(doc.querySelectorAll<HTMLAnchorElement>('.primary-nav .nav-pill'));
    const curLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.primary-nav .nav-pill'));
    curLinks.forEach((cur, idx) => {
      const next = nextLinks[idx];
      if (next) cur.classList.toggle('active', next.classList.contains('active'));
    });
    const nextMob = Array.from(doc.querySelectorAll<HTMLAnchorElement>('.mobile-nav-link'));
    const curMob = Array.from(document.querySelectorAll<HTMLAnchorElement>('.mobile-nav-link'));
    curMob.forEach((cur, idx) => {
      const next = nextMob[idx];
      if (next) cur.classList.toggle('active', next.classList.contains('active'));
    });
  };

  const navigateTo = async (urlStr: string, pushHistory = true) => {
    const targetUrl = new URL(urlStr, window.location.origin);
    if (targetUrl.origin !== window.location.origin) {
      window.location.href = targetUrl.href;
      return;
    }

    if (navAbort) navAbort.abort();
    navAbort = new AbortController();

    const mainEl = document.getElementById('main-content');
    if (!mainEl) {
      window.location.href = targetUrl.href;
      return;
    }

    try {
      const res = await fetch(targetUrl.pathname + targetUrl.search, {
        signal: navAbort.signal,
        headers: { 'X-Requested-With': 'kalamalah-spa' },
      });
      if (!res.ok) {
        if (isStaticMode()) {
          if (pushHistory) history.pushState({ url: targetUrl.href }, '', targetUrl.href);
          mainEl.innerHTML = `<div id="static-route-placeholder" class="container" style="padding:64px 16px;text-align:center;"><p style="color:var(--text-secondary);font-size:1rem;">Loading...</p></div>`;
          await resolveStaticRouteIfNeeded(catalog);
          onPageSwapped();
          player.rebindAnimator();
          window.scrollTo({ top: 0, behavior: 'auto' });
          trackPageView(targetUrl.pathname, document.title);
          return;
        }
        window.location.href = targetUrl.href;
        return;
      }

      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const nextMain = doc.getElementById('main-content');
      if (!nextMain) {
        window.location.href = targetUrl.href;
        return;
      }

      if (pushHistory) {
        history.pushState({ url: targetUrl.href }, '', targetUrl.href);
      }

      document.title = doc.title || document.title;
      mainEl.innerHTML = nextMain.innerHTML;
      trackPageView(targetUrl.pathname, document.title);

      try {
        const bootEl = doc.getElementById('kalamalah-bootstrap');
        if (bootEl?.textContent) {
          const parsed = JSON.parse(bootEl.textContent) as BootstrapCatalog;
          catalog.pageData = parsed.pageData ?? {};
        }
      } catch {}

      syncNavActiveState(doc);
      await resolveStaticRouteIfNeeded(catalog);
      onPageSwapped();
      player.rebindAnimator();

      if (targetUrl.hash) {
        const hashTarget = document.getElementById(targetUrl.hash.slice(1));
        if (hashTarget) {
          hashTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      window.location.href = targetUrl.href;
    }
  };

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    const anchor = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    if (
      anchor.target === '_blank' ||
      anchor.hasAttribute('download') ||
      anchor.getAttribute('href')?.startsWith('/api/download/') ||
      anchor.getAttribute('href')?.startsWith('mailto:') ||
      anchor.getAttribute('href')?.startsWith('tel:')
    ) {
      return;
    }
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#')) return;
    const url = new URL(anchor.href, window.location.origin);
    if (url.origin !== window.location.origin) return;

    e.preventDefault();
    navigateTo(url.href, true);
  });

  window.addEventListener('popstate', () => {
    navigateTo(window.location.href, false);
  });
}

function initKeyboardShortcuts(player: QuranPlayerController): void {
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    // Ignore typing contexts and any focused interactive control: otherwise
    // Space on a focused button toggles playback twice.
    if (
      target?.isContentEditable ||
      target?.closest(
        'input, textarea, select, button, a, [role="button"], [role="slider"], [contenteditable="true"]'
      )
    ) {
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        document.getElementById('qp-play-toggle-btn')?.click();
        break;
      case 'KeyJ':
        e.preventDefault();
        document.getElementById('qp-next-ayah-btn')?.click();
        break;
      case 'KeyK':
        e.preventDefault();
        document.getElementById('qp-prev-ayah-btn')?.click();
        break;
      case 'KeyR':
        e.preventDefault();
        document.getElementById('qp-repeat-btn')?.click();
        break;
      case 'KeyM': {
        e.preventDefault();
        // There is no mute button in the UI; toggle the element directly.
        const audio = document.getElementById('kalamalah-audio-el') as HTMLAudioElement | null;
        if (audio) audio.muted = !audio.muted;
        break;
      }
      case 'KeyF':
        e.preventDefault();
        document.getElementById('qp-expand-fullscreen-btn')?.click();
        break;
    }
  });
}

function applyDeepLinkParams(player: QuranPlayerController): void {
  const params = new URLSearchParams(window.location.search);
  const reciter = params.get('reciter');
  const ayahStr = params.get('ayah');
  const tStr = params.get('t');
  if (reciter) player.setReciter(reciter, false);
  if (ayahStr) {
    const ayahNum = Number(ayahStr);
    if (Number.isFinite(ayahNum) && ayahNum > 0) {
      setTimeout(() => {
        document.querySelector<HTMLElement>(`[data-ayah="${ayahNum}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }
  if (tStr) {
    const tSec = Number(tStr);
    const audio = document.getElementById('kalamalah-audio-el') as HTMLAudioElement | null;
    if (audio && Number.isFinite(tSec) && tSec >= 0) {
      audio.currentTime = tSec;
    }
  }
}

function initMobileSidebarControls(): void {
  // Reading Font dropdown (mirrors desktop [data-set-reading-font] buttons)
  const mobileFontEl = document.getElementById('mobile-reading-font-dropdown');
  if (mobileFontEl && typeof SearchableDropdown !== 'undefined') {
    new SearchableDropdown(mobileFontEl, {
      options: [
        { value: 'uthmani', label: 'Uthmani (عثماني)' },
        { value: 'kitab', label: 'Kitab (كتاب)' },
        { value: 'amiri', label: 'Amiri (أميري)' },
        { value: 'nastaleeq', label: 'Nastaleeq (نستعليق)' },
      ],
      initial: [localStorage.getItem('kalamalah_reading_font') || 'uthmani'],
      clearable: false,
      searchable: false,
      showFooterHints: false,
      onChange: (vals) => {
        if (vals[0]) {
          const font = vals[0] as 'uthmani' | 'kitab' | 'amiri' | 'nastaleeq';
          document.documentElement.setAttribute('data-reading-font', font);
          localStorage.setItem('kalamalah_reading_font', font);
          document.querySelectorAll<HTMLElement>('[data-set-reading-font]').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-set-reading-font') === font);
          });
          // Trigger refresh
          const event = new CustomEvent('kalamalah:reading-font-changed', { detail: { font } });
          window.dispatchEvent(event);
        }
      },
    });
  }

  // Tajweed toggle (mirrors #tajweed-color-toggle)
  const tajweedToggle = document.getElementById('mobile-tajweed-toggle') as HTMLInputElement | null;
  const tajweedToggleBtn = document.getElementById('tajweed-color-toggle');
  if (tajweedToggle && tajweedToggleBtn) {
    const saved = localStorage.getItem('kalamalah_tajweed_enabled') === '1';
    tajweedToggle.checked = saved;
    tajweedToggleBtn.classList.toggle('active', saved);
    tajweedToggle.addEventListener('change', () => {
      const enabled = tajweedToggle.checked;
      localStorage.setItem('kalamalah_tajweed_enabled', enabled ? '1' : '0');
      tajweedToggleBtn.classList.toggle('active', enabled);
      tajweedToggleBtn.setAttribute('aria-pressed', String(enabled));
      const event = new CustomEvent('kalamalah:tajweed-changed', { detail: { enabled } });
      window.dispatchEvent(event);
    });
  }

  // Diacritics toggle (mirrors #diacritics-panel-toggle)
  const diacriticsToggle = document.getElementById('mobile-diacritics-toggle') as HTMLInputElement | null;
  const diacriticsBtn = document.getElementById('diacritics-panel-toggle');
  if (diacriticsToggle && diacriticsBtn) {
    const saved = localStorage.getItem('kalamalah_diacritics_enabled') === '1';
    diacriticsToggle.checked = saved;
    diacriticsBtn.classList.toggle('active', saved);
    diacriticsToggle.addEventListener('change', () => {
      const enabled = diacriticsToggle.checked;
      localStorage.setItem('kalamalah_diacritics_enabled', enabled ? '1' : '0');
      diacriticsBtn.classList.toggle('active', enabled);
      const event = new CustomEvent('kalamalah:diacritics-changed', { detail: { enabled } });
      window.dispatchEvent(event);
    });
  }

  // Memorization toggle (mirrors #memorization-panel-toggle)
  const memoToggle = document.getElementById('mobile-memorization-toggle') as HTMLInputElement | null;
  const memoBtn = document.getElementById('memorization-panel-toggle');
  if (memoToggle && memoBtn) {
    const saved = localStorage.getItem('kalamalah_memorization_enabled') === '1';
    memoToggle.checked = saved;
    memoBtn.classList.toggle('active', saved);
    memoToggle.addEventListener('change', () => {
      const enabled = memoToggle.checked;
      localStorage.setItem('kalamalah_memorization_enabled', enabled ? '1' : '0');
      memoBtn.classList.toggle('active', enabled);
      const event = new CustomEvent('kalamalah:memorization-changed', { detail: { enabled } });
      window.dispatchEvent(event);
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const catalog = parseBootstrapCatalog();
  initThemeController();
  initMobileDrawerNavigation();
  initCookieConsentBanner();
  initZarazConsent();

  await resolveStaticRouteIfNeeded(catalog);
  rewriteStaticDownloadLinks(catalog);

  let syncReciterHook: ((slug: string) => void) | undefined;
  const player = new QuranPlayerController(catalog, (slug) => {
    syncReciterHook?.(slug);
  });

  const reinitPageContent = () => {
    rewriteStaticDownloadLinks(catalog);
    const { syncReciterDropdowns } = initSearchableDropdowns(catalog, player);
    syncReciterHook = syncReciterDropdowns;
    initReadingTools();
    initMobileSidebarControls();
    initHomeTabsAndFilters();
    initScrollToTopAndIslamicPages();
    initReciterBioFromApi();
    applyUiLocale(getActiveLocale(), catalog);
    initHijriCalendarBanner();
  };

  reinitPageContent();
  initWordMeaningPopover(player);
  initModalsAndTafseer(catalog);
  initSoftSpaNavigation(catalog, player, reinitPageContent);
  try {
    if (localStorage.getItem('kalamalah_gpu_only_animations') === '1') {
      document.documentElement.setAttribute('data-gpu-only', '1');
    }
  } catch {}
  (window as any).__KALAMALAH_SET_GPU_ONLY__ = (enabled: boolean) => {
    document.documentElement.toggleAttribute('data-gpu-only', enabled);
    try {
      localStorage.setItem('kalamalah_gpu_only_animations', enabled ? '1' : '0');
    } catch {}
  };
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Preload critical lazy modules on first user interaction
  let preloaded = false;
  const preloadOnce = () => {
    if (!preloaded) {
      preloaded = true;
      preloadCriticalFeatures();
    }
  };
  ['click', 'keydown', 'touchstart'].forEach(evt => 
    document.addEventListener(evt, preloadOnce, { once: true, passive: true })
  );

  // Initialize lightweight features immediately
  initSleepTimer();
  initChangelogModal();

  // Lazy-load heavy features on demand (code splitting)
  initOnInteraction('#open-settings-btn, [data-open-settings]', 'settingsSheet');
  initOnInteraction('#ambient-toggle-btn, [data-ambient-toggle]', 'ambientMixer');
  initOnInteraction('[data-hifz-toggle], #hifz-tools-toggle', 'hifzTools');
  initOnInteraction('[data-tv-toggle], #dual-screen-toggle', 'tvDisplay');
  initOnInteraction('[data-debug-toggle], #debug-toggle', 'debugOverlay');
  initOnInteraction('[data-cast-btn], [data-cast-trigger]', 'castController');
  initOnInteraction('[data-ayah-card-trigger], .ayah-card-btn', 'ayahCard');
  initOnInteraction('[data-ayah-embed-trigger], .ayah-embed-btn', 'ayahEmbed');
  initOnInteraction('[data-window-controls]', 'windowControls');
  initOnInteraction('[data-media-session-toggle]', 'mediaSession');

  // Initialize AeroUI components (lightweight)
  initPlayerButtons();
  initElasticSliders();
  initSkipLabels();
  initSkipButtons(); // NEW: initialize skip buttons
  // Expose AeroUI helpers globally for quran-player.ts
  (window as any).setPlayerIcon = setPlayerIcon;
  (window as any).playSkip = playSkip;
  (window as any).setSkipIcon = setSkipIcon; // NEW

  // Initialize features needed for initial render
  initSettingsSheet(); // Needed for initial UI state
  initAmbientMixer(); // Needed for background audio
  initHifzTools(); // Lightweight
  initDualScreenMode(); // Check for dual screen capability
  initIosFullscreen(); // iOS PWA
  initMediaSession(); // Media session API
  initCastController(); // Cast availability check
  initAyahCardGenerator(); // Card generator setup
  initAyahEmbedWidget(); // Embed widget setup
  initWindowControls(); // Window controls (Electron)
  initKeyboardShortcuts(player);
  applyDeepLinkParams(player);
  initDebugOverlay();
  void checkForUpdates();

  // Mark page as loaded (unhides critical elements for CLS prevention)
  document.documentElement.dataset.loaded = 'true';
});
