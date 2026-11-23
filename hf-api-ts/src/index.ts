import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { quranRoutes } from './routes/quran';
import { mediaRoutes } from './routes/media';

const app = new Hono();

// Open for everyone to use
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Range'],
}));

app.get('/', (c) => {
  return c.json({
    name: 'Kalamalah Open Quran API',
    version: '2.0.0',
    open: true,
    message: 'This API is free and open for everyone to use.',
    docs: '/docs',
    endpoints: {
      surahs: '/api/v1/surahs',
      surah: '/api/v1/surahs/:number?edition=uthmani|en.sahih|ar.muyassar',
      ayah: '/api/v1/surahs/:number/ayahs/:ayah',
      search: '/api/v1/search?q=...&surah=...',
      editions: '/api/v1/editions',
      reciters: '/api/v1/reciters',
      audio: '/api/v1/reciters/:id/audio/:surah',
      timing: '/api/v1/reciters/:id/timing/:surah',
      mushaf: '/api/v1/mushafs/:type/:page',
      fonts: '/api/v1/fonts/:filename',
    },
  });
});

app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }));

app.get('/openapi.json', (c) => {
  return c.json({
    openapi: '3.1.0',
    info: {
      title: 'Kalamalah Open Quran API',
      version: '2.0.0',
      description: 'Free, open REST API for Quran text, translations, fuzzy Arabic search, reciters, audio streams, word-by-word timing, Mushaf pages, and fonts. No API key required.',
    },
    paths: {
      '/api/v1/surahs': { get: { summary: 'List all 114 Surahs', tags: ['Quran'] } },
      '/api/v1/editions': { get: { summary: 'List text & translation editions', tags: ['Quran'] } },
      '/api/v1/surahs/{number}': {
        get: {
          summary: 'Get full Surah by number (1-114)',
          tags: ['Quran'],
          parameters: [
            { name: 'number', in: 'path', required: true, schema: { type: 'integer' } },
            { name: 'edition', in: 'query', required: false, schema: { type: 'string', default: 'uthmani' } },
          ],
        },
      },
      '/api/v1/surahs/{number}/ayahs/{ayah}': {
        get: {
          summary: 'Get a single Ayah',
          tags: ['Quran'],
          parameters: [
            { name: 'number', in: 'path', required: true, schema: { type: 'integer' } },
            { name: 'ayah', in: 'path', required: true, schema: { type: 'integer' } },
            { name: 'edition', in: 'query', required: false, schema: { type: 'string', default: 'uthmani' } },
          ],
        },
      },
      '/api/v1/search': {
        get: {
          summary: 'Fuzzy Arabic search (diacritic-insensitive)',
          tags: ['Quran'],
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'surah', in: 'query', required: false, schema: { type: 'integer' } },
          ],
        },
      },
      '/api/v1/reciters': { get: { summary: 'List reciters catalog', tags: ['Media'] } },
      '/api/v1/reciters/{id}/audio/{surah}': {
        get: {
          summary: 'Stream Surah MP3 audio',
          tags: ['Media'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'surah', in: 'path', required: true, schema: { type: 'integer' } },
          ],
        },
      },
      '/api/v1/reciters/{id}/timing/{surah}': {
        get: {
          summary: 'Get word-by-word timing JSON',
          tags: ['Media'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'surah', in: 'path', required: true, schema: { type: 'integer' } },
          ],
        },
      },
      '/api/v1/mushafs/{type}/{page}': {
        get: {
          summary: 'Get Mushaf page image',
          tags: ['Media'],
          parameters: [
            { name: 'type', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'page', in: 'path', required: true, schema: { type: 'integer' } },
          ],
        },
      },
      '/api/v1/fonts/{filename}': {
        get: {
          summary: 'Get Quranic web font',
          tags: ['Media'],
          parameters: [
            { name: 'filename', in: 'path', required: true, schema: { type: 'string' } },
          ],
        },
      },
    },
  });
});

app.get('/docs', (c) => {
  return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Kalamalah Open Quran API — Scalar Docs</title>
</head>
<body>
  <script id="api-reference" data-url="/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`);
});

app.route('/api/v1', quranRoutes);
app.route('/api/v1', mediaRoutes);

const port = Number(process.env.PORT ?? 7860);
export default {
  port,
  fetch: app.fetch,
};
