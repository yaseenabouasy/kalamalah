/**
 * Allow-list for servers we are willing to proxy or redirect audio from.
 * Anything not on this list falls back to a URL we constructed ourselves,
 * so a hostile upstream payload cannot turn /api/download into an SSRF
 * gadget or an open redirect.
 */
const ALLOWED_AUDIO_HOSTS = new Set([
  'api.kalamalah.com',
  'cdn.islam-online.net',
  'download.quranicaudio.com',
  'server11.mp3quran.net',
  'server12.mp3quran.net',
  'verses.quran.com',
]);

/** Returns `raw` only when it is an https URL on an allow-listed audio host. */
export function safeAudioUrl(raw: unknown, fallback: string): string {
  if (typeof raw === 'string') {
    try {
      const url = new URL(raw);
      if (url.protocol === 'https:' && ALLOWED_AUDIO_HOSTS.has(url.hostname)) {
        return url.href;
      }
    } catch {
      // Not a parseable URL.
    }
  }
  return fallback;
}
