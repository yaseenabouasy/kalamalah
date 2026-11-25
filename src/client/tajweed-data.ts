/**
 * Tajweed data from quran.islamonline.net (scholar-reviewed)
 *
 * Replaces the heuristic colorizeArabicWordTajweed with per-word tajweed
 * annotations fetched from quran.islamonline.net.
 *
 * URL patterns tried (in order):
 *   https://quran.islamonline.net/data/tajweed/{slug}/{surah_3digit}.json
 *   https://quran.islamonline.net/data/tajweed/{surah_3digit}.json
 *   https://cdn.islam-online.net/data/tajweed/{slug}/{surah_3digit}.json
 *   https://quran.islamonline.net/api/tajweed/{slug}/{surah}
 *
 * If all fail, falls back to the heuristic colorizer in reading-tools.ts.
 */

export type TajweedColor = 'madd' | 'ghunnah' | 'qalqalah' | 'tafkheem' | 'iqlaab' | 'idgham' | 'ikhfa' | 'qamari' | 'shamsi';

export interface TajweedWordAnnotation {
  wordIndex: number;      // 0-based word index in the ayah
  charIndex: number;      // character index within the word
  char: string;           // the character itself
  rule: TajweedColor;     // tajweed rule that applies
  color: string;          // hex color
  ruleName: string;       // human-readable rule name
}

export interface TajweedAyahAnnotation {
  ayah: number;           // 1-based ayah number
  words: TajweedWordAnnotation[];
}

export interface TajweedSurahAnnotation {
  surah: number;
  reciterSlug: string;
  ayahs: TajweedAyahAnnotation[];
}

/**
 * Tajweed color scheme (printed schema) - matches the existing critical CSS variables.
 */
const TAJWEED_COLORS: Record<TajweedColor, string> = {
  madd: '#dc2626',
  ghunnah: '#16a34a',
  qalqalah: '#0284c7',
  tafkheem: '#2563eb',
  iqlaab: '#d97706',
  idgham: '#7c3aed',
  ikhfa: '#0891b2',
  qamari: '#059669',
  shamsi: '#b45309',
};

/**
 * Rule name -> color mapping for display in legend.
 */
export const TAJWEED_RULE_NAMES: Record<TajweedColor, { ar: string; en: string }> = {
  madd: { ar: 'المد', en: 'Madd' },
  ghunnah: { ar: 'الغنة', en: 'Ghunnah' },
  qalqalah: { ar: 'القلقلة', en: 'Qalqalah' },
  tafkheem: { ar: 'التفخيم', en: 'Tafkheem' },
  iqlaab: { ar: 'الإقلاب', en: 'Iqlaab' },
  idgham: { ar: 'الإدغام', en: 'Idgham' },
  ikhfa: { ar: 'الإخفاء', en: 'Ikhfa' },
  qamari: { ar: 'القمرية', en: 'Qamari Lam' },
  shamsi: { ar: 'الشمسية', en: 'Shamsi Lam' },
};

/**
 * Cache for tajweed annotations (surah + reciter -> annotations).
 */
const tajweedCache = new Map<string, Promise<TajweedSurahAnnotation | null>>();

/**
 * Build the URL(s) to try for tajweed data.
 */
function buildTajweedUrls(reciterSlug: string, surahNumber: number): string[] {
  const padded = String(surahNumber).padStart(3, '0');
  const urls: string[] = [];
  // Try various URL patterns that quran.islamonline.net might use
  urls.push(`https://quran.islamonline.net/data/tajweed/${reciterSlug}/${padded}.json`);
  urls.push(`https://quran.islamonline.net/data/tajweed/${padded}.json`);
  urls.push(`https://cdn.islam-online.net/data/tajweed/${reciterSlug}/${padded}.json`);
  urls.push(`https://quran.islamonline.net/api/tajweed/${reciterSlug}/${surahNumber}`);
  urls.push(`https://quran.islamonline.net/data/tajweed/${reciterSlug}/${surahNumber}.json`);
  return urls;
}

