/**
 * Cloudflare Worker for Kalamalah
 * Adds immutable cache headers, security headers, and performance optimizations
 * Deploy via Cloudflare Dashboard > Workers & Pages > Create Worker
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const response = await fetch(request);
    const newHeaders = new Headers(response.headers);

    // Security headers
    newHeaders.set('X-Content-Type-Options', 'nosniff');
    newHeaders.set('X-Frame-Options', 'SAMEORIGIN');
    newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    newHeaders.set('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');

    // HSTS
    newHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

    // Immutable cache for static assets (1 year)
    const pathname = url.pathname;
    const isStaticAsset = 
      pathname.startsWith('/fonts/') ||
      pathname.startsWith('/icons/') ||
      pathname.startsWith('/images/') ||
      pathname.startsWith('/css/') ||
      pathname.startsWith('/js/') ||
      pathname.startsWith('/vendor/') ||
      pathname.endsWith('.woff2') ||
      pathname.endsWith('.woff') ||
      pathname.endsWith('.ttf') ||
      pathname.endsWith('.css') ||
      pathname.endsWith('.js') ||
      pathname.endsWith('.json') ||
      pathname.endsWith('.png') ||
      pathname.endsWith('.jpg') ||
      pathname.endsWith('.jpeg') ||
      pathname.endsWith('.webp') ||
      pathname.endsWith('.svg') ||
      pathname.endsWith('.ico');

    if (isStaticAsset) {
      // Check if already has cache-control
      const existingCache = newHeaders.get('cache-control');
      if (!existingCache || !existingCache.includes('immutable')) {
        newHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }

    // Manifest and SW - long cache but revalidated
    if (pathname === '/manifest.json' || pathname === '/manifest.webmanifest' || pathname === '/sw.js') {
      newHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
    }

    // HTML pages - short cache with revalidation
    if (pathname.endsWith('.html') || pathname === '/' || pathname.endsWith('/')) {
      newHeaders.set('Cache-Control', 'public, max-age=0, must-revalidate');
    }

    // Font preload hints via Link header (for fonts not in HTML)
    if (pathname === '/') {
      const fontLinks = [
        '</fonts/UthmanicHafs_V22.woff2>; rel=preload; as=font; type=font/woff2; crossorigin',
        '</fonts/sfarabic.woff2>; rel=preload; as=font; type=font/woff2; crossorigin',
        '</fonts/SF-Pro-Display-Regular.woff2>; rel=preload; as=font; type=font/woff2; crossorigin',
        '</fonts/SF-Pro-Display-Bold.woff2>; rel=preload; as=font; type=font/woff2; crossorigin',
      ];
      newHeaders.set('Link', fontLinks.join(', '));
    }

    // Resource hints for critical origins
    if (pathname === '/') {
      const resourceHints = [
        '<https://api.kalamalah.com>; rel=preconnect; crossorigin',
        '<https://api.qurancdn.com>; rel=preconnect; crossorigin',
        '<https://cdn.islam-online.net>; rel=dns-prefetch',
        '<https://mp3quran.net>; rel=dns-prefetch',
        '<https://verses.quran.com>; rel=dns-prefetch',
      ];
      const existingLink = newHeaders.get('Link');
      newHeaders.set('Link', [...(existingLink ? [existingLink] : []), ...resourceHints].join(', '));
    }

    // Remove server header
    newHeaders.delete('Server');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};