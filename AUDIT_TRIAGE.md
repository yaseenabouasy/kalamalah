# Kalamalah — Audit Triage

Status: **planning only, no source changes made.**
Every claim below was re-checked against the repository (line numbers are from the current working tree). Items I could not confirm without running the app or calling upstream APIs are marked **(verify)**.

---

## 0. How this doc is organized

1. Corrections to the original audit (so we don't fix stale findings).
2. P0 — patch-ready, 7 items.
3. P1 — patch-ready or near, 9 items.
4. P2 / P3 — grouped, mostly mechanical.
5. PageSpeed — mapped to file:line.
6. Rollout order + verification commands.
7. Open questions that need a runtime/upstream check.

Conventions: `P0` = security/data-loss/incorrect output, fix before next deploy. `P1` = visible breakage or major UX cost. `P2` = quality/SEO/perf. `P3` = cleanup.

---

## 1. Corrections to the audit

| Audit claim | Actual | Impact |
|---|---|---|
| `sw.js` uses `CACHE_NAME = v1` | `CACHE_VERSION = 'kalamalah-v2'` (`public/sw.js:1`), cache-first for **everything**, `/` in the precache list | The version number is stale in the audit but the underlying bug (cache-first HTML, stale `app.js`) is real |
| `cache.addAll(['/', '/manifest.webmanifest'])` fails | `STATIC_ASSETS` is `['/', '/manifest.json', '/release.json', '/images/round-logo.png']`; `public/manifest.json` exists; the layout links `/favicon/site.webmanifest` | Precache probably *succeeds*; the real gaps are (a) no `/sw.js` route in SSR (`src/server/index.ts` has no handler, `/:slug` catch-all 404s it), (b) cache-first navigations |
| "no `/sw.js` route" | True — `public/sw.js` is only served by the static export's `cp(PUBLIC_DIR, DIST_DIR)` | SSR deployments never register a SW |
| `offsets.json` should replace `test_001.json` | `offsets.json` **already exists** at repo root, is unused, and only contains surah 1 rows with `confidence: 0.0` | Don't ship it as-is; it needs regenerating first |
| `.gitignore` excludes `pnpm-lock.yaml` | Confirmed (`pnpm-lock.yaml` line). The file exists on disk but is untracked | CI/Docker get a floating dependency graph |

One finding is **weaker** than it first looked (downgraded to P3 cleanup):

- `src/server/index.ts:35-36` and `static-export.ts:22-23` use `main/fonts` / `main/icons` as fallbacks, but `.gitignore` excludes `/main/`. Verified: `git ls-files -- main` → **0 tracked files**, while `main/` holds ~70 untracked files locally.
- This is **not** a production problem: all four preloaded fonts (`UthmanicHafs_V22`, `sfarabic`, `SF-Pro-Display-Regular`, `SF-Pro-Display-Bold`) are tracked in `public/fonts/`, and all seven icons referenced by the layout are tracked in `public/icons/`. So the fallback branches are simply inert, and `main/` is untracked duplication. Remove the fallback code and the directory, or track it deliberately — but nothing user-facing breaks.

### Checked and cleared

`src/server/static-export.ts:80-88` looked like missing `await`s, but all 15 renderers were checked (`grep '^export (async )?function render'`):

- Sync: `renderHomePage`, `renderRecitersDirectoryPage`, `renderReciterProfilePage`, `renderTajweedGuidePage`, `renderDuasPage`, `renderAsmaUlHusnaPage`, `renderSurahPage`, `renderJuzPageView`, `renderMushafPageView`, `renderLayout`, `renderNotFoundPage`.
- Async: `renderLanguagesPage` (`juz-tafseer.ts:207`), `renderTafseerPageView` (`juz-tafseer.ts:87`) — both correctly `await`ed.

No `[object Promise]` bug, and no latent one: `writeHtmlSlug(slugPath, html: string)` would reject a `Promise<string>` at compile time, so `tsc --noEmit` catches any future regression.

---

## 2. P0 — patch-ready

### P0-1 · Script breakout in bootstrap JSON
**File:** `src/server/views/layout.ts:851` (payload built at `:195-223`)

Confirmed: `JSON.stringify(clientCatalogBootstrap)` is interpolated raw. `pageData.ayahs` carries upstream Arabic, translation and tafseer text; a `</script>` anywhere in it closes the tag.

```ts
// layout.ts — add next to escapeHtml (line ~35)
export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
```

```diff
-  <script id="kalamalah-bootstrap" type="application/json">${JSON.stringify(clientCatalogBootstrap)}</script>
+  <script id="kalamalah-bootstrap" type="application/json">${safeJsonForScript(clientCatalogBootstrap)}</script>
```

Also refactor `buildDiscordComponentEmbedJson` / `buildStructuredDataJson` to reuse the helper (they only escape `<` today; `\u2028/\u2029` still break JSON.parse in older engines).

### P0-2 · SSRF / open proxy
**Files:** `src/server/index.ts:320-347`, `src/server/timings-service.ts:244-248` and `:306`

Confirmed: the Kalamalah parser accepts any string containing `api.kalamalah.com/api/`; the QuranCDN parser accepts `audioFile.audio_url` with **no** validation at all; `/api/download` then `fetch`es it server-side and, on failure, `302`s to it.

New shared module `src/server/audio-hosts.ts`:

```ts
const ALLOWED_AUDIO_HOSTS = new Set([
  'api.kalamalah.com',
  'cdn.islam-online.net',
  'download.quranicaudio.com',
  'server11.mp3quran.net',
  'server12.mp3quran.net',
  'verses.quran.com',
]);

export function safeAudioUrl(raw: unknown, fallback: string): string {
  if (typeof raw === 'string') {
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:' && ALLOWED_AUDIO_HOSTS.has(u.hostname)) {
        return u.href;
      }
    } catch {
      /* ignore */
    }
  }
  return fallback;
}
```

Apply in `parseKalamalahTimingsJson`:
```diff
-  const cleanAudioUrl =
-    typeof metaAudioUrl === 'string' && metaAudioUrl.includes('api.kalamalah.com/api/')
-      ? metaAudioUrl.replace(/\.mp3$/i, '')
-      : defaultAudioUrl;
+  const cleanAudioUrl = safeAudioUrl(metaAudioUrl, defaultAudioUrl).replace(/\.mp3$/i, '');
```
Apply in `parseQuranCdnTimingsJson`:
```diff
-    audioUrl: audioFile?.audio_url ?? defaultAudioUrl,
+    audioUrl: safeAudioUrl(audioFile?.audio_url, defaultAudioUrl),
```
Re-validate at the trust boundary in `/api/download` (never rely on upstream parsers alone):
```diff
-  const audioUrl = timings?.audioUrl || getSurahAudioUrl(reciter, surahNum);
+  const audioUrl = safeAudioUrl(timings?.audioUrl, getSurahAudioUrl(reciter, surahNum));
   ...
-  return c.redirect(audioUrl, 302);
+  return c.text('Upstream audio unavailable', 502);
```
The fallback in the redirect path must be a **known-good** URL (`getSurahAudioUrl`), never `audioUrl`.

### P0-3 · Unbounded cache keys
**Files:** `src/server/timings-service.ts:27,81-84`, `src/server/kalamalah-api.ts:213-234`, `src/server/index.ts:422-527`

Three separate leaks:

**(a) Route-level keys minted from attacker text** (`index.ts`):
- `reader-${surahId}-${reciterKey}` — `reciterKey` is raw; an unknown slug still renders with `RECITERS_CATALOG[0]` (via `renderSurahPage` → `findReciter`).
- `reciter-${reciterKey}`, `language-${code}`, `tafseer-${id}-s${surahQuery}`, `t-…`, `view-…` all accept unbounded input.
- `tafseer-` has **no range check at all** (`tafseerId` and `surahQuery` are not validated).
- `view-` does not clamp `from`/`to` to `1..ayahCount`.

Add a strict lookup and 404 on miss:
```ts
// reciters-catalog.ts
export function findReciterStrict(idOrSlug: string | number): ReciterInfo | null {
  const raw = String(idOrSlug).trim().toLowerCase();
  if (!raw || raw.length > 64) return null;
  const num = Number(raw);
  if (!Number.isNaN(num)) return RECITERS_CATALOG.find((r) => r.id === num) ?? null;
  return RECITERS_CATALOG.find(
    (r) =>
      r.slug.toLowerCase() === raw ||
      r.kalamalahSlug?.toLowerCase() === raw ||
      r.islamOnlineTimingSlug?.toLowerCase() === raw
  ) ?? null;
}
export function findReciter(x: string | number): ReciterInfo {
  return findReciterStrict(x) ?? RECITERS_CATALOG[0]!;
}
```
Then in the dispatcher, canonicalize **before** building the key:
```ts
const reciter = findReciterStrict(reciterKey);
if (!reciter) return c.notFound();
const key = `reader-${surahId}-${reciter.slug}`;
```
Language: allow-list `TRANSLATION_EDITIONS.map(e => e.code)` plus `'ar'`; 404 otherwise. Tafseer: require `TAFSEER_BOOKS.some(b => b.id === id)` and `Number.isInteger(surah)` in `1..114`. View: `1 ≤ from ≤ to ≤ ayahCount`.

**(b) `timingsMemoryCache` never evicts** (`timings-service.ts:27`): every `(reciter, surah)` pair is bounded (≤ 30 × 114), so this one is fine once input is validated — but add a cap anyway for defence in depth.

**(c) `memoryApiCache` keyed by full URL incl. query** (`kalamalah-api.ts:216-234`): `/api/surah/:id?translation=&tafseer=` lets anyone create unlimited `{URL → JSON}` entries. Fix at the route (`index.ts:291-299`): validate `transTranslation`/`tafTafseer` against `TRANSLATION_EDITIONS` / `TAFSEER_BOOKS` and rewrite to the canonical `editionId` before calling `fetchSurahDetail`. Then add an LRU:

```ts
const MAX_API_CACHE = 250;
function lruSet<T>(map: Map<string, T>, key: string, value: T) {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_API_CACHE) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}
```
Use `lruSet(memoryApiCache, url, { data: json, expiresAt: now + ttlMs })` and on hit re-insert to refresh recency.

### P0-4 · Disk cache key collisions
**File:** `src/server/prerender-cache.ts:25-28`

Confirmed: `view-1,from-2` and `view-1_from-2` both map to `view-1_from-2.html`. One route can serve another's HTML.

```ts
import { createHash } from 'node:crypto';

function sanitizeKeyToFile(key: string): string {
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 16);
  return join(CACHE_DIR, `${hash}.html`);
}
```
Bump `PRERENDER_CACHE_VERSION` (`:11`) so old files are abandoned rather than orphaned into the new namespace.

### P0-5 · Failed renders cached forever
**Files:** `src/server/kalamalah-api.ts:241-335`, `src/server/prerender-cache.ts:40-73`, `src/server/static-export.ts:116-135`

Confirmed chain:
1. `fetchSurahDetail` returns `{ meta, ayahs: [] }` when both upstreams fail.
2. `sendPrerendered` → `getOrPrerenderPage` caches whatever string comes back; the disk branch (`:54-60`) has **no TTL check**.
3. Static export wraps batches in `Promise.allSettled` and never inspects results, so CI happily deploys verse-less pages.

Fixes:
```diff
// kalamalah-api.ts — end of fetchSurahDetail
+  if (ayahs.length === 0) {
+    throw new Error(`No ayahs returned for surah ${meta.number}`);
+  }
   return { meta, ayahs };
```
```ts
// prerender-cache.ts — enforce TTL on the disk branch
const st = await stat(filePath);
if (st.mtimeMs && now - st.mtimeMs < ttlMs) { /* serve */ }
else { /* fall through to render, overwrite */ }
```
```ts
// index.ts — sendPrerendered stays as-is; the throw now propagates
// and Hono returns 500. Prefer an explicit 502:
app.onError((err, c) =>
  c.req.path.startsWith('/api/')
    ? c.json({ ok: false, error: 'upstream_unavailable' }, 502)
    : c.text('Service temporarily unavailable', 502)
);
```
```ts
// static-export.ts — count failures, abort under threshold
let ok = 0, failed = 0;
await Promise.allSettled(batch.map(async (id) => {
  try {
    const detail = await fetchSurahDetail(id);
    await writeHtmlSlug(`surah-${id}`, renderSurahPage({ surahDetail: detail }));
    ok++;
  } catch (e) {
    failed++;
    console.error(`[Static] surah-${id} failed:`, e);
  }
}));
// after loops:
if (failed > 0) throw new Error(`Static export produced ${failed} empty pages`);
```
Also `warmUpPrerenderCache` (`index.ts:534-548`) must wrap each item individually, otherwise the first failure skips the rest.

### P0-6 · Unsafe `innerHTML` sinks
**Files:** `src/client/hifz-tools.ts` (`${promptAyah.text}`), `src/client/tv-display.ts` (`${times.city}`)

Use the same `escapeHtml` already exported from `src/server/views/layout.ts` — but that is server-side. Add a tiny client copy `src/client/escape-html.ts` (8 lines) and use it, or switch those nodes to `textContent` + `createElement`. `textContent` is preferable where the node is pure text.

**(verify)** exact line numbers before patching; the audit did not quote them.

---

## 3. P1

### P1-1 · Stacked listeners after soft navigation
**Files:** `src/client/app.ts` (`reinitPageContent`), `src/client/reading-tools.ts`, `src/client/searchable-dropdown.ts`

The audit's diagnosis is consistent with the ID wiring: header/lang/theme controls live in the persistent layout, while `reinitPageContent` re-runs page initializers. Split into:
- `initChromeOnce()` — header buttons, drawer, footer dropdown, modals, theme, `beforeunload`/`pagehide`. Guard with a module-level `let chromeBound = false`.
- `initPage(signal: AbortSignal)` — everything under `#main-content`; pass `{ signal }` to every `addEventListener`, and `controller.abort()` before each swap.

**Verify first:** grep each `addEventListener` in `app.ts` and classify target → persistent vs page-scoped. This is the single largest refactor in the list; do it as its own PR.

### P1-2 · Memorize mode leaks answers
**Files:** `src/client/word-meaning.ts:109` vs `src/client/reading-tools.ts:175-189`

Confirmed exact mismatch:
- `reading-tools.ts` toggles `memo-hidden-word` / `memo-revealed-word`.
- `word-meaning.ts:109` checks `is-memo-hidden` / `is-memo-revealed`.

One-line fix in `word-meaning.ts`:
```diff
-    if (wordEl.classList.contains('is-memo-hidden') && !wordEl.classList.contains('is-memo-revealed')) {
+    if (wordEl.classList.contains('memo-hidden-word') && !wordEl.classList.contains('memo-revealed-word')) {
```
Also `quran-player.ts:1303` already uses `memo-hidden-word` — consistent.

### P1-3 · Keyboard shortcuts point at dead IDs
**File:** `src/client/app.ts:1126,1142,1146`

Confirmed: `qp-play-btn`, `qp-mute-btn`, `qp-fullscreen-btn` do not exist. Real IDs: `qp-play-toggle-btn`, `qp-expand-fullscreen-btn`; **no mute button exists** (`layout.ts:639-712`). Also `Space` fires while a button is focused → double toggle, and `public/js/app.js` contains a second copy of the shortcut logic (stale build artifact).

Fix: point at the real IDs, drop the mute branch or add a mute button, and guard:
```ts
const el = e.target as HTMLElement | null;
if (el?.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]')) return;
```
Delete `public/js/app.js` from git and build it in CI (it is currently committed).

### P1-4 · Sleep timer does not stop at end of surah
**Files:** `src/client/quran-player.ts` (`ended` handler), `src/client/sleep-timer.ts`

Add `stopAfterSurah`, set from the timer, and check it first in `ended` before `playSurah(next)`. Also set a generation token so an in-flight `play()` resolves and sees the flag.

### P1-5 · `/api/download` truncates + cannot resume
**File:** `src/server/index.ts:330-347`

`AbortSignal.timeout(25000)` covers the body stream, so large surahs cut off. Forward `Range`/`If-Range`, return `206`, `Content-Length`, `Accept-Ranges: bytes`, and only time out until headers arrive:
```ts
const upstream = await fetch(audioUrl, {
  headers: {
    'User-Agent': 'KalamalahPlayer/1.0',
    ...(range ? { Range: range } : {}),
    ...(ifRange ? { 'If-Range': ifRange } : {}),
  },
  signal: AbortSignal.timeout(15000), // headers only
});
// then stream upstream.body with no timeout
```
Add per-IP rate limiting (Hono middleware or Cloudflare) in the same change — this endpoint is an unlimited MP3 proxy.

### P1-6 · iOS/Safari autoplay + `crossorigin` on audio
**Files:** `src/client/quran-player.ts` (`play()` path), `src/server/views/layout.ts:711`

`layout.ts:711` has `<audio … crossorigin="anonymous">` — confirmed. Nothing analyzes the audio, so this only forces CORS on islam-online/mp3quran hosts. Remove the attribute.

For autoplay: set `audioEl.src` and call `audioEl.play()` **synchronously** inside the click handler before any `await`, then hydrate timing/metadata. Today the call happens after metadata resolution, so Safari rejects it and `.catch(() => {})` hides the failure.

### P1-7 · Service worker rewrite
**Files:** `public/sw.js`, `src/server/index.ts`

- Add an SSR route for `/sw.js` and `/manifest.webmanifest` (only `/site.webmanifest` is routed today, `index.ts:107-115`).
- Navigations: network-first with a cached app-shell fallback, not cache-first.
- Static assets: stale-while-revalidate; hashed JS/CSS may be cache-first forever.
- Version the cache and show an update prompt instead of silently swapping HTML.

### P1-8 · Juz start-surah label
**File:** `src/server/kalamalah-api.ts:193-211`

Confirmed: `SURAHS_META.find(s => s.juz === n)` returns the surah whose `juz` field equals `n`, i.e. the surah **starting** in that juz. Add a verse-start table:
```ts
const JUZ_START: Record<number, { surah: number; ayah: number }> = {
  1: { surah: 1, ayah: 1 },    2: { surah: 2, ayah: 142 },  3: { surah: 2, ayah: 253 },
  4: { surah: 3, ayah: 93 },   5: { surah: 4, ayah: 24 },   6: { surah: 4, ayah: 148 },
  // … 30 entries …
};
```
Populate all 30 and derive `startSurahNumber`/`startAyahNumber` from it.

### P1-9 · Timing offsets
**Files:** `src/server/timings-service.ts:29-66`, root `test_001.json` + `offsets.json`

Confirmed: only `test_001.json` is read, only surah 1, added to **every** source, plus a client-side hard-coded 3100 ms for Yasser. `offsets.json` exists but is unused and full of `confidence: 0` rows.

Land the shared table only after regenerating it (see Open Questions). Until then, the safest interim change is to **delete** `applyTempVocalOffset` and the client-side 3100 ms constant, so nothing is double-shifted.

---

## 4. P2 / P3 (grouped)

| ID | Item | File | Note |
|---|---|---|---|
| P2-1 | `--shadow-lg` undefined | `public/css/app.css:547,4974,5386` | **Confirmed**: used 3×, never declared. Add to `:root` alongside the other `--shadow-*` tokens |
| P2-2 | `/api/timings` caches failures 24 h | `index.ts:280-287` | Cache 24 h only when `mode !== 'none'`; 60 s otherwise |
| P2-3 | In-surah search ignores Arabic normalization | reading/search helper | Normalize alef variants, ya/alif-maqsura, diacritics, tatweel on both sides |
| P2-4 | Salah TV method + city | `src/client/tv-display.ts` | `method=4` hard-coded; `timingsByCity` with empty country invalid → `timingsByAddress`; next-prayer math uses device time, not target tz; no midnight rollover |
| P2-5 | Word meanings `per_page=300` | word-meaning fetch | Quran.com v4 caps at 50 **(verify)**; paginate and compare token count, fall back to ayah-level sync |
| P2-6 | Unguarded `localStorage` | `app.ts`, `reading-tools.ts`, `quran-player.ts:155,170,184` | Confirmed bare calls; add `safeStorage` wrapper |
| P2-7 | Deep-link `?reciter=` unvalidated | `quran-player.ts:176-188` | Validated against catalog for restore, but the query-string path is separate — check |
| P2-8 | Always-on WebGL rAF | `quran-player.ts:160` → `initDybgCanvas()` | Confirmed constructor call; dybg `_tick` never stops unless static mode |
| P2-9 | Startup Unsplash preload | `quran-player.ts:161,859` | **Confirmed**: default mode `islamic` → `showIslamicBackgroundSlide(..., true)` at w=1920&q=85 on every page |
| P2-10 | Startup metadata fetch | `quran-player.ts:223` | Confirmed `loadTrackMetadata(...)` in constructor |
| P3-1 | PreMiD selectors | `premid/presence.ts` | `#qp-bar-surah` vs real `#qp-bar-surah-title` |
| P3-2 | Dead CSS | `public/css/app.css` | `ai-*`, `.gh-star-*`, duplicate spinner blocks (~10) |
| P3-3 | Typos | `islamic-content-data.ts` | `دوة`→`دعوة`, `TheOne`, `Englarger` |
| P3-4 | SSR `lang="en"` hard-coded | `layout.ts:226` | Content is Arabic until JS runs |
| P3-5 | `<html>` locale from cookie | `layout.ts` + `client/i18n.ts` | Removes CLS from `applyUiLocale` |
| P3-6 | `resolveSafePublicPath` over-blocks `..` | `index.ts:46` | `a..b.png` 404s; match path segments instead |
| P3-7 | Sitemap incomplete | `layout.ts:152-185` | Only `/mushaf-1`; add 604 pages, `/t-*`, `/language-*` |
| P3-8 | README `/ai` route | `README.md` | No such route |
| P3-9 | `ar` locale gaps | `client/i18n.ts` | `listenCorrect`, `recitersHeroDesc` missing |

---

## 5. PageSpeed map

| # | Win | File:line | Confirmed |
|---|---|---|---|
| 1 | Kill 2×1920 Unsplash at boot | `quran-player.ts:161,830-875` | ✅ |
| 2 | Stop WebGL rAF at boot | `quran-player.ts:160`, `client/dybg.js` | ✅ call site |
| 3 | Defer `loadTrackMetadata` + fullscreen list | `quran-player.ts:223,316+` | ✅ call site |
| 4 | No compression | `package.json` (no `hono/compress`), Bun default | ✅ |
| 5 | Render-blocking third-party CSS | `layout.ts:296,298,301` | ✅ |
| 6 | AeroUI JS from github.io | `layout.ts:302-304` | ✅ |
| 7 | 4 font preloads | `layout.ts:290-293` | ✅ |
| 8 | SSR/CSR locale mismatch (CLS) | `layout.ts:226` + client `applyUiLocale` | ✅ |
| 9 | `data-raw-word` duplication | surah/mushaf views | **verify** markup |
| 10 | Eager dropdown `<li>` | `client/searchable-dropdown.ts` | **verify** |
| 11 | `refreshAllWordsRender()` at startup | `reading-tools.ts` via `setReadingFont` | **verify** |
| 12 | Scroll handler layout thrash | `reading-tools.ts` | **verify** |
| 13 | `beforeunload` blocks bfcache | `quran-player.ts:1016` | ✅ |
| 14 | Fixed-name assets, 3600 s cache | `index.ts:147-175` | ✅ |
| 15 | `app.css` size/dupes | `public/css/app.css` | ✅ (`--shadow-lg` instantiation) |
| 16 | No code splitting; GSAP in one bundle | `package.json:10` | ✅ |
| 17 | Avatar/logo sizing | `layout.ts:343,649`, `reciters.ts` | partial |
| 18 | No speculative loading | `layout.ts` | ✅ |
| 19 | blur/backdrop-filter cost | `app.css` | **verify** |
| 20 | SW performance story | `public/sw.js` | ✅ (blocked by P1-7) |
| 21 | Over-eager `preconnect` | `layout.ts:294-297` | ✅ |
| 22 | 6–8 KB catalog inlined in every HTML | `layout.ts:851` | ✅ |

Measured baselines are still missing. Do not optimize P9–P12 without a Lighthouse trace: they may be the cheapest wins or irrelevant depending on how much of the page is above the fold.

---

## 6. Rollout order

**PR 1 — P0 security (small, independent)**
`layout.ts` (P0-1), `audio-hosts.ts` + `index.ts` + `timings-service.ts` (P0-2), `prerender-cache.ts` (P0-4), `app.css` `--shadow-lg` (P2-1).
→ Verify: `bunx tsc --noEmit`, `curl -I /api/download/1/1` (expect 200/502, never 302 to non-allow-listed), inject `</script>` into a mocked ayah and confirm the bootstrap script still parses.

**PR 2 — P0 availability**
`kalamalah-api.ts` throw + LRU (P0-3, P0-5 server), `index.ts` `onError` + param validation (P0-3), `static-export.ts` failure threshold (P0-5 CI).
→ Verify: `tsc`, `bun run build:static` with a broken API base, assert non-zero exit.

**PR 3 — P0 correctness**
`findReciterStrict` + dispatcher canonicalization (P0-3a), surah/tafseer/language ranges (P0-3a), JUZ table (P1-8), memorize classes (P1-2).
→ Verify: curl matrix of bad slugs (`/reader-1-zzz`, `/language-zz`, `/tafseer-999`, `/view-1,from-99,to-1`) all 404; `/juz-2` label = Al-Baqarah 2:142.

**PR 4 — startup cost**
P2-8, P2-9, P2-10, `crossorigin` removal (P1-6), `beforeunload` → `pagehide` (P13).
→ Verify: DevTools Network on `/` shows **zero** `images.unsplash.com` requests; Performance shows no long rAF task; Lighthouse INP/TBT delta.

**PR 5 — delivery**
Compression (P4), hashed assets + `immutable` (P14), self-host fonts/AeroUI (P5, P6, P7), locale cookie (P3-4/P3-5).
→ Verify: response headers, `Content-Encoding: br`, `Cache-Control: immutable`, Lighthouse LCP/CLS.

**PR 6 — P1 refactors (one each)**
P1-1 listener split, P1-3 shortcuts, P1-7 service worker, P1-4 sleep timer, P1-5 download streaming.
→ Verify: soft-nav ×3 then open language menu; `Space` on a focused button toggles once; sleep timer stops at last ayah; `curl -H 'Range: bytes=0-1023'` returns 206.

---

## 7. Verification plan ("all")

```bash
# types + build
bunx tsc --noEmit
bun run build:client
STATIC_FULL=1 bun run build:static     # must fail loudly on empty pages

# server smoke
bun run start &
curl -sI localhost:3000/                      # CSP, compression, cache-control
curl -s  localhost:3000/surah-2 | grep -c 'data-raw-word'
curl -sI localhost:3000/api/download/1/1      # no 302 to foreign host
curl -sI -H 'Range: bytes=0-1023' localhost:3000/api/download/1/1
for p in reader-1-zzz language-zz tafseer-999 view-1,from-99,to-1; do
  curl -s -o /dev/null -w "$p %{http_code}\n" "localhost:3000/$p"
done
```

New unit tests (none exist today):
- `safeAudioUrl` — hostile hosts, protocol-relative, `evil.tld/?api.kalamalah.com/api/`.
- `sanitizeKeyToFile` — no collisions across the `view-*`/`reader-*` families.
- `parseIslamOnlineTxtTimings`, `parseQuranCdnTimingsJson`, `parseMp3QuranTimingsJson` — fixtures; assert `endMs > startMs` and shared output shape.
- `findReciterStrict` — unknown → null, id/slug/kSlug/iolSlug all resolve.
- `normalizeQuranTextForFont` / tokenizer parity with word-count.

Playwright smoke: soft-nav ×3 → language menu opens; play/pause; memorize reveal.

---

## 8. Open questions (need runtime or upstream confirmation)

1. **Bismillah stripping** — does `api.kalamalah.com` include it in ayah 1 for surahs ≠ 1, 9? If yes, the hard-coded variants in `kalamalah-api.ts:297-301` probably miss tatweel/dagger-alif variants. Needs one real payload.
2. **Quran.com `per_page` cap** — 50 or 300? Affects the whole word-meaning feature.
3. **`main/fonts` and `main/icons`** — gitignored, so do Docker/CI actually have them? If not, `/fonts/sfarabic.woff2` 404s and the font stack silently falls back.
4. **`offsets.json` regeneration** — needs `ffmpeg -t 15 -i <url> -f wav -` against each reciter, not a 512 KB `Range` slice. Four reciters are `confidence: 0`.
5. **`offsets.json` regeneration** — needs `ffmpeg -t 15 -i <url> -f wav -` against each reciter, not a 512 KB `Range` slice. Four reciters are `confidence: 0`.
6. **AeroUI license** — blocks vendoring (P6/P7). Check before writing it into the plan.
7. **SF Pro / SF Arabic redistribution** — legal, not technical. If in doubt, swap to Inter + IBM Plex Sans Arabic before optimizing font-loading around them.

---

## 9. What I would *not* do yet

- **P9 (payload dedupe) and P10/P11 (dropdowns, word-render)** — large diffs, and the audit itself admits the measurements are from code reading. Get a Lighthouse run on `/surah-2` first.
- **P16 code splitting** — depends on P1-1 (init split), otherwise dynamic imports will just move the listener-stacking bug.
- **Cosmetic/theological data changes** (tajweed colorizer, Quran text bundling) — these need domain review, not an engineering PR.
- **`offsets.json`** in any form until item 4 above is answered; shipping `confidence: 0` rows as truth is worse than no offsets.

---

## 10. Progress log

| Batch | Files | Status |
|---|---|---|
| 1 | `layout.ts`, `app.css`, `audio-hosts.ts` (new) | ✅ applied, `tsc` clean |
| 2 | `timings-service.ts`, `index.ts` | ✅ applied, `tsc` clean |
| 3a | `prerender-cache.ts`, `kalamalah-api.ts` | ✅ applied, `tsc` clean |
| 3b | `reciters-catalog.ts`, `index.ts` | ✅ applied, `tsc` clean |
| 4 | `static-export.ts` | ✅ applied, `tsc` clean |
| 5 | `app.ts`, `word-meaning.ts`, `layout.ts` | ✅ applied, **not yet type-checked** (shell unavailable) |
| 6 | `kalamalah-api.ts` (Juz start table), `home.ts` | ✅ applied, **not type-checked** |
| 7 | `public/sw.js` (rewrite), `index.ts` (`/sw.js`, `/manifest.webmanifest` routes) | ✅ applied, **not type-checked** |
| 8 | `index.ts` (`compress` + `secureHeaders`) | ✅ applied, **not type-checked** |
| 9 | `quran-player.ts` (lazy dybg/images, pause on close) | ✅ applied, **not type-checked** |
| 10 | `index.ts` (Range/If-Range streaming, headers-only timeout) | ✅ applied, **not type-checked** |
| 11 | `index.ts` (`c` param fix on `/sw.js`, `/manifest.webmanifest`), `prerender-cache.ts` (`v14`) | ✅ applied, `tsc` clean |
| 12 | `markdown.ts` (new), `index.ts` (`.md` middleware, `/llms.txt`), `layout.ts` (alternate link, robots AI agents), `zaraz.ts` (new, server), `client/zaraz.ts` (new), `app.ts` (consent + page_view) | ✅ applied, `tsc` clean, **runtime-verified** |
| 13 | `kalamalah-api.ts` (negative cache), `index.ts` (weak ETag normalize) | ✅ applied, **not type-checked** (shell unavailable again) |

Review points for the pending type-check:
- `secureHeaders` disables COEP (`crossOriginEmbedderPolicy: false`) because cross-origin audio/images lack CORP headers; CORP is set to `cross-origin`.
- CSP keeps `'unsafe-inline'` for `script-src` until the early theme script moves to `/js/theme-init.js`.
- Verify Hono's `compress()` skips `audio/mpeg` so `/api/download` still streams instead of buffering.

Runtime smoke test (against `PORT=3999`), all passing:
`/reader-1-zzz` 404 · `/language-zz` 404 · `/tafseer-999` 404 · `/reciter-nope` 404 · `/t-1-1-999` 404 · `/view-1,from-99,to-1` 200 (clamped) · `/api/timings/zzz/1` 404 · `/api/timings/1/abc` 400 · `/api/surah/1?translation=bogus` 404 · `/api/surah/999` 400 · `/api/download/1/1` 200 with no `Location`.

### Batch 12 runtime results

| Path | Status | Type | Notes |
|---|---|---|---|
| `/index.md` | 200 | `text/markdown` | 17 KB, 10 ms |
| `/surah-index.md` | 200 | `text/markdown` | 12 KB, 6 ms |
| `/surah-1.md` | 200 | `text/markdown` | 7 ayahs + Saheeh International translation |
| `/juz-2.md` | 200 | `text/markdown` | 25 KB |
| `/mushaf-1.md` | 200 | `text/markdown` | page/juz/surah header + verses |
| `/reciters.md`, `/languages.md`, `/reciter-<slug>.md` | 200 | `text/markdown` | |
| `/llms.txt` | 200 | `text/plain` | 9 KB index, 50 ms |
| `/surah-999.md`, `/nope.md` | 404 | | |
| `/surah-3`, `/juz-4`, `/mushaf-77` (HTML) | 200 | | carry `<link rel="alternate" type="text/markdown">` + `rel="llms-txt"` |

### Batch 13 finding (needs infra attention)

`GET https://api.kalamalah.com/api/quran/surah/{n}` returns **HTTP 500** for every
surah, with and without `?edition=`. All surah/juz/page content is therefore
being served from the `api.alquran.cloud` fallback. Because failures were not
cached, each render paid the dead round-trip (≈250 ms) again. Batch 13 adds a
60 s negative cache, which removes that cost but does not fix the upstream.

### Markdown contract (`<any page>.md`)

Every public page has a Markdown twin: strip the `.md` suffix and the normal
router decides the content, so `/surah-3.md`, `/juz-4.md`, `/mushaf-77.md`,
`/reciter-<slug>.md`, `/tafseer-2.md?surah=5` and `/surah-index.md` all work.
Responses carry `Content-Type: text/markdown`, an ETag (304 on revalidation)
and `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`.
`/llms.txt` is the index. `robots.txt` allows the major AI crawlers explicitly.

### Zaraz setup

Code side is done; the rest lives in the Cloudflare dashboard.

1. Cloudflare → Zaraz → enable. If the zone is proxied, Cloudflare injects the
   loader itself and **no env var is needed**.
2. If not proxied: Zaraz → "Add manually" → copy the snippet URL into
   `ZARAZ_SCRIPT_URL`. It is rendered into `<head>` and its origin is added to
   the CSP automatically. Only `https:` URLs are accepted.
3. Zaraz → Consent → create purposes named exactly `analytics`, `advertising`,
   `preferences` (plus the built-in `necessary`).
4. Attach tools to those purposes.

Client behaviour: nothing is granted until the cookie banner is answered.
"Accept" grants all three; "Essential Only" grants none. SPA navigations emit
`page_view` with `{ path, title, url }` only when analytics consent is granted.

Still open: P1-1 listener split, P1-4 sleep timer, P1-6 autoplay, P1-9 offsets,
P2/P3 items, PageSpeed P3–P22 (hashed assets, font self-hosting, code splitting,
virtualization, RUM).


Remaining (not started): P1-1 listener split, P1-4 sleep timer, P1-6 autoplay, P1-9 offsets, P2/P3 items, PageSpeed P3–P22 (hashed assets, font self-hosting, code splitting, virtualization, RUM).

