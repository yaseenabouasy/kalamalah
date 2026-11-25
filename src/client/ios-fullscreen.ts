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

    // Background artwork div (uses artworkUrl in CSS url())
  const bg = document.createElement('div');
  bg.style.cssText = `position:absolute;inset:-40px;background:url('${CSS.escape(artworkUrl)}') center/cover no-repeat;filter:blur(64px) brightness(0.32) saturate(1.4);transform:scale(1.15);z-index:0;pointer-events:none;`;
  overlay.appendChild(bg);

  const headerWrap = document.createElement('div');
  headerWrap.style.cssText = 'position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:520px;width:100%;margin:0 auto;';

  const infoWrap = document.createElement('div');
  infoWrap.style.cssText = 'display:flex;align-items:center;gap:12px;min-width:0;';

  const artworkImg = document.createElement('img');
  artworkImg.src = artworkUrl;
  artworkImg.alt = '';
  artworkImg.style.cssText = 'width:48px;height:48px;border-radius:10px;object-fit:cover;box-shadow:0 6px 16px rgba(0,0,0,0.4);';

  const textWrap = document.createElement('div');
  textWrap.style.cssText = 'min-width:0;';

  const titleDiv = document.createElement('div');
  titleDiv.style.cssText = 'font-weight:700;font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  titleDiv.textContent = titleText;

  const reciterDiv = document.createElement('div');
  reciterDiv.style.cssText = 'font-size:0.85rem;opacity:0.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  reciterDiv.textContent = reciterText;

  textWrap.appendChild(titleDiv);
  textWrap.appendChild(reciterDiv);
  infoWrap.appendChild(artworkImg);
  infoWrap.appendChild(textWrap);

  const moreWrap = document.createElement('div');
  moreWrap.style.cssText = 'position:relative;';

  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.id = 'ios-fs-more';
  moreBtn.setAttribute('aria-label', 'More options');
  moreBtn.style.cssText = 'background:rgba(255,255,255,0.1);border:none;color:#fff;width:34px;height:34px;border-radius:999px;cursor:pointer;font-size:1.1rem;display:grid;place-items:center;';
  moreBtn.textContent = '•••';

  const menu = document.createElement('div');
  menu.id = 'ios-fs-menu';
  menu.style.cssText = 'display:none;position:absolute;right:0;top:42px;min-width:170px;background:rgba(36,36,40,0.88);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.14);border-radius:14px;padding:6px;box-shadow:0 16px 40px rgba(0,0,0,0.5);';

  const resyncBtn = document.createElement('button');
  resyncBtn.type = 'button';
  resyncBtn.id = 'ios-fs-resync';
  resyncBtn.style.cssText = 'width:100%;text-align:left;background:none;border:none;color:#fff;padding:9px 12px;border-radius:8px;cursor:pointer;font-size:0.875rem;';
  resyncBtn.textContent = 'Resync Ayahs';

  const toggleAyahsBtn = document.createElement('button');
  toggleAyahsBtn.type = 'button';
  toggleAyahsBtn.id = 'ios-fs-toggle-ayahs';
  toggleAyahsBtn.style.cssText = 'width:100%;text-align:left;background:none;border:none;color:#fff;padding:9px 12px;border-radius:8px;cursor:pointer;font-size:0.875rem;';
  toggleAyahsBtn.textContent = 'Toggle Ayahs';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.id = 'ios-fs-close';
  closeBtn.style.cssText = 'width:100%;text-align:left;background:none;border:none;color:#f87171;padding:9px 12px;border-radius:8px;cursor:pointer;font-size:0.875rem;';
  closeBtn.textContent = 'Exit Fullscreen';

  menu.appendChild(resyncBtn);
  menu.appendChild(toggleAyahsBtn);
  menu.appendChild(closeBtn);
  moreWrap.appendChild(moreBtn);
  moreWrap.appendChild(menu);

  headerWrap.appendChild(infoWrap);
  headerWrap.appendChild(moreWrap);

  const ayahsBox = document.createElement('div');
  ayahsBox.id = 'ios-fs-ayahs';
  ayahsBox.dir = 'rtl';
  ayahsBox.style.cssText = 'position:relative;z-index:1;flex:1;display:flex;flex-direction:column;justify-content:center;gap:22px;max-width:520px;width:100%;margin:16px auto;overflow-y:auto;padding:12px 4px;text-align:center;';

  const ayah1 = document.createElement('div');
  ayah1.className = 'ios-fs-line active';
  ayah1.style.cssText = 'font-size:1.65rem;line-height:1.8;font-weight:700;color:#ffffff;transition:all 0.3s ease;';
  ayah1.textContent = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';

  const ayah2 = document.createElement('div');
  ayah2.className = 'ios-fs-line';
  ayah2.style.cssText = 'font-size:1.45rem;line-height:1.8;font-weight:600;color:rgba(255,255,255,0.45);filter:blur(1.2px);transition:all 0.3s ease;';
  ayah2.textContent = 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ';

  const ayah3 = document.createElement('div');
  ayah3.className = 'ios-fs-line';
  ayah3.style.cssText = 'font-size:1.45rem;line-height:1.8;font-weight:600;color:rgba(255,255,255,0.3);filter:blur(2px);transition:all 0.3s ease;';
  ayah3.textContent = 'الرَّحْمَٰنِ الرَّحِيمِ';

  ayahsBox.appendChild(ayah1);
  ayahsBox.appendChild(ayah2);
  ayahsBox.appendChild(ayah3);

  const controlsWrap = document.createElement('div');
  controlsWrap.style.cssText = 'position:relative;z-index:1;max-width:520px;width:100%;margin:0 auto;display:flex;flex-direction:column;gap:14px;';

  const seekWrap = document.createElement('div');
  const seekInput = document.createElement('input');
  seekInput.id = 'ios-fs-seek';
  seekInput.type = 'range';
  seekInput.min = '0';
  seekInput.max = '100';
  seekInput.value = '0';
  seekInput.style.cssText = 'width:100%;accent-color:#e4e4e7;cursor:pointer;height:4px;';
  const seekTimes = document.createElement('div');
  seekTimes.style.cssText = 'display:flex;justify-content:space-between;font-size:0.75rem;opacity:0.6;margin-top:4px;font-variant-numeric:tabular-nums;';
  const elapsedEl = document.createElement('span');
  elapsedEl.id = 'ios-fs-elapsed';
  elapsedEl.textContent = '0:00';
  const remainingEl = document.createElement('span');
  remainingEl.id = 'ios-fs-remaining';
  remainingEl.textContent = '-0:00';
  seekTimes.appendChild(elapsedEl);
  seekTimes.appendChild(remainingEl);
  seekWrap.appendChild(seekInput);
  seekWrap.appendChild(seekTimes);

  const btnWrap = document.createElement('div');
  btnWrap.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:36px;';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.id = 'ios-fs-prev';
  prevBtn.setAttribute('aria-label', 'Previous');
  prevBtn.style.cssText = 'background:none;border:none;color:#fff;font-size:1.6rem;cursor:pointer;';
  prevBtn.textContent = '⏮';

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.id = 'ios-fs-play';
  playBtn.setAttribute('aria-label', 'Play/Pause');
  playBtn.style.cssText = 'background:none;border:none;color:#fff;font-size:2.4rem;cursor:pointer;';
  playBtn.textContent = '▶';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.id = 'ios-fs-next';
  nextBtn.setAttribute('aria-label', 'Next');
  nextBtn.style.cssText = 'background:none;border:none;color:#fff;font-size:1.6rem;cursor:pointer;';
  nextBtn.textContent = '⏭';

  btnWrap.appendChild(prevBtn);
  btnWrap.appendChild(playBtn);
  btnWrap.appendChild(nextBtn);

  const ayahBtnWrap = document.createElement('div');
  ayahBtnWrap.style.cssText = 'display:flex;justify-content:flex-end;';

  const ayahBtn = document.createElement('button');
  ayahBtn.type = 'button';
  ayahBtn.id = 'ios-fs-ayah-btn';
  ayahBtn.setAttribute('aria-label', 'Toggle Ayahs');
  ayahBtn.style.cssText = 'background:rgba(255,255,255,0.12);border:none;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:0.9rem;';
  ayahBtn.textContent = '❝';

  ayahBtnWrap.appendChild(ayahBtn);

  controlsWrap.appendChild(seekWrap);
  controlsWrap.appendChild(btnWrap);
  controlsWrap.appendChild(ayahBtnWrap);

  overlay.appendChild(bg);
  overlay.appendChild(headerWrap);
  overlay.appendChild(ayahsBox);
  overlay.appendChild(controlsWrap);

  document.body.appendChild(overlay);

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
