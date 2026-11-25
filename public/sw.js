/**
 * Kalamalah Service Worker - Offline-first caching
 * Caches: fonts, CSS, JS, images, API responses
 * GitHub Pages + content-hash filenames = immutable caching
 */

const STATIC_CACHE = 'kalamalah-static-v3';
const HTML_CACHE = 'kalamalah-html-v3';
const API_CACHE = 'kalamalah-api-v3';

// Install - cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      // These will be added dynamically on first fetch
      return cache.addAll([
        '/',
        '/index.html',
        '/manifest.json',
      ]);
    }).then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => 
      Promise.all(keys.filter(k => ![STATIC_CACHE, HTML_CACHE, API_CACHE].includes(k)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;

  // Skip non-http(s)
  if (!url.protocol.startsWith('http')) return;

  // Skip cross-origin (except our API domains)
  const isOurAPI = url.hostname === 'api.kalamalah.com' || 
                   url.hostname === 'api.qurancdn.com' ||
                   url.hostname === 'cdn.islam-online.net' ||
                   url.hostname === 'verses.quran.com' ||
                   url.hostname === 'api.aladhan.com';
  
  if (url.hostname !== location.hostname && !isOurAPI) return;

  // Skip audio/Range requests (streaming) - never cache
  if (request.headers.has('range') || url.pathname.match(/\.(mp3|m4a|ogg)$/)) return;

  // HTML pages: Network-first + cache fallback + stale-while-revalidate
  if (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/')) {
    event.respondWith(networkFirstThenCache(request, HTML_CACHE));
    return;
  }

  // Static assets (hashed filenames): Cache-first (immutable)
  if (url.pathname.startsWith('/fonts/') || 
      url.pathname.startsWith('/css/') || 
      url.pathname.startsWith('/js/') || 
      url.pathname.startsWith('/images/') || 
      url.pathname.startsWith('/icons/') || 
      url.pathname.startsWith('/vendor/') || 
      url.pathname.startsWith('/media/') ||
      url.pathname === '/manifest.json' ||
      url.pathname === '/sw.js') {
    event.respondWith(cacheFirstThenNetwork(request, STATIC_CACHE));
    return;
  }

  // API: Network-first, cache fallback
  if (url.pathname.startsWith('/api/') || isOurAPI) {
    event.respondWith(networkFirstThenCache(request, API_CACHE));
    return;
  }

  // Default: Network-first
  event.respondWith(networkFirstThenCache(request, HTML_CACHE));
});

async function cacheFirstThenNetwork(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirstThenCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}