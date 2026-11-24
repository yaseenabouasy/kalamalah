import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { secureHeaders } from 'hono/secure-headers';
import { join, resolve, sep } from 'node:path';
import { safeAudioUrl } from './audio-hosts';
import { buildLlmsTxt, renderMarkdownForPath } from './markdown';
import { zarazCspOrigins } from './zaraz';
import {
  fetchJuzDetail,
  fetchMushafPage,
  fetchSurahDetail,
  getSurahMeta,
  TAFSEER_BOOKS,
  TRANSLATION_EDITIONS,
} from './kalamalah-api';
import { getOrPrerenderPage } from './prerender-cache';
import { findReciter, findReciterStrict, getReciterPhotoUrl, getSurahAudioUrl, RECITERS_CATALOG } from './reciters-catalog';
import { resolveSurahTimings } from './timings-service';
import { renderHomePage } from './views/home';
import {
  renderAsmaUlHusnaPage,
  renderDuasPage,
} from './views/islamic-pages';
import {
  renderJuzPageView,
  renderLanguagesPage,
  renderTafseerPageView,
  renderTajweedGuidePage,
} from './views/juz-tafseer';
import { renderMushafPageView } from './views/mushaf';
import { buildRobotsTxt, buildSitemapXml } from './views/layout';
import { renderNotFoundPage } from './views/not-found';
import { renderReciterProfilePage, renderRecitersDirectoryPage } from './views/reciters';
import { renderSurahPage } from './views/surah';

const app = new Hono();

// Brotli/gzip for text responses (audio and images are skipped by content type).
app.use('*', compress());

// Zaraz (if loaded from an external origin) needs its origin in the CSP.
const zarazOrigins = zarazCspOrigins();

// Baseline security headers. COEP is disabled deliberately: this app loads
// cross-origin audio and images that do not send CORP/CORS headers.
// NOTE: script-src still allows 'unsafe-inline' for the early theme script in
// layout.ts; moving it to /js/theme-init.js lets this be tightened to 'self'.
app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", ...zarazOrigins],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      fontSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'", 'blob:', 'https:'],
      connectSrc: ["'self'", 'https:'],
      frameSrc: ["'self'", ...zarazOrigins],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: 'cross-origin',
    crossOriginOpenerPolicy: 'same-origin',
    referrerPolicy: 'strict-origin-when-cross-origin',
    xContentTypeOptions: 'nosniff',
    xFrameOptions: 'SAMEORIGIN',
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
  })
);
const PUBLIC_DIR = join(process.cwd(), 'public');
const VENDOR_DIR = join(process.cwd(), 'vendor');
const PUBLIC_FONTS_DIR = join(process.cwd(), 'public', 'fonts');
const PUBLIC_ICONS_DIR = join(process.cwd(), 'public', 'icons');
const MAIN_FONTS_DIR = join(process.cwd(), 'main', 'fonts');
const MAIN_ICONS_DIR = join(process.cwd(), 'main', 'icons');

function resolveSafePublicPath(baseDir: string, reqPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(reqPath);
  } catch {
    return null;
  }
  const rel = decoded.replace(/^\/+/, '');
  if (!rel || rel.includes('..') || rel.includes('\\') || rel.includes('\0')) {
    return null;
  }
  const root = resolve(baseDir);
  const full = resolve(root, rel);
  if (!full.startsWith(root + sep)) {
    return null;
  }
  return full;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

function getMimeType(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  const ext = dot !== -1 ? filePath.slice(dot).toLowerCase() : '';
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

// Helper to send prerendered HTML with ETag & Cache-Control
async function sendPrerendered(
  c: any,
  cacheKey: string,
  renderFn: () => Promise<string>
): Promise<Response> {
  const { html, etag, cacheHit } = await getOrPrerenderPage(cacheKey, renderFn);
  const ifNoneMatch = c.req.header('if-none-match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        'X-Kalamalah-Prerender': cacheHit,
      },
    });
  }
  return c.html(html, 200, {
    ETag: etag,
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
    'X-Kalamalah-Prerender': cacheHit,
  });
}

