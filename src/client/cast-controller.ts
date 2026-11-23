export function initCastController(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target?.closest('[data-cast-btn]')) return;

    const cast = (window as any).cast;
    if (cast?.framework?.CastContext) {
      void cast.framework.CastContext.getInstance().requestSession();
    } else if ('presentation' in navigator && (navigator as any).presentation?.defaultRequest) {
      void (navigator as any).presentation.defaultRequest.start().catch(() => {});
    } else {
      alert('Chromecast is available in Chrome/Edge when Cast devices are on your network.');
    }
  });
}
