/**
 * Cloudflare Zaraz integration (server side).
 *
 * Zaraz is a dashboard product: tools, triggers and consent purposes are
 * configured at Cloudflare. The code side is only the loader tag plus the
 * CSP origins it needs.
 *
 * Two supported setups:
 *   1. Zone proxied by Cloudflare with Zaraz enabled → the edge injects
 *      `<zone>/cdn-cgi/zaraz/i.js` automatically. Leave ZARAZ_SCRIPT_URL
 *      unset; nothing is rendered here.
 *   2. Self-hosted / not proxied → set ZARAZ_SCRIPT_URL to the snippet URL
 *      Cloudflare gives you in Zaraz → "Add manually". It is rendered here.
 */

export interface ZarazConfig {
  /** Loader URL to render, or null when Cloudflare injects it at the edge. */
  scriptUrl: string | null;
  /** Origin of the loader, needed for the CSP allow-list. */
  origin: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getZarazConfig(): ZarazConfig {
  const raw = process.env.ZARAZ_SCRIPT_URL?.trim();
  if (!raw) return { scriptUrl: null, origin: null };
  try {
    const url = new URL(raw);
    // Never inject a script over plain HTTP or from a data:/javascript: URL.
    if (url.protocol !== 'https:') return { scriptUrl: null, origin: null };
    return { scriptUrl: url.toString(), origin: url.origin };
  } catch {
    return { scriptUrl: null, origin: null };
  }
}

/** Origins to append to script-src / connect-src / img-src so Zaraz can run. */
export function zarazCspOrigins(): string[] {
  const { origin } = getZarazConfig();
  return origin ? [origin] : [];
}

/**
 * Loader tag for the `<head>`.
 *
 * `data-cfasync="false"` stops Rocket Loader from deferring it (Zaraz needs to
 * see the page before other tools fire). Consent defaults to denied until the
 * client bridge in `src/client/zaraz.ts` reports a choice.
 */
export function renderZarazHeadHtml(): string {
  const { scriptUrl } = getZarazConfig();
  if (!scriptUrl) return '';
  return `<script data-cfasync="false" async src="${escapeHtml(scriptUrl)}"></script>`;
}