/**
 * Fetch tajweed annotations for a surah + reciter from quran.islamonline.net.
 * Returns null if no data available (caller should fall back to heuristic).
 */
export async function fetchTajweedAnnotations(
  reciterSlug: string,
  surahNumber: number,
  signal?: AbortSignal
): Promise<TajweedSurahAnnotation | null> {
  const cacheKey = `${reciterSlug}:${surahNumber}`;
  const existing = tajweedCache.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const urls = buildTajweedUrls(reciterSlug, surahNumber);
    let lastError: unknown = null;

    for (const url of urls) {
      try {
        const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
        if (!res.ok) continue;

        const text = await res.text();
        if (!text || text.trim().length === 0) continue;

        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          // Not JSON, try to parse as plain text line format
          data = parseTajweedTextFormat(text, reciterSlug, surahNumber);
          if (data) return data;
          continue;
        }

        const parsed = parseTajweedJson(data, reciterSlug, surahNumber);
        if (parsed) return parsed;
      } catch (err) {
        lastError = err;
        continue;
      }
    }

    console.warn(`[Tajweed] No data from quran.islamonline.net for ${reciterSlug} surah ${surahNumber}, falling back to heuristic`);
    return null;
  })();

  tajweedCache.set(cacheKey, promise);
  return promise;
}

/**
 * Parse tajweed JSON from quran.islamonline.net.
 * Tries multiple possible JSON structures.
 */
function parseTajweedJson(data: any, reciterSlug: string, surahNumber: number): TajweedSurahAnnotation | null {
  if (!data) return null;

  // Try different JSON structures
  let ayahs: any[] | null = null;

  if (Array.isArray(data)) {
    ayahs = data;
  } else if (data.ayahs && Array.isArray(data.ayahs)) {
    ayahs = data.ayahs;
  } else if (data.verses && Array.isArray(data.verses)) {
    ayahs = data.verses;
  } else if (data.data && Array.isArray(data.data)) {
    ayahs = data.data;
  } else if (data.surah && Array.isArray(data.surah.ayahs)) {
    ayahs = data.surah.ayahs;
  }

  if (!ayahs || ayahs.length === 0) return null;

  const result: TajweedSurahAnnotation = {
    surah: surahNumber,
    reciterSlug,
    ayahs: [],
  };

  for (const ayah of ayahs) {
    const ayahNum = Number(ayah.ayah ?? data?.ayah ?? ayah.number ?? ayah.verse);
    if (!ayahNum || ayahNum < 1) continue;

    const words: TajweedWordAnnotation[] = [];

    // Try different word annotation structures
    const wordAnnotations = ayah.words ?? ayah.word_annotations ?? ayah.tajweed_words ?? ayah.chars ?? [];

    if (Array.isArray(wordAnnotations)) {
      for (const w of wordAnnotations) {
        const wordIdx = Number(w.word_index ?? w.wordIndex ?? w.index ?? w.w ?? 0) - 1; // 1-based to 0-based
        const charIdx = Number(w.char_index ?? w.charIndex ?? w.c ?? 0);
        const char = w.char ?? w.character ?? w.ch ?? '';
        const rule = w.rule ?? w.tajweed_rule ?? w.tajweed ?? 'madd';
        const color = w.color ?? TAJWEED_COLORS[rule as TajweedColor] ?? '#dc2626';
        const ruleName = w.rule_name ?? w.name ?? TAJWEED_RULE_NAMES[rule as TajweedColor]?.en ?? rule;

        words.push({
          wordIndex: wordIdx,
          charIndex: charIdx,
          char,
          rule: (rule as TajweedColor) || 'madd',
          color,
          ruleName: ruleName as string,
        });
      }
    }

    result.ayahs.push({
      ayah: ayahNum,
      words,
    });
  }

  return result.ayahs.length > 0 ? result : null;
}

/**
 * Parse tajweed data from plain text format (line-based).
 * Format: ayahNum|wordIndex|charIndex|char|rule|color
 * Or: ayahNum|wordIndex|charIndex|char|rule
 */
