export function initMediaSession(): void {
  if (!('mediaSession' in navigator)) return;

  const audio = document.querySelector('audio');
  if (!audio) return;

  const updateMetadata = () => {
    const title =
      document.querySelector('.player-surah-name, .surah-title, h1')?.textContent?.trim() ||
      'Kalamalah Quran';
    const artist =
      document.querySelector('.player-reciter-name, .reciter-name')?.textContent?.trim() ||
      'Kalamalah Reciter';

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: 'Kalamalah Player',
      artwork: [
        { src: '/images/round-logo.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  };

  audio.addEventListener('play', () => {
    updateMetadata();
    navigator.mediaSession.playbackState = 'playing';
  });
  audio.addEventListener('pause', () => {
    navigator.mediaSession.playbackState = 'paused';
  });

  navigator.mediaSession.setActionHandler('play', () => void audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    if (typeof details.seekTime === 'number') {
      audio.currentTime = details.seekTime;
    }
  });
  navigator.mediaSession.setActionHandler('previoustrack', () => {
    document.querySelector<HTMLButtonElement>('[data-player-prev]')?.click();
  });
  navigator.mediaSession.setActionHandler('nexttrack', () => {
    document.querySelector<HTMLButtonElement>('[data-player-next]')?.click();
  });
}
