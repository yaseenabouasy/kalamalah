import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

interface CacheEntry {
  html: string;
  etag: string;
  createdAt: number;
}

const memoryPrerenderCache = new Map<string, CacheEntry>();
const MAX_MEMORY_ENTRIES = 600;
const PRERENDER_CACHE_VERSION = 'v14';
const CACHE_DIR = join(process.cwd(), '.cache', 'prerender', PRERENDER_CACHE_VERSION);
let diskReady = false;

async function ensureDiskCacheDir(): Promise<void> {
  if (diskReady) return;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    diskReady = true;
  } catch {
    // Ignore disk write issues in read-only environments
  }
}

/**
 * Cache key -> filename. Hashed so that keys which differ only by
 * punctuation (`view-1,from-2` vs `view-1_from-2`) cannot collide.
 */
function sanitizeKeyToFile(key: string): string {
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 16);
  return join(CACHE_DIR, `${hash}.html`);
}

function computeWeakEtag(html: string): string {
  const hash = Bun.hash(html).toString(36);
  return `W/"${hash}-${html.length.toString(36)}"`;
}

/** Insert and mark as most-recently-used, evicting oldest entries past the cap. */
function remember(key: string, entry: CacheEntry): void {
  memoryPrerenderCache.delete(key);
  memoryPrerenderCache.set(key, entry);
  while (memoryPrerenderCache.size > MAX_MEMORY_ENTRIES) {
    const oldest = memoryPrerenderCache.keys().next().value;
    if (oldest === undefined) break;
    memoryPrerenderCache.delete(oldest);
  }
}

/**
 * Hybrid Server Prerender Cache:
 * - Serves pre-rendered immutable pages (Surahs, Juzs, Reciters, Mushaf pages, etc.) from RAM (<0.2ms) or Disk (.cache/prerender).
 * - If not yet prerendered, renders via `renderFn()`, stores in RAM + Disk, and returns with ETag + Cache-Control headers.
 * - Both layers honour `ttlMs`; the disk layer uses the file mtime so stale
 *   entries are re-rendered instead of served forever.
 */
export async function getOrPrerenderPage(
  routeKey: string,
  renderFn: () => Promise<string>,
  ttlMs = 1000 * 60 * 60 * 6
): Promise<{ html: string; etag: string; cacheHit: 'MEMORY' | 'DISK' | 'MISS' }> {
  const now = Date.now();
  const mem = memoryPrerenderCache.get(routeKey);
  if (mem && now - mem.createdAt < ttlMs) {
    remember(routeKey, mem);
    return { html: mem.html, etag: mem.etag, cacheHit: 'MEMORY' };
  }

  await ensureDiskCacheDir();
  const filePath = sanitizeKeyToFile(routeKey);

  try {
    const info = await stat(filePath);
    if (now - info.mtimeMs < ttlMs) {
      const diskHtml = await readFile(filePath, 'utf8');
      if (diskHtml && diskHtml.length > 100) {
        const etag = computeWeakEtag(diskHtml);
        remember(routeKey, { html: diskHtml, etag, createdAt: now });
        return { html: diskHtml, etag, cacheHit: 'DISK' };
      }
    }
  } catch {
    // Disk cache miss or expired entry
  }

  const html = await renderFn();
  const etag = computeWeakEtag(html);
  remember(routeKey, { html, etag, createdAt: now });

  // Persist asynchronously to disk
  writeFile(filePath, html, 'utf8').catch(() => {});

  return { html, etag, cacheHit: 'MISS' };
}
