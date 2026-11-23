/**
 * Cloudflare Zaraz consent bridge + SPA tracking.
 *
 * Zaraz is consent-aware: `zaraz.consent.set(...)` decides which configured
 * tools may run. Until this file reports a choice, every purpose stays denied,
 * so nothing fires before the cookie banner is answered.
 *
 * Purposes must exist in the Zaraz dashboard (Zaraz → Consent) with the same
 * keys used here: `analytics`, `advertising`, `preferences`.
 */

const CONSENT_KEY = 'kalamalah_cookie_consent_v1';

export type ConsentChoice = 'accepted' | 'essential';

interface ZarazConsentApi {
  set?: (payload: Record<string, boolean>) => void;
  get?: (purpose: string) => boolean | undefined;
}

interface ZarazApi {
  consent?: ZarazConsentApi;
  track?: (event: string, props?: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    zaraz?: ZarazApi;
    __kalamalahZarazConsent?: Record<string, boolean>;
    __kalamalahZarazRetries?: number;
  }
}

function consentPayload(choice: ConsentChoice): Record<string, boolean> {
  const granted = choice === 'accepted';
  return {
    necessary: true,
    analytics: granted,
    advertising: granted,
    preferences: granted,
  };
}

/** Push the consent decision to Zaraz, retrying while it is still loading. */
export function setZarazConsent(choice: ConsentChoice): void {
  const payload = consentPayload(choice);
  window.__kalamalahZarazConsent = payload;

  const api = window.zaraz?.consent;
  if (api?.set) {
    try {
      api.set(payload);
      return;
    } catch {
      // Fall through to the retry path.
    }
  }

  // The loader is async; give it a few seconds before giving up.
  const retries = window.__kalamalahZarazRetries ?? 0;
  if (retries >= 20) return;
  window.__kalamalahZarazRetries = retries + 1;
  window.setTimeout(() => setZarazConsent(choice), 250);
}

/** Send an event only when analytics consent is actually granted. */
export function trackZarazEvent(event: string, props: Record<string, unknown> = {}): void {
  const granted = window.__kalamalahZarazConsent?.analytics === true;
  if (!granted) return;
  try {
    window.zaraz?.track?.(event, props);
  } catch {
    // Analytics must never break navigation.
  }
}

/** Called once at boot, before the first SPA navigation. */
export function initZarazConsent(): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(CONSENT_KEY);
  } catch {}
  setZarazConsent(stored === 'accepted' ? 'accepted' : 'essential');
}

/** Page-view event for the SPA router (Zaraz only sees the first load). */
export function trackPageView(path: string, title: string): void {
  trackZarazEvent('page_view', {
    path,
    title,
    url: window.location.href,
  });
}
