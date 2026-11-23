export function copyAyahEmbedSnippet(surah: number, ayah: number): void {
  const url = `${window.location.origin}/surah-${surah}#ayah-${ayah}`;
  const snippet = `<iframe src="${url}" width="100%" height="220" style="border:0;border-radius:12px;" loading="lazy"></iframe>`;
  void navigator.clipboard?.writeText(snippet);
}

export function initAyahEmbedWidget(): void {
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-ayah-embed]');
    if (!btn) return;
    const surah = Number(btn.dataset.surah || 1);
    const ayah = Number(btn.dataset.ayah || 1);
    copyAyahEmbedSnippet(surah, ayah);
  });
}
