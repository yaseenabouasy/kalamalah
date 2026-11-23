/**
 * Markdown representations of public pages.
 *
 * Every HTML page has a twin at `<path>.md`, rendered straight from the same
 * data source (no HTML parsing). Responses are small, cacheable and cheap to
 * generate, which is what AI crawlers and LLM agents actually want.
 */
import {
  fetchJuzDetail,
  fetchMushafPage,
  fetchSurahDetail,
  getSurahMeta,
  JUZ_META,
  SURAHS_META,
  TAFSEER_BOOKS,
  TRANSLATION_EDITIONS,
} from './kalamalah-api';
import { findReciterStrict, RECITERS_CATALOG } from './reciters-catalog';

const ORIGIN = 'https://kalamalah.com';

export interface MarkdownPage {
  title: string;
  markdown: string;
}

/** Collapse whitespace so verse text stays on one logical line. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function frontMatter(fields: Record<string, string | number>): string {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join('\n')}\n---\n\n`;
}

function page(
  title: string,
  path: string,
  description: string,
  body: string
): MarkdownPage {
  const meta = frontMatter({
    title,
    source: `${ORIGIN}${path}`,
    canonical: path === '/' ? `${ORIGIN}/` : `${ORIGIN}${path}.md`,
    site: 'Kalamalah',
  });
  return { title, markdown: `${meta}${body.trim()}\n` };
}

function surahIndex(): string {
  return SURAHS_META.map(
    (s) =>
      `- [${s.number}. ${s.nameEn} (${s.nameAr})](${ORIGIN}/surah-${s.number}.md) — ${s.meaningEn}, ${s.ayahCount} ayahs, ${s.revelationType}`
  ).join('\n');
}

function renderHome(): MarkdownPage {
  const body = `# Kalamalah — Quran reading, recitation and tafsir

Kalamalah is a Quran platform: 114 surahs with Uthmani script, word-by-word
timing, reciters, tafsir, translation and tajweed guidance.

Every page below also exists as HTML (same URL without \`.md\`) and as a
machine-readable index at ${ORIGIN}/llms.txt.

## Surahs

${surahIndex()}

## Juz

${JUZ_META.map(
    (j) =>
      `- [Juz ${j.number}](${ORIGIN}/juz-${j.number}.md) — starts at ${getSurahMeta(j.startSurahNumber).nameEn} ${j.startSurahNumber}:${j.startAyahNumber}, page ${j.startPage}`
  ).join('\n')}

## Reciters

${RECITERS_CATALOG.map(
    (r) => `- [${r.nameEn} (${r.nameAr})](${ORIGIN}/reciter-${r.slug}.md) — ${r.riwayahEn}`
  ).join('\n')}

## Other

- [Surah index](${ORIGIN}/surah-index.md)
- [Reciters directory](${ORIGIN}/reciters.md)
- [Translation editions](${ORIGIN}/languages.md)

## Usage

Text: Uthmani script, Arabic. Translations are listed per edition on
/languages. Attribution: Quran text from the Kalamalah API; translation
editions retain their own licensing.
`;
  return page('Kalamalah — Quran reading, recitation and tafsir', '/', 'Quran surahs, juz, reciters and tafsir', body);
}

function renderRecitersDirectory(): MarkdownPage {
  const rows = RECITERS_CATALOG.map(
    (r) =>
      `- [${r.nameEn}](${ORIGIN}/reciter-${r.slug}.md) — ${r.nameAr}, ${r.riwayahEn}, ${r.countryAr}`
  ).join('\n');
  return page(
    'Reciters — Kalamalah',
    '/reciters',
    'Reciter directory',
    `# Reciters

${rows}

## Tafsir editions

${TAFSEER_BOOKS.map(
      (b) => `- [${b.nameEn} (${b.nameAr})](${ORIGIN}/tafseer-${b.id}.md) — ${b.authorAr}`
    ).join('\n')}
`
  );
}

function renderLanguages(): MarkdownPage {
  return page(
    'Translation editions — Kalamalah',
    '/languages',
    'Quran translation editions',
    `# Translation editions

${TRANSLATION_EDITIONS.map(
      (e) =>
        `- \`${e.code}\` — ${e.languageNameEn} (${e.languageNameAr}), ${e.translatorName}, ${e.dir.toUpperCase()}`
    ).join('\n')}

Request a translation with \`/surah-<n>.md?translation=<code>\`.
`
  );
}

async function renderSurah(surahNumber: number, translationCode: string | null): Promise<MarkdownPage> {
  const meta = getSurahMeta(surahNumber);
  const edition =
    TRANSLATION_EDITIONS.find(
      (e) => e.code === translationCode || e.editionId === translationCode
    ) ?? TRANSLATION_EDITIONS.find((e) => e.code === 'en') ?? null;

  const detail = await fetchSurahDetail(meta.number, edition?.editionId ?? 'en.sahih');
  const label = edition
    ? edition.translatorName === edition.languageNameEn
      ? edition.translatorName
      : `${edition.translatorName} (${edition.languageNameEn})`
    : 'English';

  const verses = detail.ayahs
    .map((a) => {
      const translation = a.translationText ? `\n\n> ${oneLine(a.translationText)}` : '';
      return `**${meta.number}:${a.numberInSurah}** ${oneLine(a.text)}${translation}`;
    })
    .join('\n\n');

  const body = `# ${meta.number}. ${meta.nameEn} — ${meta.nameAr}

- Meaning: ${meta.meaningEn}
- Revelation: ${meta.revelationType} (${meta.revelationAr})
- Ayahs: ${meta.ayahCount}
- Starts at page ${meta.startPage}, Juz ${meta.juz}
- Translation: ${label}
- Read as HTML: ${ORIGIN}/surah-${meta.number}
- Recite with audio: ${ORIGIN}/reader-${meta.number}-haitham-al-dukhin

## Verses

${verses}
`;
  return page(`${meta.number}. ${meta.nameEn} — ${meta.nameAr}`, `/surah-${meta.number}`, meta.meaningEn, body);
}

async function renderJuz(juzNumber: number): Promise<MarkdownPage> {
  const juz = await fetchJuzDetail(juzNumber);
  const sections = juz.groups
    .map(
      (g) =>
        `### ${g.surah.number}. ${g.surah.nameEn} — ${g.surah.nameAr}\n\n${g.ayahs
          .map((a) => `**${g.surah.number}:${a.numberInSurah}** ${oneLine(a.text)}`)
          .join('\n\n')}`
    )
    .join('\n\n');

  return page(
    `Juz ${juz.juz} — Kalamalah`,
    `/juz-${juz.juz}`,
    `Juz ${juz.juz} of the Quran`,
    `# Juz ${juz.juz}

${juz.groups.map((g) => `- ${g.surah.nameEn} (${g.ayahs.length} ayahs)`).join('\n')}

${sections}
`
  );
}

async function renderMushafPage(pageNumber: number): Promise<MarkdownPage> {
  const data = await fetchMushafPage(pageNumber);
  const verses = data.ayahs
    .map(
      (a) => `**${a.surahNumber ?? 1}:${a.numberInSurah}** ${oneLine(a.text)}`
    )
    .join('\n\n');

  return page(
    `Mushaf page ${data.page} — Kalamalah`,
    `/mushaf-${data.page}`,
    `Mushaf page ${data.page}`,
    `# Mushaf page ${data.page}

- Juz: ${data.juz}
- Surahs: ${data.surahsOnPage.map((s) => `${s.nameEn} (${s.number})`).join(', ')}

${verses}
`
  );
}

function renderReciter(slug: string): MarkdownPage | null {
  const reciter = findReciterStrict(slug);
  if (!reciter) return null;

  return page(
    `${reciter.nameEn} — Kalamalah`,
    `/reciter-${reciter.slug}`,
    reciter.bioEn,
    `# ${reciter.nameEn} — ${reciter.nameAr}

- Riwayah: ${reciter.riwayahEn} (${reciter.riwayahAr})
- Country: ${reciter.countryAr}
- Word-by-word timings: ${reciter.hasWordByWord ? 'yes' : 'no'}
- Ayah timings: ${reciter.hasAyahTimings ? 'yes' : 'no'}

${reciter.bioEn}

${reciter.bioAr}

## Surahs

${SURAHS_META.map(
      (s) =>
        `- [${s.number}. ${s.nameEn}](${ORIGIN}/reader-${s.number}-${reciter.slug}.md) — ${s.ayahCount} ayahs`
    ).join('\n')}
`
  );
}

async function renderTafseer(bookId: number, surahNumber: number): Promise<MarkdownPage | null> {
  const book = TAFSEER_BOOKS.find((b) => b.id === bookId);
  if (!book) return null;
  const meta = getSurahMeta(surahNumber);
  const detail = await fetchSurahDetail(meta.number, 'en.sahih', book.editionId);

  const entries = detail.ayahs
    .map((a) => {
      const tafseer = a.tafseerText ? `\n\n${a.tafseerText.replace(/\s+/g, ' ').trim()}` : '';
      return `### ${meta.number}:${a.numberInSurah}\n\n${oneLine(a.text)}${tafseer}`;
    })
    .join('\n\n');

  return page(
    `${book.nameEn} — ${meta.nameEn}`,
    `/tafseer-${book.id}`,
    book.descriptionAr,
    `# ${book.nameEn} (${book.nameAr}) — ${meta.number}. ${meta.nameEn}

- Author: ${book.authorAr}
- Edition: \`${book.editionId}\`

${entries}
`
  );
}

function renderSurahIndex(): MarkdownPage {
  return page(
    'Index of the 114 surahs — Kalamalah',
    '/surah-index',
    'All Quran surahs with names, ayah counts and Markdown links',
    `# Index of the 114 surahs

| # | Surah | Arabic | Meaning | Ayahs | Revelation | Markdown |
|---|---|---|---|---|---|---|
${SURAHS_META.map(
      (s) =>
        `| ${s.number} | ${s.nameEn} | ${s.nameAr} | ${s.meaningEn} | ${s.ayahCount} | ${s.revelationType} | [\`.md\`](${ORIGIN}/surah-${s.number}.md) |`
    ).join('\n')}
`
  );
}

/**
 * Resolve a `.md` path (suffix already stripped) to a markdown document.
 * Returns `null` for anything without a markdown twin.
 */
