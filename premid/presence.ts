const presence = new Presence({
  clientId: '1571308096624791695',
});

presence.on('UpdateData', async () => {
  const isEnabled = await presence.getSetting<boolean>('enabled');
  if (!isEnabled) {
    presence.clearActivity();
    return;
  }

  const audio = document.getElementById('kalamalah-audio-el') as HTMLAudioElement | null;
  const surahTitle =
    document.querySelector('.qp-bar-surah-name, #surah-hero-title')?.textContent?.trim() ||
    'Holy Quran';
  const reciterName =
    document.querySelector('.qp-bar-reciter-name')?.textContent?.trim() || 'Reciter';
  const activeAyah =
    document.querySelector('.is-active[data-ayah], .is-playing-ayah[data-ayah]')?.getAttribute('data-ayah') || '';

  const presenceData: PresenceData = {
    details: activeAyah ? `${surahTitle} — Ayah ${activeAyah}` : surahTitle,
    state: reciterName,
    largeImageKey: 'kalamalah_logo',
    largeImageText: 'Kalamalah Quran Player',
  };

  if (audio && !audio.paused && Number.isFinite(audio.duration) && audio.duration > 0) {
    const [, endTimestamp] = presence.getTimestampsfromMedia(audio);
    presenceData.endTimestamp = endTimestamp;
    presenceData.smallImageKey = 'play';
    presenceData.smallImageText = 'Playing';
  } else {
    presenceData.smallImageKey = 'pause';
    presenceData.smallImageText = 'Paused';
  }

  presence.setActivity(presenceData);
});
