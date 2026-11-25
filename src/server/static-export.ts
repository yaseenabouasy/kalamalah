import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fetchJuzDetail, fetchMushafPage, fetchSurahDetail, TRANSLATION_EDITIONS, TAFSEER_BOOKS } from './kalamalah-api';
import { RECITERS_CATALOG } from './reciters-catalog';
import { resolveSurahTimings, type NormalizedSurahTimings } from './timings-service';
import { renderHomePage } from './views/home';
import { renderAsmaUlHusnaPage, renderDuasPage } from './views/islamic-pages';
import {
  renderJuzPageView,
  renderLanguagesPage,
  renderTafseerPageView,
  renderTajweedGuidePage,
} from './views/juz-tafseer';
import { buildRobotsTxt, buildSitemapXml, renderLayout } from './views/layout';
import { renderMushafPageView } from './views/mushaf';
import { renderReciterProfilePage, renderRecitersDirectoryPage } from './views/reciters';
import { renderSurahPage } from './views/surah';
import { SURAHS_META } from './kalamalah-api';

const ROOT = process.cwd();
const DIST_DIR = join(ROOT, 'dist');
const PUBLIC_DIR = join(ROOT, 'public');
const MAIN_FONTS_DIR = join(ROOT, 'main', 'fonts');
const MAIN_ICONS_DIR = join(ROOT, 'main', 'icons');
const CUSTOM_DOMAIN = (process.env.CUSTOM_DOMAIN || 'kalamalah.com').trim();

function markHtmlStatic(html: string): string {
  return html.replace('</head>', '<script>window.__KALAMALAH_STATIC__=true;</script>\n</head>');
}

async function writeHtmlSlug(slugPath: string, html: string): Promise<void> {
  const marked = markHtmlStatic(html);
  const clean = slugPath.replace(/^\/+|\/+$/g, '');
  if (!clean) {
    await writeFile(join(DIST_DIR, 'index.html'), marked, 'utf8');
    return;
  }
  await writeFile(join(DIST_DIR, `${clean}.html`), marked, 'utf8');
}

