export interface SalahTimesData {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  city?: string;
}

async function fetchSalahByCoords(lat: number, lon: number): Promise<SalahTimesData> {
  const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lon}&method=4`);
  const json = (await res.json()) as any;
  const t = json?.data?.timings || {};
  return {
    fajr: t.Fajr || '--:--',
    sunrise: t.Sunrise || '--:--',
    dhuhr: t.Dhuhr || '--:--',
    asr: t.Asr || '--:--',
    maghrib: t.Maghrib || '--:--',
    isha: t.Isha || '--:--',
    city: json?.data?.meta?.timezone || 'Local Time',
  };
}

async function fetchSalahByCity(city: string): Promise<SalahTimesData> {
  const res = await fetch(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=&method=4`);
  const json = (await res.json()) as any;
  const t = json?.data?.timings || {};
  return {
    fajr: t.Fajr || '--:--',
    sunrise: t.Sunrise || '--:--',
    dhuhr: t.Dhuhr || '--:--',
    asr: t.Asr || '--:--',
    maghrib: t.Maghrib || '--:--',
    isha: t.Isha || '--:--',
    city,
  };
}

function renderSalahTvOverlay(times: SalahTimesData): void {
  document.getElementById('kalamalah-salah-tv')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'kalamalah-salah-tv';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:10000;background:#09090b;color:#fafafa;display:flex;flex-direction:column;justify-content:space-between;padding:48px 64px;font-family:system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums;';

  const prayers = [
    { name: 'Fajr', ar: 'الفجر', time: times.fajr },
    { name: 'Sunrise', ar: 'الشروق', time: times.sunrise },
    { name: 'Dhuhr', ar: 'الظهر', time: times.dhuhr },
    { name: 'Asr', ar: 'العصر', time: times.asr },
    { name: 'Maghrib', ar: 'المغرب', time: times.maghrib },
    { name: 'Isha', ar: 'العشاء', time: times.isha },
  ];

  const getNextPrayer = () => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    for (const p of prayers) {
      const [h, m] = p.time.split(':').map(Number);
      if (h !== undefined && m !== undefined && Number.isFinite(h) && Number.isFinite(m) && h * 60 + m > nowMin) {
        const diff = h * 60 + m - nowMin;
        return { name: p.name, ar: p.ar, diffMin: diff };
      }
    }
    return { name: prayers[0]!.name, ar: prayers[0]!.ar, diffMin: null };
  };

  const next = getNextPrayer();

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;';

  const cityDiv = document.createElement('div');
  cityDiv.style.cssText = 'font-size:1.25rem;font-weight:600;letter-spacing:-0.01em;';
  cityDiv.textContent = times.city || 'Local Time';

  const dateEl = document.createElement('div');
  dateEl.id = 'salah-tv-date';
  dateEl.style.cssText = 'font-size:0.95rem;color:#a1a1aa;margin-top:4px;';

  const leftDiv = document.createElement('div');
  leftDiv.appendChild(cityDiv);
  leftDiv.appendChild(dateEl);

  const closeBtn = document.createElement('button');
  closeBtn.id = 'salah-tv-close';
  closeBtn.style.cssText = 'background:transparent;border:1px solid #27272a;color:#a1a1aa;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:0.9rem;';
  closeBtn.textContent = 'Exit';

  header.appendChild(leftDiv);
  header.appendChild(closeBtn);

  const centerDiv = document.createElement('div');
  centerDiv.style.cssText = 'text-align:center;margin:auto 0;';

  const clockEl = document.createElement('div');
  clockEl.id = 'salah-tv-clock';
  clockEl.style.cssText = 'font-size:6.5rem;font-weight:700;letter-spacing:-0.04em;line-height:1;';

  const nextEl = document.createElement('div');
  nextEl.id = 'salah-tv-next';
  nextEl.style.cssText = 'font-size:1.35rem;color:#10b981;margin-top:16px;font-weight:500;';

  centerDiv.appendChild(clockEl);
  centerDiv.appendChild(nextEl);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(6,1fr);border-top:1px solid #27272a;padding-top:32px;gap:16px;';

  for (const p of prayers) {
    const isNext = p.name === next.name;
    const prayerDiv = document.createElement('div');
    prayerDiv.style.cssText = `padding:12px 8px;text-align:center;${isNext ? 'border-top:2px solid #10b981;margin-top:-33px;padding-top:43px;' : 'opacity:0.7;'}`;

    const arDiv = document.createElement('div');
    arDiv.style.cssText = 'font-size:1.35rem;font-weight:600;margin-bottom:4px;';
    arDiv.textContent = p.ar;

    const nameDiv = document.createElement('div');
    nameDiv.style.cssText = 'font-size:0.85rem;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;';
    nameDiv.textContent = p.name;

    const timeDiv = document.createElement('div');
    timeDiv.style.cssText = `font-size:2rem;font-weight:700;color:${isNext ? '#10b981' : '#fafafa'};`;
    timeDiv.textContent = p.time;

    prayerDiv.appendChild(arDiv);
    prayerDiv.appendChild(nameDiv);
    prayerDiv.appendChild(timeDiv);
    grid.appendChild(prayerDiv);
  }

  overlay.appendChild(header);
  overlay.appendChild(centerDiv);
  overlay.appendChild(grid);

  const dateEl2 = overlay.querySelector('#salah-tv-date')!;
  const updateClock = () => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const n = getNextPrayer();
    if (n.diffMin !== null) {
      const h = Math.floor(n.diffMin / 60);
      const m = n.diffMin % 60;
      nextEl.textContent = `${n.name} (${n.ar}) in ${h > 0 ? `${h}h ` : ''}${m}m`;
    } else {
      nextEl.textContent = `Next: ${n.name} (${n.ar})`;
    }
  };
  updateClock();
  const timer = setInterval(updateClock, 1000);

  overlay.querySelector('#salah-tv-close')?.addEventListener('click', () => {
    clearInterval(timer);
    if (document.fullscreenElement) void document.exitFullscreen();
    overlay.remove();
  });

  document.body.appendChild(overlay);
  void overlay.requestFullscreen?.().catch(() => {});
}