export async function renderMarkdownForPath(
  path: string,
  query: Record<string, string | undefined> = {}
): Promise<MarkdownPage | null> {
  const slug = path.replace(/^\/+|\/+$/g, '').toLowerCase();

  if (slug === '' || slug === 'index' || slug === 'index.php') return renderHome();
  if (slug === 'surah-index') return renderSurahIndex();
  if (slug === 'reciters') return renderRecitersDirectory();
  if (slug === 'languages') return renderLanguages();

  const surahMatch = /^surah-(\d{1,3})$/.exec(slug);
  if (surahMatch) {
    const n = Number(surahMatch[1]);
    if (n < 1 || n > 114) return null;
    return renderSurah(n, query.translation ?? null);
  }

  const juzMatch = /^juz-(\d{1,2})$/.exec(slug);
  if (juzMatch) {
    const n = Number(juzMatch[1]);
    if (n < 1 || n > 30) return null;
    return renderJuz(n);
  }

  const pageMatch = /^(?:mushaf|page)-(\d{1,3})$/.exec(slug);
  if (pageMatch) {
    const n = Number(pageMatch[1]);
    if (n < 1 || n > 604) return null;
    return renderMushafPage(n);
  }

  const readerMatch = /^reader-(\d{1,3})-([a-z0-9_-]{1,64})$/.exec(slug);
  if (readerMatch) {
    const n = Number(readerMatch[1]);
    if (n < 1 || n > 114) return null;
    return renderReciter(readerMatch[2]!);
  }

  const reciterMatch = /^reciter-([a-z0-9_-]{1,64})$/.exec(slug);
  if (reciterMatch) return renderReciter(reciterMatch[1]!);

  const tafseerMatch = /^tafseer-(\d{1,3})$/.exec(slug);
  if (tafseerMatch) {
    const surah = Number(query.surah ?? 1);
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) return null;
    return renderTafseer(Number(tafseerMatch[1]), surah);
  }

  const singleTafseer = /^t-(\d{1,3})-(\d{1,3})-(\d{1,3})$/.exec(slug);
  if (singleTafseer) {
    const surah = Number(singleTafseer[1]);
    if (surah < 1 || surah > 114) return null;
    return renderTafseer(Number(singleTafseer[2]), surah);
  }

  return null;
}

/** `/llms.txt` — the conventional entry point for LLM crawlers. */
export function buildLlmsTxt(): string {
  return `# Kalamalah

> Quran reading platform: Uthmani script, 114 surahs, reciters with
> word-by-word timing, translation editions, tafsir and tajweed guidance.

Append \`.md\` to any page URL to get its Markdown twin instead of HTML.

## Start here

- [Overview](${ORIGIN}/index.md)
- [All 114 surahs](${ORIGIN}/surah-index.md)
- [Reciters](${ORIGIN}/reciters.md)
- [Translation editions](${ORIGIN}/languages.md)

## Surahs

${SURAHS_META.map(
    (s) => `- [${s.number}. ${s.nameEn} (${s.nameAr})](${ORIGIN}/surah-${s.number}.md)`
  ).join('\n')}

## Juz

${JUZ_META.map((j) => `- [Juz ${j.number}](${ORIGIN}/juz-${j.number}.md)`).join('\n')}

## Notes

- Content is Quran text and its translations; each translation edition keeps
  its own licence.
- HTML pages are at the same path without the \`.md\` suffix.
- Crawling is unrestricted: ${ORIGIN}/robots.txt
`;
}