async function runStaticExport(): Promise<void> {
  console.log('[Kalamalah Static] Preparing dist/ directory...');
  // Windows: rm can fail with EBUSY if a process still holds a handle.
  // Try to rename the old dist directory first, then create a fresh one.
  const oldDist = join(ROOT, 'dist_old_' + Date.now());
  try {
    await rm(DIST_DIR, { recursive: true, force: true });
  } catch (e: any) {
    if (e.code === 'EBUSY') {
      try {
        await import('node:fs/promises').then(m => m.rename(DIST_DIR, oldDist));
      } catch {
        // Ignore rename errors, we'll try to create the new dir anyway
      }
    } else {
      throw e;
    }
  }
  await mkdir(DIST_DIR, { recursive: true });

  // 1. Copy public/ assets and main/ fallback fonts & icons
  await cp(PUBLIC_DIR, DIST_DIR, { recursive: true });
  if (existsSync(join(PUBLIC_DIR, 'favicon', 'site.webmanifest'))) {
    await cp(join(PUBLIC_DIR, 'favicon', 'site.webmanifest'), join(DIST_DIR, 'site.webmanifest'));
  }
  if (existsSync(MAIN_FONTS_DIR)) {
    await mkdir(join(DIST_DIR, 'fonts'), { recursive: true });
    await cp(MAIN_FONTS_DIR, join(DIST_DIR, 'fonts'), { recursive: true, force: false });
  }
  if (existsSync(MAIN_ICONS_DIR)) {
    await mkdir(join(DIST_DIR, 'icons'), { recursive: true });
    await cp(MAIN_ICONS_DIR, join(DIST_DIR, 'icons'), { recursive: true });
  }
  // Copy vendor/ AFTER timing files are generated (below) so index.json exists

  // 2. GitHub Pages config & SEO files
  await writeFile(join(DIST_DIR, '.nojekyll'), '', 'utf8');
  if (CUSTOM_DOMAIN) {
    await writeFile(join(DIST_DIR, 'CNAME'), `${CUSTOM_DOMAIN}\n`, 'utf8');
  }
  const siteBaseUrl = CUSTOM_DOMAIN ? `https://${CUSTOM_DOMAIN}` : 'https://kalamalah.com';
  await writeFile(join(DIST_DIR, 'robots.txt'), buildRobotsTxt(siteBaseUrl), 'utf8');
  await writeFile(join(DIST_DIR, 'sitemap.xml'), buildSitemapXml(siteBaseUrl), 'utf8');

  // 3. Smart SPA/Slug Fallback 404.html (handles any dynamic slug via static-router.ts)
  const fallback404 = renderLayout({
    title: 'Kalamalah | Holy Quran',
    bodyContent: `
      <div id="static-route-placeholder" class="container" style="padding:64px 16px;text-align:center;">
        <p style="color:var(--text-secondary);font-size:1rem;">Loading...</p>
      </div>
    `,
  });
  await writeFile(join(DIST_DIR, '404.html'), markHtmlStatic(fallback404), 'utf8');

  // 4. Core offline-renderable pages
  await writeHtmlSlug('', renderHomePage());
  await writeHtmlSlug('reciters', renderRecitersDirectoryPage());
  await writeHtmlSlug('tajweed', renderTajweedGuidePage());
  await writeHtmlSlug('duas', renderDuasPage());
  await writeHtmlSlug('names', renderAsmaUlHusnaPage());
  await writeHtmlSlug('search', renderLayout({ title: 'Search', bodyContent: '<div class="container" style="padding:64px 16px;text-align:center;"><p>Search coming soon</p></div>' }));
  await writeHtmlSlug('settings', renderLayout({ title: 'Settings', bodyContent: '<div class="container" style="padding:64px 16px;text-align:center;"><p>Settings page</p></div>' }));
  await writeHtmlSlug('about', renderLayout({ title: 'About', bodyContent: '<div class="container" style="padding:64px 16px;text-align:center;"><p>About page</p></div>' }));
  await writeHtmlSlug('credits', renderLayout({ title: 'Credits', bodyContent: '<div class="container" style="padding:64px 16px;text-align:center;"><p>Credits page</p></div>' }));
  await writeHtmlSlug('privacy', renderLayout({ title: 'Privacy', bodyContent: '<div class="container" style="padding:64px 16px;text-align:center;"><p>Privacy policy</p></div>' }));

  for (const r of RECITERS_CATALOG) {
    await writeHtmlSlug(`reciter-${r.slug}`, renderReciterProfilePage(r.slug));
  }

  // 5. FULL prerender - ALL routes (always on for GitHub Pages deployment)
  console.log('[Kalamalah Static] Pre-rendering ALL routes (Surahs, Juzs, Mushaf, Languages, Tafseer)...');
    console.log('[Kalamalah Static] Pre-rendering Surahs, Juzs, Languages & Tafseer...');
    // Languages
    try {
      await writeHtmlSlug('languages', await renderLanguagesPage());
      for (const lang of TRANSLATION_EDITIONS.slice(0, 6)) {
        await writeHtmlSlug(`language-${lang.code}`, await renderLanguagesPage(lang.code));
      }
    } catch (e) {
      console.warn('[Kalamalah Static] Skipped languages prerender:', e);
    }

    // Mushaf pages (all 604)
    try {
      for (let page = 1; page <= 604; page++) {
        const p = await fetchMushafPage(page);
        await writeHtmlSlug(`mushaf-${page}`, renderMushafPageView(p));
        if (page % 50 === 0) console.log(`[Kalamalah Static] Mushaf: ${page}/604`);
      }
    } catch (e) {
      console.warn('[Kalamalah Static] Mushaf pages failed:', e);
    }

    // Tafseer pages (all books × 114 surahs)
    try {
      for (const b of TAFSEER_BOOKS) {
        for (let s = 1; s <= 114; s++) {
          await writeHtmlSlug(`tafseer-${b.id}-${s}`, await renderTafseerPageView({ bookId: b.id, surahNumber: s }));
        }
        console.log(`[Kalamalah Static] Tafseer ${b.id}: 114/114`);
      }
    } catch (e) {
      console.warn('[Kalamalah Static] Tafseer pages failed:', e);
    }

    // Pre-fetch word timings for ALL reciters from ALL providers
    const providerConfigs = [
      { key: 'kalamalah', getSlug: (r: typeof RECITERS_CATALOG[0]) => r.kalamalahSlug, hasWord: (r: typeof RECITERS_CATALOG[0]) => r.hasWordByWord && !!r.kalamalahSlug },
      { key: 'qurancdn', getSlug: (r: typeof RECITERS_CATALOG[0]) => r.qurancdnId ? String(r.qurancdnId) : null, hasWord: (r: typeof RECITERS_CATALOG[0]) => r.hasWordByWord && !!r.qurancdnId },
      { key: 'islamonline', getSlug: (r: typeof RECITERS_CATALOG[0]) => r.islamOnlineTimingSlug, hasWord: (r: typeof RECITERS_CATALOG[0]) => r.hasWordByWord && !!r.islamOnlineTimingSlug },
      { key: 'mp3quran', getSlug: (r: typeof RECITERS_CATALOG[0]) => r.mp3QuranReadId ? String(r.mp3QuranReadId) : null, hasWord: (r: typeof RECITERS_CATALOG[0]) => r.hasWordByWord && !!r.mp3QuranReadId },
    ] as const;

    type ProviderKey = typeof providerConfigs[number]['key'];

    const manifest: Record<ProviderKey, Record<string, { surahs: number[]; source: string }>> = {
      kalamalah: {},
      qurancdn: {},
      islamonline: {},
      mp3quran: {},
    };

    const bestTimings = new Map<string, { timings: NormalizedSurahTimings; provider: ProviderKey; reciterSlug: string }>();

    console.log(`[Kalamalah Static] Starting multi-provider timing export...`);

    for (const provider of providerConfigs) {
      console.log(`[Kalamalah Static] === Provider: ${provider.key} ===`);
      const providerDir = join(ROOT, 'vendor', 'timing', provider.key);
      await mkdir(providerDir, { recursive: true });

      const eligibleReciters = RECITERS_CATALOG.filter((r) => provider.hasWord(r));
      console.log(`[Kalamalah Static] ${provider.key}: ${eligibleReciters.length} eligible reciters`);

      for (const reciter of eligibleReciters) {
        const providerSlug = provider.getSlug(reciter)!;
        const reciterSurahs: number[] = [];

        for (let s = 1; s <= 114; s++) {
          try {
            const filename = `${reciter.slug}-${s}.json`;
            const filePath = join(providerDir, filename);
            let timings: NormalizedSurahTimings | null = null;
            
            if (existsSync(filePath)) {
              const fileContent = await readFile(filePath, 'utf8');
              timings = JSON.parse(fileContent);
            } else {
              // Use provider-specific slug (qurancdnId, islamOnlineTimingSlug, mp3QuranReadId)
              timings = await resolveSurahTimings(providerSlug, s);
              if (timings && timings.ayahs.length > 0 && timings.mode === 'word') {
                await writeFile(join(providerDir, filename), JSON.stringify(timings), 'utf8');
              } else {
                timings = null;
              }
            }

            if (timings && timings.ayahs.length > 0 && timings.mode === 'word') {
              reciterSurahs.push(s);

              const key = `${reciter.slug}:${s}`;
              const existing = bestTimings.get(key);
              const providerPriority: Record<ProviderKey, number> = { qurancdn: 4, islamonline: 3, kalamalah: 2, mp3quran: 1 };
              if (!existing || providerPriority[provider.key] > providerPriority[existing.provider]) {
                bestTimings.set(key, { timings, provider: provider.key, reciterSlug: reciter.slug });
              }
            }
          } catch (err) {
            console.warn(`[Kalamalah Static] ${provider.key}/${reciter.slug} surah ${s} failed:`, err);
          }
        }

        if (reciterSurahs.length > 0) {
          manifest[provider.key][reciter.slug] = { surahs: reciterSurahs, source: provider.key };
          console.log(`[Kalamalah Static] ${provider.key}/${reciter.slug}: ${reciterSurahs.length}/114 surahs`);
        }
      }
    }

    // Write manifest
    await writeFile(join(ROOT, 'vendor', 'timing', 'index.json'), JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`[Kalamalah Static] Wrote vendor/timing/index.json`);

    // Copy vendor/ NOW (after timing files generated) so dist/vendor/timing/index.json exists
    const vendorSrc = join(ROOT, 'vendor');
    if (existsSync(vendorSrc)) {
      await cp(vendorSrc, join(DIST_DIR, 'vendor'), { recursive: true });
    }

    // Build per-reciter timing caches
    const reciterTimingCaches = new Map<string, Map<number, NormalizedSurahTimings>>();
    for (const [key, entry] of bestTimings.entries()) {
      const parts = key.split(':');
      const reciterSlug = parts[0]!;
      const surahNum = parseInt(parts[1]!, 10);
      const reciterCache = reciterTimingCaches.get(reciterSlug) ?? new Map<number, NormalizedSurahTimings>();
      reciterCache.set(surahNum, entry.timings);
      reciterTimingCaches.set(reciterSlug, reciterCache);
    }

    for (const [reciterSlug, cache] of reciterTimingCaches.entries()) {
      console.log(`[Kalamalah Static] ${reciterSlug}: ${cache.size}/114 surahs with word timings`);
    }

    if (reciterTimingCaches.size === 0) {
      console.warn(`[Kalamalah Static] No word timings found from any provider!`);
    }

    let failures = 0;
    const failedSlugs: string[] = [];
    const recordFailure = (label: string, err: unknown) => {
      failures++;
      failedSlugs.push(label);
      console.error(`[Kalamalah Static] ${label} failed:`, err);
    };

    // Batch surahs (3 at a time, with delay)
    for (let s = 1; s <= 114; s += 3) {
      const batch = Array.from({ length: Math.min(3, 115 - s) }, (_, i) => s + i);
      for (const id of batch) {
        try {
          const detail = await fetchSurahDetail(id);
          const firstReciterCache = reciterTimingCaches.values().next().value;
          const timings = firstReciterCache?.get(id) ?? null;
          await writeHtmlSlug(`surah-${id}`, renderSurahPage({ surahDetail: detail, defaultTimings: timings }));
          
          // Also render surah with slug and reader routes
          const meta = SURAHS_META.find(m => m.number === id);
          if (meta) {
            const slug = meta.nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            await writeHtmlSlug(`surah-${id}-${slug}`, renderSurahPage({ surahDetail: detail, defaultTimings: timings }));
            await writeHtmlSlug(`reader-${id}-${slug}`, renderSurahPage({ surahDetail: detail, defaultTimings: timings }));
          }
          
          await new Promise((r) => setTimeout(r, 300));
        } catch (err) {
          recordFailure(`surah-${id}`, err);
        }
      }
    }

    // Batch juzs (2 at a time, with delay)
    for (let j = 1; j <= 30; j += 2) {
      const batch = Array.from({ length: Math.min(2, 31 - j) }, (_, i) => j + i);
      for (const id of batch) {
        try {
          const juzData = await fetchJuzDetail(id);
          await writeHtmlSlug(`juz-${id}`, renderJuzPageView(juzData));
          await writeHtmlSlug(`j${id}`, renderJuzPageView(juzData));
          await new Promise((r) => setTimeout(r, 300));
        } catch (err) {
          recordFailure(`juz-${id}`, err);
        }
      }
    }

    if (failures > 0) {
      throw new Error(
        `Static export incomplete: ${failures} page(s) failed (${failedSlugs.slice(0, 10).join(', ')})`
      );
    }

    // Write per-reciter timing data
    for (const [reciterSlug, cache] of reciterTimingCaches.entries()) {
      if (cache.size === 0) continue;
      const reciterTimings: Record<number, NormalizedSurahTimings> = {};
      for (const [surahNum, timings] of cache.entries()) {
        reciterTimings[surahNum] = timings;
      }
      await writeFile(
        join(DIST_DIR, `static-timings-${reciterSlug}.json`),
        JSON.stringify(reciterTimings),
        'utf8'
      );
      console.log(`[Kalamalah Static] Wrote static-timings-${reciterSlug}.json with ${cache.size} surahs`);
    }

    const availableReciters = Array.from(reciterTimingCaches.keys());
    await writeFile(
      join(DIST_DIR, 'static-timings-manifest.json'),
      JSON.stringify({ reciters: availableReciters }),
      'utf8'
    );
    console.log(`[Kalamalah Static] Wrote static-timings-manifest.json with ${availableReciters.length} reciters`);

  console.log(`[Kalamalah Static] Export complete in ${DIST_DIR} (CNAME: ${CUSTOM_DOMAIN || 'none'}).`);
}

runStaticExport().catch((err) => {
  console.error('[Kalamalah Static] Export failed:', err);
  process.exitCode = 1;
});