export function openSalahTvView(times?: SalahTimesData): void {
  if (times) {
    renderSalahTvOverlay(times);
    return;
  }

  document.getElementById('kalamalah-salah-consent')?.remove();
  const modal = document.createElement('div');
  modal.id = 'kalamalah-salah-consent';
  modal.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);padding:16px;';
  const card = document.createElement('div');
  card.style.cssText = 'max-width:440px;width:100%;background:var(--bg-card,#18181b);color:var(--text-primary,#f4f4f5);border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:24px;';

  const title = document.createElement('h3');
  title.style.cssText = 'margin:0 0 10px;';
  title.textContent = 'Location for Salah Times';

  const desc = document.createElement('p');
  desc.style.cssText = 'margin:0 0 16px;font-size:0.95rem;opacity:0.85;line-height:1.5;';
  desc.textContent = 'Kalamalah needs your location to calculate accurate Salah times for your area. You can say No and enter a city manually instead.';

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';

  const noBtn = document.createElement('button');
  noBtn.id = 'salah-no-btn';
  noBtn.style.cssText = 'padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:inherit;cursor:pointer;';
  noBtn.textContent = 'No, enter city';

  const yesBtn = document.createElement('button');
  yesBtn.id = 'salah-yes-btn';
  yesBtn.style.cssText = 'padding:8px 14px;border-radius:8px;border:none;background:var(--accent,#10b981);color:#fff;font-weight:600;cursor:pointer;';
  yesBtn.textContent = 'Allow Location';

  btnRow.appendChild(noBtn);
  btnRow.appendChild(yesBtn);

  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(btnRow);
  modal.appendChild(card);

  modal.querySelector('#salah-yes-btn')?.addEventListener('click', () => {
    modal.remove();
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const data = await fetchSalahByCoords(pos.coords.latitude, pos.coords.longitude);
        renderSalahTvOverlay(data);
      },
      async () => {
        const city = window.prompt('Location unavailable. Enter your city name (e.g. Makkah, London):');
        if (city) renderSalahTvOverlay(await fetchSalahByCity(city));
      }
    );
  });

  modal.querySelector('#salah-no-btn')?.addEventListener('click', async () => {
    modal.remove();
    const city = window.prompt('Enter your city name for Salah times (e.g. Makkah, Cairo, London):');
    if (city) {
      renderSalahTvOverlay(await fetchSalahByCity(city));
    }
  });

  document.body.appendChild(modal);
}

export function initDualScreenMode(): void {
  const channel = new BroadcastChannel('kalamalah-dual-screen');
  (window as any).__KALAMALAH_DUAL_SCREEN__ = {
    openTvWindow: (url = `${window.location.pathname}?tv=1`) => {
      window.open(url, 'kalamalah_tv', 'width=1280,height=720');
    },
    broadcastAyah: (surah: number, ayah: number, text: string) => {
      channel.postMessage({ type: 'ayah', surah, ayah, text });
    },
    openSalahTvView,
  };
}
