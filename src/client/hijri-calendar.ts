export function initHijriCalendarBanner(): void {
  const dateEl = document.getElementById('hijri-date-text');
  if (!dateEl) return;

  const now = new Date();
  try {
    const hijriFormatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const gregFormatter = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    const hijriStr = hijriFormatter.format(now);
    const gregStr = gregFormatter.format(now);
    dateEl.textContent = `${hijriStr} · ${gregStr}`;

    // Check White Days (13, 14, 15 of Hijri month)
    const dayParts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric',
    }).formatToParts(now);
    const dayNum = Number(dayParts.find((p) => p.type === 'day')?.value ?? 0);
    const badge = document.getElementById('hijri-white-days-badge');
    if (badge && (dayNum === 13 || dayNum === 14 || dayNum === 15)) {
      badge.style.display = 'inline-block';
    }
  } catch {
    dateEl.textContent = now.toDateString();
  }
}