function parseTajweedTextFormat(
  text: string,
  reciterSlug: string,
  surahNumber: number
): TajweedSurahAnnotation | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;

  const ayahsMap = new Map<number, TajweedAyahAnnotation>();

  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length < 4) continue;

    const ayahNum = Number(parts[0]);
    const wordIdx = Number(parts[1]) - 1; // 1-based to 0-based
    const charIdx = Number(parts[2]);
    const char = parts[3] ?? '';
    const rule = (parts[4] || 'madd') as TajweedColor;
    const color = parts[5] ?? TAJWEED_COLORS[rule] ?? '#dc2626';

    if (!ayahNum || wordIdx < 0) continue;

    let ayah = ayahsMap.get(ayahNum);
    if (!ayah) {
      ayah = { ayah: ayahNum, words: [] };
      ayahsMap.set(ayahNum, ayah);
    }

    ayah.words.push({
      wordIndex: wordIdx,
      charIndex: charIdx,
      char,
      rule,
      color,
      ruleName: TAJWEED_RULE_NAMES[rule]?.en ?? rule,
    });
  }

  const result: TajweedSurahAnnotation = {
    surah: surahNumber,
    reciterSlug,
    ayahs: Array.from(ayahsMap.values()).sort((a, b) => a.ayah - b.ayah),
  };

  return result.ayahs.length > 0 ? result : null;
}

/**
 * Apply tajweed annotations to an Arabic word's characters.
 * Returns HTML with per-character color spans, or null if no tajweed data for this word.
 */
export function applyTajweedToWord(
  word: string,
  wordIndex: number,
  ayahAnnotations: TajweedAyahAnnotation | null,
  escapeHtml: (s: string) => string
): { html: string; hasTajweed: boolean } {
  if (!ayahAnnotations || ayahAnnotations.words.length === 0) {
    return { html: escapeHtml(word), hasTajweed: false };
  }

  // Get annotations for this word
  const wordAnnos = ayahAnnotations.words.filter((w) => w.wordIndex === wordIndex);
  if (wordAnnos.length === 0) {
    return { html: escapeHtml(word), hasTajweed: false };
  }

  // Build a map of charIndex -> annotation for quick lookup
  const charAnnoMap = new Map<number, TajweedWordAnnotation>();
  for (const w of wordAnnos) {
    charAnnoMap.set(w.charIndex, w);
  }

  // Group word into grapheme clusters (base + combining diacritics)
  const clusters: string[] = [];
  for (const ch of word) {
    const code = ch.charCodeAt(0);
    const isCombining =
      (code >= 0x0610 && code <= 0x061a) ||
      (code >= 0x064b && code <= 0x065f) ||
      code === 0x0670 ||
      (code >= 0x06d6 && code <= 0x06ed) ||
      (code >= 0x08d3 && code <= 0x08ff);
    if (isCombining && clusters.length > 0) {
      clusters[clusters.length - 1] += ch;
    } else {
      clusters.push(ch);
    }
  }

  let hasTajweed = false;
  let result = '';

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i] ?? '';
    const base = cluster[0] ?? '';

    // Check if this cluster's first char has a tajweed annotation
    const anno = charAnnoMap.get(i);
    if (anno) {
      hasTajweed = true;
      result += `<span class="tj-char" style="color:${anno.color ?? '#dc2626'}" title="${escapeHtml(anno.ruleName ?? '')}">${escapeHtml(cluster)}</span>`;
    } else {
      result += escapeHtml(cluster);
    }
  }

  return { html: result, hasTajweed };
}

/**
 * Clear the tajweed cache (useful when reciter or surah changes).
 */
export function clearTajweedCache(): void {
  tajweedCache.clear();
}

/**
 * Preload tajweed data for a surah + reciter (call on page load).
 */
export function preloadTajweed(reciterSlug: string, surahNumber: number): void {
  // Fire and forget - cache will be populated
  void fetchTajweedAnnotations(reciterSlug, surahNumber);
}
