import { Hono } from 'hono';
import { fetchCdnJson, proxyCdnAsset } from '../cdn';

export const mediaRoutes = new Hono();

mediaRoutes.get('/reciters', async (c) => {
  const data = await fetchCdnJson('api_data/reciters.json');
  if (!data) return c.json({ error: 'Reciters catalog unavailable' }, 404);
  return c.json({ ok: true, data });
});

mediaRoutes.get('/reciters/:id/audio/:surah', async (c) => {
  const id = c.req.param('id');
  const surah = String(Number(c.req.param('surah'))).padStart(3, '0');
  return proxyCdnAsset(`reciters/audio/${id}/${surah}.mp3`);
});

mediaRoutes.get('/reciters/:id/timing/:surah', async (c) => {
  const id = c.req.param('id');
  const surah = Number(c.req.param('surah'));
  const data = await fetchCdnJson(`api_data/timing/${id}/${surah}.json`);
  if (!data) return c.json({ error: `Timing not found for ${id} surah ${surah}` }, 404);
  return c.json({ ok: true, reciter: id, surah, data });
});

mediaRoutes.get('/mushafs/:type/:page', async (c) => {
  const type = c.req.param('type');
  const page = String(Number(c.req.param('page'))).padStart(3, '0');
  return proxyCdnAsset(`mushafs/${type}/${page}.png`);
});

mediaRoutes.get('/fonts/:filename', async (c) => {
  const filename = c.req.param('filename');
  return proxyCdnAsset(`fonts/${filename}`);
});
