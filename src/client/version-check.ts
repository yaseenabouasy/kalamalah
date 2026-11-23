export const LOCAL_UPDATE_NUMBER = 2;
export const LOCAL_VERSION = '1.2.0';

interface ReleaseInfo {
  version: string;
  updateNumber: number;
  date: string;
  notes?: string[];
}

export async function checkForUpdates(): Promise<void> {
  try {
    const res = await fetch('/release.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as ReleaseInfo;
    if (typeof data.updateNumber === 'number' && data.updateNumber > LOCAL_UPDATE_NUMBER) {
      showUpdateBanner(data);
    }
  } catch {
    // Offline or unreachable — silently ignore
  }
}

function showUpdateBanner(info: ReleaseInfo): void {
  if (document.getElementById('kalamalah-update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'kalamalah-update-banner';
  banner.style.cssText =
    'position:fixed;bottom:84px;right:16px;z-index:9998;max-width:340px;background:var(--bg-card,#18181b);color:var(--text-primary,#f4f4f5);border:1px solid rgba(16,185,129,0.45);border-radius:12px;padding:12px 14px;box-shadow:0 12px 32px rgba(0,0,0,0.4);font-size:0.875rem;display:flex;flex-direction:column;gap:8px;';

  banner.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <strong>Update Available (v${info.version} · #${info.updateNumber})</strong>
      <button type="button" id="kalamalah-update-dismiss" aria-label="Dismiss" style="background:none;border:none;color:inherit;cursor:pointer;font-size:1rem;opacity:0.7;">✕</button>
    </div>
    <p style="margin:0;opacity:0.8;font-size:0.8rem;">You are on v${LOCAL_VERSION} (#${LOCAL_UPDATE_NUMBER}). Refresh to load the latest release.</p>
    <button type="button" id="kalamalah-update-reload" style="padding:6px 12px;border-radius:8px;border:none;background:#10b981;color:#fff;font-weight:600;cursor:pointer;">Reload Now</button>
  `;

  banner.querySelector('#kalamalah-update-dismiss')?.addEventListener('click', () => banner.remove());
  banner.querySelector('#kalamalah-update-reload')?.addEventListener('click', () => window.location.reload());
  document.body.appendChild(banner);
}