// ============================================================================
// 0. MARKDOWN TWINS (`<page>.md`) + /llms.txt
// ============================================================================
// Registered as middleware so it wins regardless of route ordering. No HTML is
// rendered or parsed: the Markdown is built from the same cached JSON the pages
// use, so a warm hit is a single string concatenation.
app.use('*', async (c, next) => {
  const path = c.req.path;
  if (!path.endsWith('.md')) {
    await next();
    return;
  }

  const base = path.slice(0, -3) || '/';
  const doc = await renderMarkdownForPath(base, {
    translation: c.req.query('translation'),
    surah: c.req.query('surah'),
  });
  if (!doc) {
    return c.text('Not found', 404, { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  const etag = `"md-${new Bun.CryptoHasher('sha1').update(doc.markdown).digest('hex').slice(0, 16)}"`;
  // compress() downgrades this to a weak tag, so compare with `W/` stripped.
  const ifNoneMatch = c.req.header('if-none-match')?.replace(/^W\//, '');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return c.body(doc.markdown, 200, {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    ETag: etag,
    'X-Robots-Tag': 'index, follow',
    'X-Kalamalah-Format': 'markdown',
  });
});

app.get('/llms.txt', (c) =>
  c.text(buildLlmsTxt(), 200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  })
);

// ============================================================================
// 1. STATIC ASSETS (/favicon/*, /images/*, /css/*, /js/*, /site.webmanifest)
// ============================================================================
app.get('/site.webmanifest', async () => {
  const file = Bun.file(join(PUBLIC_DIR, 'favicon', 'site.webmanifest'));
  return new Response(file, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

app.get('/manifest.webmanifest', async (c) => {
  const file = Bun.file(join(PUBLIC_DIR, 'manifest.webmanifest'));
  if (!(await file.exists())) return c.notFound();
  return new Response(file, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

// Service worker must be served from the origin root for full scope; keep it
// uncached so a new worker is picked up on the next navigation.
app.get('/sw.js', async (c) => {
  const file = Bun.file(join(PUBLIC_DIR, 'sw.js'));
  if (!(await file.exists())) return c.notFound();
  return new Response(file, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    },
  });
});

app.get('/favicon/*', async (c) => {
  const safePath = resolveSafePublicPath(PUBLIC_DIR, c.req.path);
  if (!safePath) return c.notFound();
  const file = Bun.file(safePath);
  if (await file.exists()) {
    return new Response(file, {
      headers: {
        'Content-Type': getMimeType(safePath),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }
  return c.notFound();
});

app.get('/images/*', async (c) => {
  const safePath = resolveSafePublicPath(PUBLIC_DIR, c.req.path);
  if (!safePath) return c.notFound();
  const file = Bun.file(safePath);
  if (await file.exists()) {
    return new Response(file, {
      headers: {
        'Content-Type': getMimeType(safePath),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }
  return c.notFound();
});

app.get('/css/*', async (c) => {
  const safePath = resolveSafePublicPath(PUBLIC_DIR, c.req.path);
  if (!safePath) return c.notFound();
  const file = Bun.file(safePath);
  if (await file.exists()) {
    return new Response(file, {
      headers: {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  return c.notFound();
});

app.get('/js/*', async (c) => {
  const safePath = resolveSafePublicPath(PUBLIC_DIR, c.req.path);
  if (!safePath) return c.notFound();
  const file = Bun.file(safePath);
  if (await file.exists()) {
    return new Response(file, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  return c.notFound();
});

// Self-hosted vendor assets (fonts, AeroUI components, pre-fetched timings).
app.get('/vendor/*', async (c) => {
  const rel = c.req.path.replace(/^\/vendor\/+/, '');
  const safePath = resolveSafePublicPath(VENDOR_DIR, rel);
  if (!safePath) return c.notFound();
  const file = Bun.file(safePath);
  if (await file.exists()) {
    const ext = safePath.slice(safePath.lastIndexOf('.')).toLowerCase();
    const immutable = ['.woff2', '.woff', '.ttf', '.otf'].includes(ext);
    return new Response(file, {
      headers: {
        'Content-Type': getMimeType(safePath),
        'Cache-Control': immutable
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600',
      },
    });
  }
  return c.notFound();
});

app.get('/fonts/*', async (c) => {
  let fileName = '';
  try {
    fileName = decodeURIComponent(c.req.path.replace(/^\/fonts\/+/, ''));
  } catch {
    return c.notFound();
  }
  if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\') || fileName.includes('\0')) {
    return c.notFound();
  }
  const pubFile = Bun.file(join(PUBLIC_FONTS_DIR, fileName));
  if (await pubFile.exists()) {
    return new Response(pubFile, {
      headers: {
        'Content-Type': getMimeType(fileName),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }
  const mainFile = Bun.file(join(MAIN_FONTS_DIR, fileName));
  if (await mainFile.exists()) {
    return new Response(mainFile, {
      headers: {
        'Content-Type': getMimeType(fileName),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }
  return c.notFound();
});

app.get('/icons/*', async (c) => {
  let fileName = '';
  try {
    fileName = decodeURIComponent(c.req.path.replace(/^\/icons\/+/, ''));
  } catch {
    return c.notFound();
  }
  if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\') || fileName.includes('\0')) {
    return c.notFound();
  }
  const pubFile = Bun.file(join(PUBLIC_ICONS_DIR, fileName));
  if (await pubFile.exists()) {
    return new Response(pubFile, {
      headers: {
        'Content-Type': getMimeType(fileName),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }
  const fallbackFile = Bun.file(join(MAIN_ICONS_DIR, fileName));
  if (await fallbackFile.exists()) {
    return new Response(fallbackFile, {
      headers: {
        'Content-Type': getMimeType(fileName),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }
  return c.notFound();
});

app.get('/api/reciter-avatar/:slug', async (c) => {
  const slug = c.req.param('slug').trim();
  const reciter = RECITERS_CATALOG.find(
    (r) => r.slug === slug || r.kalamalahSlug === slug || String(r.id) === slug
  );
  const targetUrl = reciter
    ? getReciterPhotoUrl(reciter)
    : `https://api.kalamalah.com/api/reciter-profile/${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const ct = res.headers.get('content-type') || 'image/jpeg';
      const buf = await res.arrayBuffer();
      return new Response(buf, {
        headers: {
          'Content-Type': ct,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }
  } catch {}
  const fallbackFile = Bun.file(join(PUBLIC_DIR, 'images', 'round-logo.png'));
  return new Response(fallbackFile, {
    headers: {
      'Content-Type': 'image/png',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

// ============================================================================
// 2. LIVE JSON API ENDPOINTS (Audio Timings, Surah Data, Tafseer, Reciters)
// ============================================================================
app.get('/api/reciters', (c) => {
  return c.json({ ok: true, reciters: RECITERS_CATALOG });
});

app.get('/api/timings/:reciter/:surah', async (c) => {
  const reciterParam = c.req.param('reciter');
  const surahNum = Number(c.req.param('surah'));
  const reciter = findReciterStrict(reciterParam);
  if (!reciter) return c.json({ ok: false, error: 'unknown_reciter' }, 404);
  if (!Number.isInteger(surahNum) || surahNum < 1 || surahNum > 114) {
    return c.json({ ok: false, error: 'invalid_surah' }, 400);
  }
  const timings = await resolveSurahTimings(reciter.slug, surahNum);
  // Only cache success for a day; transient resolution failures retry soon.
  const cacheControl = timings.mode === 'none' ? 'public, max-age=60' : 'public, max-age=86400';
  return c.json(timings, 200, {
    'Cache-Control': cacheControl,
  });
});

app.get('/api/surah/:id', async (c) => {
  const surahId = Number(c.req.param('id'));
  if (!Number.isInteger(surahId) || surahId < 1 || surahId > 114) {
    return c.json({ ok: false, error: 'invalid_surah' }, 400);
  }
  // Canonicalize editions before fetching so arbitrary query strings cannot
  // mint unbounded upstream/cache entries.
  const transQuery = c.req.query('translation') || 'en.sahih';
  const tafQuery = c.req.query('tafseer') || 'ar.muyassar';
  const transMeta = TRANSLATION_EDITIONS.find(
    (e) => e.editionId === transQuery || e.code === transQuery
  );
  const tafMeta = TAFSEER_BOOKS.find(
    (b) => b.editionId === tafQuery || String(b.id) === tafQuery
  );
  if (!transMeta || !tafMeta) {
    return c.json({ ok: false, error: 'unknown_edition' }, 404);
  }
  const detail = await fetchSurahDetail(surahId, transMeta.editionId, tafMeta.editionId);
  return c.json({
    ok: true,
    meta: detail.meta,
    translationEdition: transMeta.editionId,
    translationName: transMeta.languageNameAr,
    translationDir: transMeta.dir,
    tafseerEdition: tafMeta.editionId,
    tafseerNameAr: tafMeta.nameAr,
    tafseerBookId: tafMeta.id,
    ayahs: detail.ayahs.map((a) => ({
      n: a.numberInSurah,
      text: a.text,
      tr: a.translationText ?? '',
      taf: a.tafseerText ?? '',
      p: a.page,
      j: a.juz,
    })),
  });
});

app.get('/api/download/:reciter/:surah', async (c) => {
  const reciterParam = c.req.param('reciter');
  const reciter = findReciterStrict(reciterParam);
  if (!reciter) return c.json({ ok: false, error: 'unknown_reciter' }, 404);
  const surahNum = Number(c.req.param('surah'));
  if (!Number.isInteger(surahNum) || surahNum < 1 || surahNum > 114) {
    return c.json({ ok: false, error: 'invalid_surah' }, 400);
  }
  const surahMeta = getSurahMeta(surahNum);
  const timings = await resolveSurahTimings(reciter.slug, surahNum).catch(() => null);
  const audioUrl = safeAudioUrl(timings?.audioUrl, getSurahAudioUrl(reciter, surahNum));
  const padded = String(surahNum).padStart(3, '0');
  const safeFileName = `Kalamalah-${padded}-${surahMeta.nameEn.replace(/[^a-zA-Z0-9_-]/g, '')}-${reciter.slug}.mp3`;
  const range = c.req.header('range');
  const ifRange = c.req.header('if-range');

  // Bound only the wait for response headers. Once they arrive the clock is
  // cleared, so a 40 MB surah streams to completion instead of being cut off.
  const controller = new AbortController();
  const headerTimer = setTimeout(() => controller.abort(), 15000);

  try {
    const upstream = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'KalamalahPlayer/1.0',
        ...(range ? { Range: range } : {}),
        ...(ifRange ? { 'If-Range': ifRange } : {}),
      },
      signal: controller.signal,
    });
    clearTimeout(headerTimer);

    if ((upstream.ok || upstream.status === 206) && upstream.body) {
      const headers: Record<string, string> = {
        'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${safeFileName}"`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400',
      };
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) headers['Content-Length'] = contentLength;
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) headers['Content-Range'] = contentRange;

      return new Response(upstream.body, {
        status: upstream.status === 206 ? 206 : 200,
        headers,
      });
    }
  } catch {
    // Fall through to the hard failure below.
  } finally {
    clearTimeout(headerTimer);
  }

  // Never redirect to an unvalidated URL; fail hard instead of becoming an open redirect.
  return c.text('Upstream audio unavailable', 502);
});

app.get('/api/tafseer/:bookId/:surah/:ayah', async (c) => {
  const bookId = Number(c.req.param('bookId'));
  const surahNum = Number(c.req.param('surah'));
  const ayahNum = Number(c.req.param('ayah'));
  const book = TAFSEER_BOOKS.find((b) => b.id === bookId);
  if (!book) return c.json({ ok: false, error: 'unknown_tafseer_book' }, 404);
  if (
    !Number.isInteger(surahNum) || surahNum < 1 || surahNum > 114 ||
    !Number.isInteger(ayahNum) || ayahNum < 1
  ) {
    return c.json({ ok: false, error: 'invalid_reference' }, 400);
  }
  const detail = await fetchSurahDetail(surahNum, 'en.sahih', book.editionId);
  const targetAyah = detail.ayahs.find((a) => a.numberInSurah === ayahNum) ?? detail.ayahs[0];
  return c.json({
    ok: true,
    bookNameAr: book.nameAr,
    authorAr: book.authorAr,
    surahNumber: surahNum,
    surahNameAr: detail.meta.nameAr,
    ayahNumber: ayahNum,
    arabicText: targetAyah?.text ?? '',
    tafseerText: targetAyah?.tafseerText ?? '',
  });
});

// ============================================================================
// 3. SMART PHP-STYLE SSR & PRERENDERED ROUTES
// ============================================================================

app.get('/robots.txt', (c) => {
  return c.text(buildRobotsTxt(), 200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
  });
});

app.get('/sitemap.xml', (c) => {
  return c.body(buildSitemapXml(), 200, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
  });
});

// Home Page
app.get('/', async (c) => {
  return sendPrerendered(c, 'home', async () => renderHomePage());
});
app.get('/index.php', (c) => c.redirect('/', 301));

// Reciters Directory
app.get('/reciters', async (c) => {
  return sendPrerendered(c, 'reciters-dir', async () => renderRecitersDirectoryPage());
});

// Tajweed Guide
app.get('/tajweed', async (c) => {
  return sendPrerendered(c, 'tajweed-guide', async () => renderTajweedGuidePage());
});

// Translations / Languages Directory
app.get('/languages', async (c) => {
  return sendPrerendered(c, 'languages-index', async () => renderLanguagesPage());
});

// Duas & Adhkar Page
app.get('/duas', async (c) => {
  return sendPrerendered(c, 'duas-page', async () => renderDuasPage());
});

// 99 Names of Allah (Asma ul Husna)
app.get('/names', async (c) => {
  return sendPrerendered(c, 'asma-ul-husna', async () => renderAsmaUlHusnaPage());
});
app.get('/asma-ul-husna', (c) => c.redirect('/names', 301));

// Mushaf Root Redirect
app.get('/mushaf', (c) => c.redirect('/mushaf-1', 302));

// Dynamic Smart Route Dispatcher (matches /surah-1, /view-2,from-255,to-257, /reciter-1, /reader-1-haitham-al-dukhin, /mushaf-1, /juz-1, /tafseer-1, /t-1-1-1, /language-en)
app.get('/:slug', async (c) => {
  const slug = c.req.param('slug').trim();

  // 1) /surah-{id}
  const surahMatch = /^surah-(\d+)$/i.exec(slug);
  if (surahMatch) {
    const surahId = Number(surahMatch[1]);
    if (surahId >= 1 && surahId <= 114) {
      return sendPrerendered(c, `surah-${surahId}`, async () => {
        const detail = await fetchSurahDetail(surahId);
        return renderSurahPage({ surahDetail: detail });
      });
    }
  }

  // 2) /view-{id},from-{from},to-{to}
  const viewRangeMatch = /^view-(\d+),from-(\d+),to-(\d+)$/i.exec(slug);
  if (viewRangeMatch) {
    const surahId = Number(viewRangeMatch[1]);
    if (surahId >= 1 && surahId <= 114) {
      // Clamp the range so the cache key space stays bounded and cannot be
      // inflated with arbitrary X/Y values.
      const ayahCount = getSurahMeta(surahId).ayahCount;
      const fromAyah = Math.min(Math.max(1, Number(viewRangeMatch[2])), ayahCount);
      const toAyah = Math.min(Math.max(fromAyah, Number(viewRangeMatch[3])), ayahCount);
      return sendPrerendered(c, `view-${surahId}-${fromAyah}-${toAyah}`, async () => {
        const detail = await fetchSurahDetail(surahId);
        return renderSurahPage({ surahDetail: detail, fromAyah, toAyah });
      });
    }
  }

  // 3) /reader-{surah}-{reciterSlugOrId}
  const readerMatch = /^reader-(\d+)-([a-zA-Z0-9_-]{1,64})$/i.exec(slug);
  if (readerMatch) {
    const surahId = Number(readerMatch[1]);
    const reciter = findReciterStrict(readerMatch[2]!);
    if (surahId >= 1 && surahId <= 114 && reciter) {
      // Key on the canonical slug, never the raw request text.
      return sendPrerendered(c, `reader-${surahId}-${reciter.slug}`, async () => {
        const detail = await fetchSurahDetail(surahId);
        return renderSurahPage({ surahDetail: detail, initialReciterSlug: reciter.slug });
      });
    }
  }

  // 4) /reciter-{idOrSlug}
  const reciterMatch = /^reciter-([a-zA-Z0-9_-]{1,64})$/i.exec(slug);
  if (reciterMatch) {
    const reciter = findReciterStrict(reciterMatch[1]!);
    if (!reciter) return c.notFound();
    return sendPrerendered(c, `reciter-${reciter.slug}`, async () =>
      renderReciterProfilePage(reciter.slug)
    );
  }

  // 5) /mushaf-{page}
  const mushafMatch = /^mushaf-(\d+)$/i.exec(slug);
  if (mushafMatch) {
    const pageNum = Number(mushafMatch[1]);
    if (pageNum >= 1 && pageNum <= 604) {
      return sendPrerendered(c, `mushaf-${pageNum}`, async () => {
        const pageData = await fetchMushafPage(pageNum);
        return renderMushafPageView(pageData);
      });
    }
  }

  // 6) /juz-{id}
  const juzMatch = /^juz-(\d+)$/i.exec(slug);
  if (juzMatch) {
    const juzNum = Number(juzMatch[1]);
    if (juzNum >= 1 && juzNum <= 30) {
      return sendPrerendered(c, `juz-${juzNum}`, async () => {
        const juzData = await fetchJuzDetail(juzNum);
        return renderJuzPageView(juzData);
      });
    }
  }

  // 7) /tafseer-{id}?surah=N
  const tafseerMatch = /^tafseer-(\d+)$/i.exec(slug);
  if (tafseerMatch) {
    const book = TAFSEER_BOOKS.find((b) => b.id === Number(tafseerMatch[1]));
    if (!book) return c.notFound();
    const surahQuery = Number(c.req.query('surah') ?? 1);
    if (!Number.isInteger(surahQuery) || surahQuery < 1 || surahQuery > 114) {
      return c.notFound();
    }
    return sendPrerendered(c, `tafseer-${book.id}-s${surahQuery}`, async () =>
      renderTafseerPageView({ bookId: book.id, surahNumber: surahQuery })
    );
  }

  // 8) /t-{surah}-{tafseer}-{ayah}
  const singleTafseerMatch = /^t-(\d+)-(\d+)-(\d+)$/i.exec(slug);
  if (singleTafseerMatch) {
    const surahNum = Number(singleTafseerMatch[1]);
    const book = TAFSEER_BOOKS.find((b) => b.id === Number(singleTafseerMatch[2]));
    const ayahNum = Number(singleTafseerMatch[3]);
    if (
      !book ||
      !Number.isInteger(surahNum) || surahNum < 1 || surahNum > 114 ||
      !Number.isInteger(ayahNum) || ayahNum < 1 ||
      ayahNum > getSurahMeta(surahNum).ayahCount
    ) {
      return c.notFound();
    }
    return sendPrerendered(c, `t-${surahNum}-${book.id}-${ayahNum}`, async () =>
      renderTafseerPageView({ bookId: book.id, surahNumber: surahNum, ayahNumber: ayahNum })
    );
  }

  // 9) /language-{code}
  const langMatch = /^language-([a-z]{2,5})$/i.exec(slug);
  if (langMatch) {
    const code = langMatch[1]!.toLowerCase();
    // Allow-list known editions so arbitrary codes cannot mint cache keys.
    const known =
      code === 'ar' || TRANSLATION_EDITIONS.some((e) => e.code.toLowerCase() === code);
    if (!known) return c.notFound();
    return sendPrerendered(c, `language-${code}`, async () => renderLanguagesPage(code));
  }

  // Fallback to 404
  return c.html(renderNotFoundPage(c.req.path), 404);
});

app.notFound((c) => {
  return c.html(renderNotFoundPage(c.req.path), 404);
});

// An upstream outage must surface as 502, not as a cached empty page.
app.onError((err, c) => {
  console.error('[Kalamalah] Unhandled route error:', err);
  if (c.req.path.startsWith('/api/')) {
    return c.json({ ok: false, error: 'upstream_unavailable' }, 502);
  }
  return c.text('Service temporarily unavailable', 502);
});

// Background Prerender Warm-up for instant 0ms response on key static routes
async function warmUpPrerenderCache(): Promise<void> {
  // Warm each entry independently: one upstream failure must not skip the rest.
  const warm = async (key: string, render: () => Promise<string>) => {
    try {
      await getOrPrerenderPage(key, render);
    } catch (err) {
      console.warn(`[Kalamalah] Warm-up failed for ${key}:`, err);
    }
  };

  await warm('home', async () => renderHomePage());
  await warm('reciters-dir', async () => renderRecitersDirectoryPage());
  await warm('tajweed-guide', async () => renderTajweedGuidePage());
  for (const sId of [1, 18, 36, 55, 67, 112]) {
    await warm(`surah-${sId}`, async () => {
      const detail = await fetchSurahDetail(sId);
      return renderSurahPage({ surahDetail: detail });
    });
  }
}

const PORT = Number(process.env.PORT || 3000);

console.log(`🌙 Kalamalah Player SSR & Prerender Server running at http://localhost:${PORT}`);
warmUpPrerenderCache();

export default {
  port: PORT,
  fetch: app.fetch,
};
