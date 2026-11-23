function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function openIosFullscreen(): void {
  if (document.getElementById('kalamalah-ios-fs')) return;

  const audio = document.querySelector('audio');
  const titleText =
    document.querySelector('.player-surah-name, .surah-title, h1')?.textContent?.trim() ||
    'Kalamalah Quran';
  const reciterText =
    document.querySelector('.player-reciter-name, .reciter-name')?.textContent?.trim() ||
    'Recitation';
  const artworkUrl =
    (document.querySelector('.player-artwork img, .reciter-avatar img') as HTMLImageElement | null)
      ?.src || '/images/round-logo.png';

  const overlay = document.createElement('div');
  overlay.id = 'kalamalah-ios-fs';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:10050;display:flex;flex-direction:column;justify-content:space-between;background:#161618;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overflow:hidden;padding:24px 20px 28px;';

  overlay.innerHTML = `
    <div style="position:absolute;inset:-40px;background:url('${artworkUrl}') center/cover no-repeat;filter:blur(64px) brightness(0.32) saturate(1.4);transform:scale(1.15);z-index:0;pointer-events:none;"></div>
    <div style="position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:520px;width:100%;margin:0 auto;">
      <div style="display:flex;align-items:center;gap:12px;min-width:0;">
        <img src="${artworkUrl}" alt="" style="width:48px;height:48px;border-radius:10px;object-fit:cover;box-shadow:0 6px 16px rgba(0,0,0,0.4);" />
        <div style="min-width:0;">
          <div style="font-weight:700;font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${titleText}</div>
          <div style="font-size:0.85rem;opacity:0.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${reciterText}</div>
        </div>
      </div>
      <div style="position:relative;">
        <button type="button" id="ios-fs-more" aria-label="More options" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:34px;height:34px;border-radius:999px;cursor:pointer;font-size:1.1rem;display:grid;place-items:center;">•••</button>
        <div id="ios-fs-menu" style="display:none;position:absolute;right:0;top:42px;min-width:170px;background:rgba(36,36,40,0.88);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.14);border-radius:14px;padding:6px;box-shadow:0 16px 40px rgba(0,0,0,0.5);">
          <button type="button" id="ios-fs-resync" style="width:100%;text-align:left;background:none;border:none;color:#fff;padding:9px 12px;border-radius:8px;cursor:pointer;font-size:0.875rem;">Resync Ayahs</button>
          <button type="button" id="ios-fs-toggle-ayahs" style="width:100%;text-align:left;background:none;border:none;color:#fff;padding:9px 12px;border-radius:8px;cursor:pointer;font-size:0.875rem;">Toggle Ayahs</button>
          <button type="button" id="ios-fs-close" style="width:100%;text-align:left;background:none;border:none;color:#f87171;padding:9px 12px;border-radius:8px;cursor:pointer;font-size:0.875rem;">Exit Fullscreen</button>
        </div>
      </div>
    </div>

    <div id="ios-fs-ayahs" dir="rtl" style="position:relative;z-index:1;flex:1;display:flex;flex-direction:column;justify-content:center;gap:22px;max-width:520px;width:100%;margin:16px auto;overflow-y:auto;padding:12px 4px;text-align:center;">
      <div class="ios-fs-line active" style="font-size:1.65rem;line-height:1.8;font-weight:700;color:#ffffff;transition:all 0.3s ease;">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>
      <div class="ios-fs-line" style="font-size:1.45rem;line-height:1.8;font-weight:600;color:rgba(255,255,255,0.45);filter:blur(1.2px);transition:all 0.3s ease;">الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ</div>
      <div class="ios-fs-line" style="font-size:1.45rem;line-height:1.8;font-weight:600;color:rgba(255,255,255,0.3);filter:blur(2px);transition:all 0.3s ease;">الرَّحْمَٰنِ الرَّحِيمِ</div>
    </div>

    <div style="position:relative;z-index:1;max-width:520px;width:100%;margin:0 auto;display:flex;flex-direction:column;gap:14px;">
      <div>
        <input id="ios-fs-seek" type="range" min="0" max="100" value="0" style="width:100%;accent-color:#e4e4e7;cursor:pointer;height:4px;" />
        <div style="display:flex;justify-content:space-between;font-size:0.75rem;opacity:0.6;margin-top:4px;font-variant-numeric:tabular-nums;">
          <span id="ios-fs-elapsed">0:00</span>
          <span id="ios-fs-remaining">-0:00</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:36px;">
        <button type="button" id="ios-fs-prev" aria-label="Previous" style="background:none;border:none;color:#fff;font-size:1.6rem;cursor:pointer;">⏮</button>
        <button type="button" id="ios-fs-play" aria-label="Play/Pause" style="background:none;border:none;color:#fff;font-size:2.4rem;cursor:pointer;">▶</button>
        <button type="button" id="ios-fs-next" aria-label="Next" style="background:none;border:none;color:#fff;font-size:1.6rem;cursor:pointer;">⏭</button>
      </div>
      <div style="display:flex;justify-content:flex-end;">
        <button type="button" id="ios-fs-ayah-btn" aria-label="Toggle Ayahs" style="background:rgba(255,255,255,0.12);border:none;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:0.9rem;">❝</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const menu = overlay.querySelector('#ios-fs-menu') as HTMLElement;
  const ayahsBox = overlay.querySelector('#ios-fs-ayahs') as HTMLElement;
  const playBtn = overlay.querySelector('#ios-fs-play') as HTMLButtonElement;
  const seekInput = overlay.querySelector('#ios-fs-seek') as HTMLInputElement;
  const elapsedEl = overlay.querySelector('#ios-fs-elapsed') as HTMLElement;
  const remainingEl = overlay.querySelector('#ios-fs-remaining') as HTMLElement;

  const syncFromAudio = () => {
    if (!audio) return;
    playBtn.textContent = audio.paused ? '▶' : '⏸';
    const dur = audio.duration || 0;
    const cur = audio.currentTime || 0;
    seekInput.value = dur > 0 ? String((cur / dur) * 100) : '0';
    elapsedEl.textContent = formatTime(cur);
    remainingEl.textContent = `-${formatTime(Math.max(0, dur - cur))}`;
  };

  const syncTimer = window.setInterval(syncFromAudio, 250);
  syncFromAudio();

  const close = () => {
    window.clearInterval(syncTimer);
    overlay.remove();
  };

  overlay.querySelector('#ios-fs-more')?.addEventListener('click', () => {
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  });
  overlay.querySelector('#ios-fs-close')?.addEventListener('click', close);
  overlay.querySelector('#ios-fs-toggle-ayahs')?.addEventListener('click', () => {
    ayahsBox.style.opacity = ayahsBox.style.opacity === '0' ? '1' : '0';
    menu.style.display = 'none';
  });
  overlay.querySelector('#ios-fs-ayah-btn')?.addEventListener('click', () => {
    ayahsBox.style.opacity = ayahsBox.style.opacity === '0' ? '1' : '0';
  });
  overlay.querySelector('#ios-fs-resync')?.addEventListener('click', () => {
    syncFromAudio();
    menu.style.display = 'none';
  });

  playBtn.addEventListener('click', () => {
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
    syncFromAudio();
  });

  seekInput.addEventListener('input', () => {
    if (!audio || !audio.duration) return;
    audio.currentTime = (Number(seekInput.value) / 100) * audio.duration;
    syncFromAudio();
  });
}

export function initIosFullscreen(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-ios-fullscreen]')) {
      openIosFullscreen();
    }
  });
}
