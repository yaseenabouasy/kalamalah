const WEAK_AYAHS_KEY = 'kalamalah_weak_ayahs';

export function maskWordFirstLetter(word: string): string {
  const chars = Array.from(word.trim());
  if (chars.length <= 1) return word;
  // Keep first base letter + any following diacritics, mask the rest
  let firstEnd = 1;
  while (firstEnd < chars.length && /[\u064B-\u065F\u0670]/.test(chars[firstEnd]!)) {
    firstEnd += 1;
  }
  return chars.slice(0, firstEnd).join('') + 'ـ'.repeat(Math.max(1, Math.min(3, chars.length - firstEnd)));
}

export function toggleFirstLetterMode(enabled: boolean): void {
  const words = document.querySelectorAll<HTMLElement>('.aml-word, .quran-word');
  words.forEach((el) => {
    if (enabled) {
      if (!el.dataset.originalText) {
        el.dataset.originalText = el.textContent || '';
      }
      el.textContent = maskWordFirstLetter(el.dataset.originalText);
      el.dataset.hifzMasked = '1';
      el.onclick = () => {
        if (el.dataset.hifzMasked === '1' && el.dataset.originalText) {
          el.textContent = el.dataset.originalText;
          el.dataset.hifzMasked = '0';
        }
      };
    } else if (el.dataset.originalText) {
      el.textContent = el.dataset.originalText;
      delete el.dataset.hifzMasked;
    }
  });
}

export interface WeakAyahRef {
  surah: number;
  ayah: number;
}

export class WeakAyahsTracker {
  private load(): WeakAyahRef[] {
    try {
      const raw = localStorage.getItem(WEAK_AYAHS_KEY);
      return raw ? (JSON.parse(raw) as WeakAyahRef[]) : [];
    } catch {
      return [];
    }
  }

  private save(list: WeakAyahRef[]): void {
    try {
      localStorage.setItem(WEAK_AYAHS_KEY, JSON.stringify(list));
    } catch {}
  }

  public isWeak(surah: number, ayah: number): boolean {
    return this.load().some((item) => item.surah === surah && item.ayah === ayah);
  }

  public toggle(surah: number, ayah: number): boolean {
    const list = this.load();
    const idx = list.findIndex((item) => item.surah === surah && item.ayah === ayah);
    if (idx >= 0) {
      list.splice(idx, 1);
      this.save(list);
      return false;
    }
    list.push({ surah, ayah });
    this.save(list);
    return true;
  }

  public getAll(): WeakAyahRef[] {
    return this.load();
  }
}

export function startTestMeMode(ayahs: { n: number; text: string }[]): void {
  if (!ayahs || ayahs.length < 4) return;
  const startIdx = Math.floor(Math.random() * (ayahs.length - 3));
  const promptAyah = ayahs[startIdx]!;
  const nextThree = ayahs.slice(startIdx + 1, startIdx + 4);
  let revealedCount = 0;

  document.getElementById('kalamalah-testme-modal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'kalamalah-testme-modal';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);padding:16px;';

  const card = document.createElement('div');
  card.style.cssText = 'max-width:560px;width:100%;background:var(--bg-card,#18181b);color:var(--text-primary,#f4f4f5);border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:24px;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
  const title = document.createElement('h3');
  title.style.cssText = 'margin:0;';
  title.textContent = `Hifz Test Me (Ayah ${promptAyah.n})`;
  const closeBtn = document.createElement('button');
  closeBtn.id = 'testme-close';
  closeBtn.style.cssText = 'background:none;border:none;color:inherit;font-size:1.2rem;cursor:pointer;';
  closeBtn.textContent = '✕';
  header.appendChild(title);
  header.appendChild(closeBtn);

  const ayahP = document.createElement('p');
  ayahP.dir = 'rtl';
  ayahP.style.cssText = 'font-size:1.4rem;line-height:2;padding:12px;background:rgba(255,255,255,0.05);border-radius:10px;margin:0 0 16px;';
  ayahP.textContent = promptAyah.text;

  const revealedEl = document.createElement('div');
  revealedEl.id = 'testme-revealed';
  revealedEl.dir = 'rtl';
  revealedEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:16px;font-size:1.25rem;line-height:1.9;';

  const revealBtn = document.createElement('button');
  revealBtn.id = 'testme-reveal-btn';
  revealBtn.style.cssText = 'width:100%;padding:10px;border-radius:10px;border:none;background:var(--accent,#10b981);color:#fff;font-weight:600;cursor:pointer;';
  revealBtn.textContent = 'Reveal Next Ayah (1/3)';

  card.appendChild(header);
  card.appendChild(ayahP);
  card.appendChild(revealedEl);
  card.appendChild(revealBtn);
  overlay.appendChild(card);

  revealBtn.addEventListener('click', () => {
    if (revealedCount < nextThree.length) {
      const a = nextThree[revealedCount]!;
      const p = document.createElement('p');
      p.style.cssText = 'margin:0;padding:10px;background:rgba(16,185,129,0.1);border-radius:8px;';
      p.textContent = `${a.text} (${a.n})`;
      revealedEl.appendChild(p);
      revealedCount += 1;
      revealBtn.textContent =
        revealedCount < nextThree.length
          ? `Reveal Next Ayah (${revealedCount + 1}/3)`
          : 'All 3 Revealed — Close';
    } else {
      overlay.remove();
    }
  });

  overlay.querySelector('#testme-close')?.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

export function initHifzTools(): void {
  (window as any).__KALAMALAH_HIFZ__ = {
    toggleFirstLetterMode,
    weakTracker: new WeakAyahsTracker(),
    startTestMeMode,
  };
}
