export function initDebugOverlay(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get('debug') !== '1') return;
  if (document.getElementById('kalamalah-debug-overlay')) return;

  const panel = document.createElement('aside');
  panel.id = 'kalamalah-debug-overlay';
  panel.style.cssText =
    'position:fixed;top:12px;left:12px;z-index:10000;background:rgba(15,15,20,0.88);color:#e4e4e7;border:1px solid rgba(255,255,255,0.16);border-radius:10px;padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.5;backdrop-filter:blur(8px);min-width:210px;pointer-events:auto;';

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <strong style="color:#34d399;">KALAMALAH DEBUG</strong>
      <button type="button" id="kalamalah-debug-close" style="background:none;border:none;color:#a1a1aa;cursor:pointer;font-size:12px;">✕</button>
    </div>
    <div id="kalamalah-debug-stats">Initializing...</div>
  `;

  document.body.appendChild(panel);
  panel.querySelector('#kalamalah-debug-close')?.addEventListener('click', () => panel.remove());

  let frames = 0;
  let lastFpsTime = performance.now();
  let fps = 60;

  const tick = (now: number) => {
    frames++;
    if (now - lastFpsTime >= 1000) {
      fps = Math.round((frames * 1000) / (now - lastFpsTime));
      frames = 0;
      lastFpsTime = now;
    }

    const audio = document.querySelector('audio');
    const currentTime = audio ? audio.currentTime.toFixed(2) : '—';
    const buffered =
      audio && audio.buffered.length > 0
        ? audio.buffered.end(audio.buffered.length - 1).toFixed(2)
        : '—';
    const swStatus = 'serviceWorker' in navigator && navigator.serviceWorker.controller ? 'active' : 'none';
    const online = navigator.onLine ? 'online' : 'offline';

    const statsEl = document.getElementById('kalamalah-debug-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        FPS: <b>${fps}</b> | Net: <b>${online}</b><br/>
        Audio: <b>${currentTime}s</b> (buf: ${buffered}s)<br/>
        SW: <b>${swStatus}</b>
      `;
    }
    if (document.getElementById('kalamalah-debug-overlay')) {
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);
}
