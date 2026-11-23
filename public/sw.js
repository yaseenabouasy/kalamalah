// Kalamalah service worker.
// Strategy:
//   - navigations: network-first, cached app shell as offline fallback
//   - same-origin static assets: stale-while-revalidate
//   - /api/* and cross-origin requests: untouched
const CACHE_VERSION = 'kalamalah-v3';
const PRECACHE = ['/', '/manifest.webmanifest', '/images/round-logo.png'];
const MAX_ENTRIES = 120;
const ASSET_RE = /\.(?:css|js|woff2?|ttf|otf|svg|png|jpe?g|webp|avif|ico)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // allSettled so one bad URL cannot abort the whole install.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map((key) => cache.delete(key)));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone)).catch(() => {});
          return res;
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            (await caches.match('/')) ||
            new Response('Offline', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        })
    );
    return;
  }

  if (ASSET_RE.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok) {
              cache
                .put(request, res.clone())
                .then(() => trim(cache))
                .catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
