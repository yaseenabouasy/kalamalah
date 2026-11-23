const SUBSTITUTIONS: Record<string, string> = {
  '\u0671': '\u0627', // alef wasla -> alef
  '\u0622': '\u0627', // alef madda -> alef
  '\u0623': '\u0627', // alef hamza above -> alef
  '\u0625': '\u0627', // alef hamza below -> alef
  '\u0649': '\u064A', // alef maksura -> yeh
  '\u0640': '',       // tatweel -> remove
};

/**
 * Strips Arabic diacritics (tashkeel) and normalizes alef/yeh variants
 * for reliable fuzzy search.
 */
export function normalizeArabic(text: string): string {
  let out = text;
  for (const [oldChar, newChar] of Object.entries(SUBSTITUTIONS)) {
    out = out.split(oldChar).join(newChar);
  }
  return out
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '');
}
