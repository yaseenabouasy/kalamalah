import { Hono } from 'hono';
import { normalizeArabic } from '../arabic';
import { fetchCdnJson } from '../cdn';

export const quranRoutes = new Hono();

const EDITION_FILES: Record<string, string> = {
  uthmani: 'uthmani.json',
  'en.sahih': 'en.sahih.json',
  'ar.muyassar': 'ar.muyassar.json',
};

quranRoutes.get('/surahs', async (c) => {
  const data = await fetchCdnJson('api_data/surahs.json');
  if (!data) return c.json({ error: 'Surahs catalog unavailable' }, 404);
  return c.json({ ok: true, data });
});

quranRoutes.get('/editions', async (c) => {
  const data = await fetchCdnJson('api_data/editions.json');
  if (!data) return c.json({ error: 'Editions catalog unavailable' }, 404);
  return c.json({ ok: true, data });
});

quranRoutes.get('/surahs/:number', async (c) => {
  const num = Number(c.req.param('number'));
  if (!Number.isInteger(num) || num < 1 || num > 114) {
    return c.json({ error: 'Surah number must be between 1 and 114' }, 400);
  }
  const edition = c.req.query('edition') ?? 'uthmani';
  const file = EDITION_FILES[edition] ?? `${edition}.json`;
  const data = await fetchCdnJson(`api_data/surah/${num}/${file}`);
  if (!data) return c.json({ error: `Surah ${num} (${edition}) not found` }, 404);
  return c.json({ ok: true, surah: num, edition, data });
});

quranRoutes.get('/surahs/:number/ayahs/:ayah', async (c) => {
  const num = Number(c.req.param('number'));
  const ayahNum = Number(c.req.param('ayah'));
  if (!Number.isInteger(num) || num < 1 || num > 114 || !Number.isInteger(ayahNum) || ayahNum < 1) {
    return c.json({ error: 'Invalid surah or ayah number' }, 400);
  }
  const edition = c.req.query('edition') ?? 'uthmani';
  const file = EDITION_FILES[edition] ?? `${edition}.json`;
  const surahData = await fetchCdnJson<{ ayahs?: Array<{ numberInSurah?: number; number?: number }> }>(
    `api_data/surah/${num}/${file}`
  );
  const ayahs = Array.isArray(surahData) ? surahData : surahData?.ayahs ?? [];
  const found = ayahs.find((a) => (a.numberInSurah ?? a.number) === ayahNum);
  if (!found) return c.json({ error: `Ayah ${num}:${ayahNum} not found` }, 404);
  return c.json({ ok: true, surah: num, ayah: ayahNum, edition, data: found });
});

quranRoutes.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.json({ error: 'Query parameter "q" is required' }, 400);

  const surahFilter = c.req.query('surah') ? Number(c.req.query('surah')) : null;
  const normQuery = normalizeArabic(q.toLowerCase());
  const results: Array<{ surah: number; ayah: number; text: string }> = [];

  const start = surahFilter && surahFilter >= 1 && surahFilter <= 114 ? surahFilter : 1;
  const end = surahFilter && surahFilter >= 1 && surahFilter <= 114 ? surahFilter : 114;

  for (let s = start; s <= end; s++) {
    const surahData = await fetchCdnJson<{ ayahs?: Array<{ numberInSurah?: number; text?: string }> }>(
      `api_data/surah/${s}/uthmani.json`
    );
    const ayahs = Array.isArray(surahData) ? surahData : surahData?.ayahs ?? [];
    for (const a of ayahs) {
      const text = a.text ?? '';
      if (normalizeArabic(text.toLowerCase()).includes(normQuery)) {
        results.push({ surah: s, ayah: a.numberInSurah ?? 0, text });
        if (results.length >= 50) break;
      }
    }
    if (results.length >= 50) break;
  }

  return c.json({ ok: true, query: q, count: results.length, results });
});
