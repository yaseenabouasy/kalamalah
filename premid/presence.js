const presence = new Presence({
  clientId: '1571308096624791695',
});

presence.on('UpdateData', async () => {
  const isEnabled = await presence.getSetting('enabled');
  if (!isEnabled) {
    presence.clearActivity();
    return;
  }

  const audio = document.getElementById('kalamalah-audio-el');
  const surahEl = document.querySelector('#qp-bar-surah, .qp-bar-surah-name, #surah-hero-title, h1');
  const reciterEl = document.querySelector('#qp-bar-reciter, .qp-bar-reciter-name, .qp-reciter-name, .sd-selected-label');
  const avatarEl = document.querySelector('#qp-bar-avatar img, .qp-bar-avatar img, img[alt*="reciter" i], .reciter-avatar img');
  const activeAyahEl = document.querySelector('.is-active[data-ayah], .is-playing-ayah[data-ayah]');

  const surahTitle = (surahEl && surahEl.textContent ? surahEl.textContent.trim() : '') || 'Holy Quran';
  const reciterName = (reciterEl && reciterEl.textContent ? reciterEl.textContent.trim() : '') || 'Quran Recitation';
  const activeAyah = activeAyahEl ? activeAyahEl.getAttribute('data-ayah') || '' : '';
  const reciterImg = avatarEl && avatarEl.src && avatarEl.src.startsWith('http') ? avatarEl.src : 'https://kalamalah.com/favicon.ico';

  const presenceData = {
    type: 2, // Listening
    details: activeAyah ? `${surahTitle} — Ayah ${activeAyah}` : surahTitle,
    state: reciterName,
    largeImageKey: reciterImg,
    largeImageText: reciterName,
  };

  if (audio && !audio.paused && Number.isFinite(audio.duration) && audio.duration > 0) {
    const timestamps = presence.getTimestampsfromMedia(audio);
    presenceData.startTimestamp = timestamps[0];
    presenceData.endTimestamp = timestamps[1];
  }

  presence.setActivity(presenceData);
});
