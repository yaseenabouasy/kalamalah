export function generateAyahCard(arabicText: string, translation: string, citation: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
  grad.addColorStop(0, '#09090b');
  grad.addColorStop(1, '#111827');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1080);

  ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
  ctx.lineWidth = 4;
  ctx.strokeRect(48, 48, 984, 984);

  ctx.fillStyle = '#f4f4f5';
  ctx.textAlign = 'center';
  ctx.font = 'bold 46px serif';
  ctx.fillText(arabicText.slice(0, 120), 540, 440, 900);

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '28px system-ui, sans-serif';
  ctx.fillText(translation.slice(0, 140), 540, 560, 880);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText(`${citation} · Kalamalah`, 540, 940);

  const link = document.createElement('a');
  link.download = `kalamalah-${citation.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export function initAyahCardGenerator(): void {
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-ayah-card]');
    if (!btn) return;
    const arabic = btn.dataset.arabic || '';
    const translation = btn.dataset.translation || '';
    const citation = btn.dataset.citation || 'Quran';
    generateAyahCard(arabic, translation, citation);
  });
}
