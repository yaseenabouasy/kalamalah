const CURRENT_VERSION = '1.2.0';

const STORAGE_KEY = 'kalamalah_last_seen_version';

export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: string[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.2.0',
    date: '2026-11-23',
    highlights: [
      'Markdown twins for every page — append `.md` to any URL (e.g. `/surah-1.md`, `/juz-2.md`) for AI crawlers and LLM agents',
      '`/llms.txt` index with all 114 surahs, Juz, reciters and translation editions',
      'Negative API cache prevents upstream 500 retries from adding ~250 ms per render',
      'Canonical Juz start-verse table (corrects Juz 2, 5, 9, 11, 12, 19 boundaries)',
      'Security: audio SSRF allow-list, CSP + secure headers, `/api/download` Range/If-Range streaming, 302→502 on unvalidated URLs',
      'Service worker rewritten: network-first navigations, stale-while-revalidate assets, allSettled precache',
      'Lazy fullscreen background (WebGL + 1920px images only on first open), pauses on close',
      'Keyboard shortcuts fixed: real button IDs + focused-element guard, KeyM toggles mute',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-11-15',
    highlights: [
      'Smoother AML word-by-word animations with anticipatory vocal onset',
      'Keyboard shortcuts (Space, J/K, R, M, F) & Deep-linking URLs',
      'Sleep Timer with smooth audio fade-out',
      'Ambient Sound Mixer (Rain, Wind/Snow, Masjid)',
      'Hifz First-Letter Hints, Weak Ayahs Tracker & Test Me Mode',
      'Fullscreen Masjid TV & Salah Times Display + Dual-Screen Mode',
      'PreMiD Discord Rich Presence & PWA Offline Support',
    ],
  },
];

export function showChangelogModal(): void {
  if (document.getElementById('kalamalah-changelog-modal')) return;
  const latest = CHANGELOG[0]!;
  const overlay = document.createElement('div');
  overlay.id = 'kalamalah-changelog-modal';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);padding:16px;';

  overlay.innerHTML = `
    <div style="max-width:480px;width:100%;background:var(--bg-card,#18181b);color:var(--text-primary,#f4f4f5);border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:24px;box-shadow:0 24px 48px rgba(0,0,0,0.4);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 style="margin:0;font-size:1.25rem;font-weight:700;">What's New in Kalamalah v${latest.version}</h2>
        <button id="kalamalah-changelog-close" aria-label="Close" style="background:none;border:none;color:inherit;font-size:1.25rem;cursor:pointer;padding:4px 8px;">✕</button>
      </div>
      <p style="margin:0 0 14px;font-size:0.85rem;opacity:0.7;">Released ${latest.date}</p>
      <ul style="margin:0 0 20px;padding-left:20px;line-height:1.6;font-size:0.95rem;">
        ${latest.highlights.map((item) => `<li>${item}</li>`).join('')}
      </ul>
      <button id="kalamalah-changelog-ok" style="width:100%;padding:10px 16px;border-radius:10px;border:none;background:var(--accent,#10b981);color:#fff;font-weight:600;cursor:pointer;">Got it</button>
    </div>
  `;

  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
    } catch {}
    overlay.remove();
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('#kalamalah-changelog-close')?.addEventListener('click', close);
  overlay.querySelector('#kalamalah-changelog-ok')?.addEventListener('click', close);
  document.body.appendChild(overlay);
}

export function initChangelogModal(): void {
  (window as any).__KALAMALAH_SHOW_CHANGELOG__ = showChangelogModal;
  try {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (seen !== CURRENT_VERSION) {
      showChangelogModal();
    }
  } catch {}
}
