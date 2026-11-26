/** Web Presentation API session type (not in default TS lib). */
interface PresentationSession {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  terminate(): Promise<void>;
  setSinkId?(sinkId: string): Promise<void>;
}

export function initCastController(): void {
  const audioEl = document.getElementById('kalamalah-audio-el') as HTMLAudioElement | null;
  let session: PresentationSession | null = null;

  const attachAudio = () => {
    if (!session || !audioEl) return;
    // Mirror the audio element to the cast session if it supports setSinkId
    const setSinkId = (session as any).setSinkId;
    if (setSinkId) {
      void setSinkId.call(session, (audioEl as any).sinkId || '');
    }
  };

  const releaseSession = () => {
    if (session) {
      session.removeEventListener('terminate', onTerminate);
      session = null;
    }
    document.body.style.display = '';
  };

  const onTerminate = () => {
    releaseSession();
  };

  const requestSession = async () => {
    try {
      if (!('presentation' in navigator)) {
        alert('العرض على الأجهزة الخارجية غير متاح في هذا المتصفح.\nCast to external display is not available in this browser.');
        return;
      }
      const request = (navigator as any).presentation?.defaultRequest;
      if (!request) {
        alert('لم يتم العثور على جهاز عرض متاح.\nNo Cast display device found on your network.');
        return;
      }
      session = await request.start();
      session?.addEventListener('terminate', onTerminate);
      attachAudio();
      // Hide local UI while casting
      document.body.style.display = 'none';
    } catch (err) {
      console.warn('[Kalamalah] Cast failed:', err);
      alert('فشل بدء البث.\nFailed to start cast session.');
    }
  };

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target?.closest('[data-cast-btn]')) return;
    e.preventDefault();
    void requestSession();
  });

  // Reconnect if a session already exists (page reload while casting)
  if ('presentation' in navigator) {
    const receiver = (navigator as any).presentation?.receiver;
    if (receiver && typeof receiver.connection === 'object') {
      session = receiver.connection as PresentationSession;
      session.addEventListener('terminate', onTerminate);
      attachAudio();
      document.body.style.display = 'none';
    }
  }
}
