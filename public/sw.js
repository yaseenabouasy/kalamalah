/**
 * Kalamalah Service Worker - Offline-first caching
 * Caches: fonts, CSS, JS, images, API responses
 */

const CACHE_NAME = 'kalamalah-v2';
const STATIC_CACHE = 'kalamalah-static-v2';
const FONT_CACHE = 'kalamalah-fonts-v2';
const API_CACHE = 'kalamalah-api-v2';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/js/app.js',
  '/css/app.css',
  '/css/aeroui.css',
  '/css/searchable-dropdown.css',
  '/css/fullscreen-player.css',
  '/css/settings-sheet.css',
  '/vendor/fonts/tajawal/tajawal.css',
  '/images/round-logo.png',
  '/favicon/favicon.svg',
  '/favicon/favicon-96x96.png',
  '/manifest.json',
];

const FONT_ASSETS = [
  '/fonts/UthmanicHafs_V22.woff2',
  '/fonts/sfarabic.woff2',
  '/fonts/SF-Pro-Display-Regular.woff2',
  '/fonts/SF-Pro-Display-Bold.woff2',
  '/fonts/Kitab-Regular.woff2',
  '/fonts/Amiri-Regular.woff2',
  '/fonts/KFGQPCNastaleeq-Regular.woff2',
  '/vendor/fonts/tajawal/Tajawal-Regular.woff2',
  '/vendor/fonts/tajawal/Tajawal-Medium.woff2',
  '/vendor/fonts/tajawal/Tajawal-Bold.woff2',
  '/vendor/fonts/tajawal/Tajawal-ExtraBold.woff2',
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
      caches.open(FONT_CACHE).then((cache) => cache.addAll(FONT_ASSETS)),
    ]).then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, FONT_CACHE, API_CACHE].includes(key))
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - Network First for API, Cache First for Static/Fonts
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension, etc.
  if (!url.protocol.startsWith('http')) return;

  // API requests - Network First with fallback
  if (url.pathname.startsWith('/api/') || url.hostname !== location.hostname) {
    event.respondWith(networkFirstThenCache(request, API_CACHE));
    return;
  }

  // Fonts - Cache First (immutable)
  if (request.destination === 'font' || url.pathname.match(/\.(woff2?|ttf)$/)) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // Static assets - Cache First
  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|svg|ico)$/)
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML/Navigation - Network First with offline fallback
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstThenCache(request, STATIC_CACHE, '/index.html'));
    return;
  }

  // Default - Network First
  event.respondWith(networkFirstThenCache(request, STATIC_CACHE));
});

// Cache First Strategy
async function cacheFirst(request, cacheName) {
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

// Network First with Cache Fallback
async function networkFirstThenCache(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) return cache.match(fallbackUrl);
    return new Response('Offline', { status: 503 });
  }
}

// Background Sync for failed requests (optional)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-analytics') {
    event.waitUntil(syncAnalytics());
  }
});

async function syncAnalytics() {
  // Queue analytics when online
  console.log('[SW] Background sync triggered');
}