export type SleepTimerMode = 'off' | 'minutes' | 'end-of-surah';

export class SleepTimerController {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private fadeIntervalId: ReturnType<typeof setInterval> | null = null;
  private mode: SleepTimerMode = 'off';
  private endTimeMs = 0;

  private getAudioEl(): HTMLAudioElement | null {
    return document.getElementById('kalamalah-audio-el') as HTMLAudioElement | null;
  }

  public startMinutes(minutes: number): void {
    this.clear();
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    this.mode = 'minutes';
    this.endTimeMs = Date.now() + minutes * 60_000;
    this.timerId = setTimeout(() => this.triggerFadeAndPause(), minutes * 60_000);
  }

  public startEndOfSurah(): void {
    this.clear();
    this.mode = 'end-of-surah';
    const audio = this.getAudioEl();
    if (!audio) return;
    const onEnded = () => {
      if (this.mode === 'end-of-surah') {
        audio.pause();
        this.clear();
      }
    };
    audio.addEventListener('ended', onEnded, { once: true });
  }

  public clear(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.fadeIntervalId) {
      clearInterval(this.fadeIntervalId);
      this.fadeIntervalId = null;
    }
    this.mode = 'off';
    this.endTimeMs = 0;
  }

  public getRemainingMs(): number {
    if (this.mode !== 'minutes') return 0;
    return Math.max(0, this.endTimeMs - Date.now());
  }

  public getMode(): SleepTimerMode {
    return this.mode;
  }

  private triggerFadeAndPause(): void {
    const audio = this.getAudioEl();
    if (!audio || audio.paused) {
      this.clear();
      return;
    }
    const startVol = audio.volume;
    const steps = 20;
    let step = 0;
    this.fadeIntervalId = setInterval(() => {
      step += 1;
      audio.volume = Math.max(0, startVol * (1 - step / steps));
      if (step >= steps) {
        audio.pause();
        audio.volume = startVol;
        this.clear();
      }
    }, 100);
  }
}

export function initSleepTimer(): SleepTimerController {
  const controller = new SleepTimerController();
  (window as any).__KALAMALAH_SLEEP_TIMER__ = controller;
  return controller;
}
