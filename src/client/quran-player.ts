// @ts-ignore - Local WebGL dybg engine
import dybg from './dybg.js';
import type { NormalizedSurahTimings } from '../server/timings-service';
import { AmlAyahAnimator } from './aml-ayah-animator';
import { getAmbientMixer } from './ambient-mixer';
import { BackgroundScenes, type SceneId } from './background-scenes';
import { formatLocaleDigits, getActiveLocale, isRtlLocale, t } from './i18n';
import {
  colorizeArabicWordTajweed,
  toggleBookmarkAyah,
  setTajweedContext,
} from './reading-tools';
import { ScrollController } from './scroll-controller';
import { SETTINGS_KEYS, readSetting, writeSetting } from './settings-sheet';
import {
  fetchSurahApi,
  fetchTimingsApi,
  getAvatarProxyOrDirectUrl,
  getDownloadUrl,
  getReciterStaticAudioUrl,
} from './static-api';

export interface BootstrapCatalog {
  surahs: {
    n: number;
    ar: string;
    en: string;
    ay: number;
    rev: string;
    p: number;
    j: number;
  }[];
  reciters: {
    id: number;
    slug: string;
    kSlug?: string;
    qId?: number;
    iolSlug?: string;
    mp3Id?: number;
    ar: string;
    en: string;
    riwayah: string;
    wbw: boolean;
    cc: boolean;
    audioBase: string;
    photo?: string;
  }[];
  tafseers?: { id: number; editionId: string; nameAr: string; authorAr: string }[];
  translations?: { code: string; editionId: string; languageNameAr: string; languageNameEn: string; dir: string }[];
  pageData?: {
    pageType?: string;
    surahNumber?: number;
    surahNameAr?: string;
    surahNameEn?: string;
    initialReciterSlug?: string;
    juz?: number;
    mushafPage?: number;
    ayahs?: { n: number; text: string; tr?: string; taf?: string }[];
    defaultTimings?: NormalizedSurahTimings | null;
  };
}

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
function toArDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)] ?? d);
}

function formatTimeSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export class QuranPlayerController {
  private audioEl: HTMLAudioElement;
  private catalog: BootstrapCatalog;
  private scrollController: ScrollController | null = null;
  private animator = new AmlAyahAnimator();
  private wordAudioEl: HTMLAudioElement | null = null;

  private currentSurahNumber = 1;
  private currentReciterSlug = 'haitham-al-dukhin';
  private currentTimings: NormalizedSurahTimings | null = null;
  private currentAyahsData: { n: number; text: string; tr?: string; taf?: string }[] = [];

  private activeAyahNumber = 1;
  private userManualOffsetMs = 0;
  private systemTimingOffsetMs = 0;

  private get effectiveSyncOffsetMs(): number {
    return this.userManualOffsetMs + this.systemTimingOffsetMs;
  }

  private computeSystemTimingOffset(reciterSlug: string, surahNumber: number): number {
    // Timing offsets are handled per-source in the timing service.
    // Do not apply per-reciter hardcoded offsets here — they cause double-shifting
    // when the timing source already includes its own offset.
    return 0;
  }
  private repeatMode: 'off' | 'surah' | 'ayah' = 'off';
  private speeds = [0.75, 1, 1.25, 1.5, 2];
  private speedIndex = 1;
  private showFullscreenTranslation = true;
  private showFullscreenTajweed = true;
  private showMixer = false;
  private fullscreenBgMode: SceneId = 'islamic';
  private scenes: BackgroundScenes | null = null;
  private showQuranText = true;
  private displayMode: 'default' | 'cinematic' = 'default';
  private cinematicIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private islamicBgIndex = 0;
  private islamicActiveSlot: 'a' | 'b' = 'a';
  private islamicBgTimer: ReturnType<typeof setInterval> | null = null;

  private static readonly ISLAMIC_BACKGROUNDS: string[] = [
    // Kaaba & Masjid al-Haram (Makkah)
    'https://images.unsplash.com/photo-1565552645632-d725f8bfc19a?auto=format&fit=crop&w=1920&q=85',
    // Kaaba Tawaf Night Golden Glow
    'https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?auto=format&fit=crop&w=1920&q=85',
    // Masjid an-Nabawi Green Dome & Umbrellas (Madinah)
    'https://images.unsplash.com/photo-1580418827493-f2b22c0a76cb?auto=format&fit=crop&w=1920&q=85',
    // Grand Mosque Architecture & Courtyards
    'https://images.unsplash.com/photo-1542816417-0983c9c9ad53?auto=format&fit=crop&w=1920&q=85',
    // Makkah Clock Tower & Haram Horizon
    'https://images.unsplash.com/photo-1537181534458-45dcee76ae90?auto=format&fit=crop&w=1920&q=85',
    // Islamic Mosque Dome & Sanctuary Lights
    'https://images.unsplash.com/photo-1519817650390-64a93db51149?auto=format&fit=crop&w=1920&q=85',
  ];

  private rafId: number | null = null;
  private lastFrameTime = performance.now();
  private onReciterExternalChange?: (slug: string) => void;
  private dybgInstance: any = null;
  private lastDybgReciterSlug = '';
  private loadAbortController: AbortController | null = null;
  private wakeLockSentinel: any = null;
  private lastMediaPositionUpdateMs = 0;
  private pendingRestoreTimeSec = 0;
  private pendingSeekTimeSec = -1;
  private lastSavedPlaybackMs = 0;
  private static readonly PLAYBACK_STORAGE_KEY = 'kalamalah_last_playback_v1';

  constructor(catalog: BootstrapCatalog, onReciterExternalChange?: (slug: string) => void) {
    this.catalog = catalog;
    this.onReciterExternalChange = onReciterExternalChange;
    this.audioEl = document.getElementById('kalamalah-audio-el') as HTMLAudioElement;

    // Word audio element for individual word playback
    this.wordAudioEl = new Audio();
    this.wordAudioEl.preload = 'auto';
    this.wordAudioEl.crossOrigin = 'anonymous';

    const amlScrollEl = document.getElementById('aml-scroll-container');
    if (amlScrollEl) {
      this.scrollController = new ScrollController(amlScrollEl);
      let userScrollTimer: ReturnType<typeof setTimeout> | null = null;
      const onUserScroll = () => {
        amlScrollEl.classList.add('HideLineBlur', 'is-user-scrolling');
        this.animator.setUserScrolling(true);
        if (userScrollTimer) clearTimeout(userScrollTimer);
        userScrollTimer = setTimeout(() => {
          amlScrollEl.classList.remove('HideLineBlur', 'is-user-scrolling');
          this.animator.setUserScrolling(false);
        }, 650);
      };
      amlScrollEl.addEventListener('wheel', onUserScroll, { passive: true });
      amlScrollEl.addEventListener('touchmove', onUserScroll, { passive: true });
    }
    const savedBg = readSetting(SETTINGS_KEYS.scene, 'islamic');
    if (['dybg', 'islamic', 'rain', 'forest', 'off'].includes(savedBg)) {
      this.fullscreenBgMode = savedBg as SceneId;
    }
    this.showQuranText = readSetting(SETTINGS_KEYS.quranView, '1') !== '0';
    this.showFullscreenTranslation = readSetting(SETTINGS_KEYS.translation, '1') !== '0';
    this.showFullscreenTajweed = readSetting(SETTINGS_KEYS.tajweed, '0') === '1';
    this.displayMode = readSetting(SETTINGS_KEYS.displayMode, 'default') === 'cinematic' ? 'cinematic' : 'default';

    this.scenes = new BackgroundScenes();
    this.scenes.setMotionAllowed(readSetting(SETTINGS_KEYS.reduceMotion, '0') !== '1');

    const savedQuranVolume = Number(readSetting(SETTINGS_KEYS.quranVolume, '1'));
    this.audioEl.volume = Math.max(0, Math.min(1, Number.isFinite(savedQuranVolume) ? savedQuranVolume : 1));
    const savedAmbientVolume = Number(readSetting(SETTINGS_KEYS.ambientVolume, '0.35'));
    getAmbientMixer().setMasterVolume(
      Math.max(0, Math.min(1, Number.isFinite(savedAmbientVolume) ? savedAmbientVolume : 0.35))
    );
    // Deferred: the dybg WebGL context and the 1920px background images are
    // created on first fullscreen open (see applyFullscreenBgMode), not on every
    // page load. The overlay is hidden at boot, so nothing needs them yet.

    let savedPlayback: {
      surahNumber?: number;
      reciterSlug?: string;
      timeSec?: number;
      ayahNumber?: number;
    } | null = null;
    try {
      const raw = localStorage.getItem(QuranPlayerController.PLAYBACK_STORAGE_KEY);
      if (raw) savedPlayback = JSON.parse(raw);
    } catch {}

    const pd = catalog.pageData;

    // Restore saved reciter unless explicitly overridden by /reader-{surah}-{reciter}
    if (pd?.initialReciterSlug && catalog.reciters.some((r) => r.slug === pd.initialReciterSlug)) {
      this.currentReciterSlug = pd.initialReciterSlug;
      try {
        localStorage.setItem('kalamalah_reciter_slug', pd.initialReciterSlug);
      } catch {}
    } else {
      const savedReciter =
        localStorage.getItem('kalamalah_reciter_slug') || savedPlayback?.reciterSlug;
      if (savedReciter && catalog.reciters.some((r) => r.slug === savedReciter)) {
        this.currentReciterSlug = savedReciter;
      }
    }

    // Restore last listened Surah & exact timestamp when returning (or resuming same Surah)
    if (pd?.pageType === 'surah' && pd?.surahNumber) {
      this.currentSurahNumber = pd.surahNumber;
      if (savedPlayback?.surahNumber === pd.surahNumber && (savedPlayback.timeSec || 0) > 1) {
        this.pendingRestoreTimeSec = savedPlayback.timeSec || 0;
        if (savedPlayback.ayahNumber && savedPlayback.ayahNumber > 1) {
          this.activeAyahNumber = savedPlayback.ayahNumber;
        }
        this.audioEl.preload = 'metadata';
      }
    } else if (
      savedPlayback?.surahNumber &&
      savedPlayback.surahNumber >= 1 &&
      savedPlayback.surahNumber <= 114
    ) {
      this.currentSurahNumber = savedPlayback.surahNumber;
      if ((savedPlayback.timeSec || 0) > 1) {
        this.pendingRestoreTimeSec = savedPlayback.timeSec || 0;
        if (savedPlayback.ayahNumber && savedPlayback.ayahNumber > 1) {
          this.activeAyahNumber = savedPlayback.ayahNumber;
        }
        this.audioEl.preload = 'metadata';
      }
    } else if (pd?.surahNumber) {
      this.currentSurahNumber = pd.surahNumber;
    }

    if (Array.isArray(pd?.ayahs) && pd.ayahs.length > 0) {
      this.currentAyahsData = pd.ayahs;
    }

    this.initMediaSessionHandlers();
    this.bindUIEvents();
    this.loadTrackMetadata(this.currentSurahNumber, this.currentReciterSlug, false);
  }

  public getCurrentReciterSlug(): string {
    return this.currentReciterSlug;
  }

  public getCurrentSurahNumber(): number {
    return this.currentSurahNumber;
  }

  public async setReciter(reciterSlug: string, autoPlay = false): Promise<void> {
    if (!reciterSlug) return;
    const wasPlaying = !this.audioEl.paused;
    const resumeAyah = this.activeAyahNumber > 1 ? this.activeAyahNumber : undefined;
    this.pendingRestoreTimeSec = 0;
    this.currentReciterSlug = reciterSlug;
    try {
      localStorage.setItem('kalamalah_reciter_slug', reciterSlug);
    } catch {}
    this.savePlaybackState(true, this.currentSurahNumber, reciterSlug, resumeAyah || 1, 0);
    this.onReciterExternalChange?.(reciterSlug);

    // Immediately update the bottom player bar with the new reciter so the UI
    // doesn't appear stuck on the old reciter while loadTrackMetadata loads.
    const reciterMeta =
      this.catalog.reciters.find((r) => r.slug === reciterSlug) ?? this.catalog.reciters[0]!;
    const surahMeta =
      this.catalog.surahs.find((s) => s.n === this.currentSurahNumber) ?? this.catalog.surahs[0]!;
    this.updateNowPlayingLabels(surahMeta, reciterMeta);

    await this.loadTrackMetadata(this.currentSurahNumber, reciterSlug, autoPlay || wasPlaying, resumeAyah);
  }

  public async playSurah(surahNumber: number, reciterSlug?: string, startAyah?: number): Promise<void> {
    const targetReciter = reciterSlug || this.currentReciterSlug;
    if (reciterSlug && reciterSlug !== this.currentReciterSlug) {
      this.currentReciterSlug = reciterSlug;
      try {
        localStorage.setItem('kalamalah_reciter_slug', reciterSlug);
      } catch {}
      this.onReciterExternalChange?.(reciterSlug);

      // Immediately update the bottom player bar with the new reciter.
      const reciterMeta =
        this.catalog.reciters.find((r) => r.slug === reciterSlug) ?? this.catalog.reciters[0]!;
      const surahMeta =
        this.catalog.surahs.find((s) => s.n === surahNumber) ?? this.catalog.surahs[0]!;
      this.updateNowPlayingLabels(surahMeta, reciterMeta);
    }
    this.pendingRestoreTimeSec = 0;
    this.savePlaybackState(true, surahNumber, targetReciter, startAyah || 1, 0);

    await this.loadTrackMetadata(surahNumber, targetReciter, true, startAyah);
  }

  private savePlaybackState(
    force = false,
    surahOverride?: number,
    reciterOverride?: string,
    ayahOverride?: number,
    timeOverride?: number
  ): void {
    const now = performance.now();
    if (!force && now - this.lastSavedPlaybackMs < 1500) return;
    if (!force && this.pendingRestoreTimeSec > 0) return;
    this.lastSavedPlaybackMs = now;
    try {
      const payload = {
        surahNumber: surahOverride ?? this.currentSurahNumber,
        reciterSlug: reciterOverride ?? this.currentReciterSlug,
        ayahNumber: ayahOverride ?? this.activeAyahNumber,
        timeSec: timeOverride ?? (this.audioEl.currentTime || 0),
        updatedAt: Date.now(),
      };
      localStorage.setItem(QuranPlayerController.PLAYBACK_STORAGE_KEY, JSON.stringify(payload));
      localStorage.setItem('kalamalah_reciter_slug', payload.reciterSlug);
    } catch {}
  }

  public seekToAyah(ayahNumber: number, autoPlay = true): void {
    this.activeAyahNumber = ayahNumber;
    const locale = getActiveLocale();
    const barAyahLbl = document.getElementById('qp-bar-current-ayah-label');
    if (barAyahLbl) {
      barAyahLbl.textContent = `${t('ayahPrefix', locale)} ${formatLocaleDigits(ayahNumber, locale)}`;
    }
    const seg = this.currentTimings?.ayahs.find((a) => a.ayah === ayahNumber);
    if (seg) {
      this.audioEl.currentTime = Math.max(0, (seg.startMs - this.effectiveSyncOffsetMs) / 1000);
      this.startSyncLoop();
      if (autoPlay && this.audioEl.paused) {
        this.audioEl.play().catch(() => {});
      }
    } else if (autoPlay && this.audioEl.paused) {
      this.audioEl.play().catch(() => {});
    }
  }

  /**
   * Play individual word audio from Quran.com CDN
   * URL format: https://audio.qurancdn.com/wbw/{surah:03d}_{ayah:03d}_{word:03d}.mp3
   * wordIdx is 0-based, we convert to 1-based for the URL
   */
  public playWordAudio(surahNum: number, ayahNum: number, wordIdx: number): void {
    // Pause main surah audio
    if (!this.audioEl.paused) {
      this.audioEl.pause();
    }

    // Stop any currently playing word audio
    if (this.wordAudioEl && !this.wordAudioEl.paused) {
      this.wordAudioEl.pause();
      this.wordAudioEl.currentTime = 0;
    }

    // Build word audio URL (1-based indexing for URL)
    const wordNum = wordIdx + 1;
    const url = `https://audio.qurancdn.com/wbw/${String(surahNum).padStart(3, '0')}_${String(ayahNum).padStart(3, '0')}_${String(wordNum).padStart(3, '0')}.mp3`;

    if (!this.wordAudioEl) {
      this.wordAudioEl = new Audio();
      this.wordAudioEl.preload = 'auto';
      this.wordAudioEl.crossOrigin = 'anonymous';
    }
    this.wordAudioEl.src = url;
    this.wordAudioEl.play().catch((err) => {
      console.warn('[Kalamalah] Word audio playback failed:', err);
    });

    // Show word translation tooltip/popover
    this.showWordTranslation(surahNum, ayahNum, wordIdx);
  }

  /** Show ayah translation for a clicked word (per-word translation data not available) */
  private showWordTranslation(surahNum: number, ayahNum: number, wordIdx: number): void {
    const ayahData = this.currentAyahsData.find((a) => a.n === ayahNum);
    if (!ayahData?.tr) return;

    // Per-word translation data is not available from the current API.
    // Show the full ayah translation with word context instead of wrong word mapping.
    const wordNum = wordIdx + 1;

    // Create or update translation tooltip
    let tooltip = document.getElementById('kalamalah-word-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'kalamalah-word-tooltip';
      tooltip.style.cssText = `
        position: fixed;
        background: var(--bg-card, #1f1f1f);
        color: var(--text-primary, #fff);
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 0.875rem;
        line-height: 1.4;
        z-index: 10000;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.1);
        max-width: 280px;
        transition: opacity 0.15s ease;
      `;
      document.body.appendChild(tooltip);
    }
    tooltip.textContent = `Word ${wordNum}: ${ayahData.tr}`;
    tooltip.style.opacity = '1';

    // Position near the bottom of the screen
    tooltip.style.bottom = '100px';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translateX(-50%)';

    // Auto-hide after 3 seconds
    setTimeout(() => {
      if (tooltip) tooltip.style.opacity = '0';
    }, 3000);
  }

  public setSurahAyahsData(ayahs: { n: number; text: string; tr?: string; taf?: string }[]): void {
    if (!Array.isArray(ayahs) || ayahs.length === 0) return;
    this.currentAyahsData = ayahs;
    if (this.catalog.pageData && this.catalog.pageData.surahNumber === this.currentSurahNumber) {
      this.catalog.pageData.ayahs = ayahs;
    }
    this.renderFullscreenAyahsList();
    this.rebindAnimator();
  }

  private async loadTrackMetadata(
    surahNumber: number,
    reciterSlug: string,
    autoPlay: boolean,
    startAyah?: number
  ): Promise<void> {
    if (this.loadAbortController) {
      this.loadAbortController.abort();
    }
    const abortCtrl = new AbortController();
    this.loadAbortController = abortCtrl;

    this.currentSurahNumber = surahNumber;
    this.activeAyahNumber = startAyah && startAyah > 1 ? startAyah : 1;

    // Preload tajweed annotations from quran.islamonline.net (scholar-reviewed)
    void setTajweedContext(surahNumber, reciterSlug);

    const amlScrollEl = document.getElementById('aml-scroll-container');
    if (amlScrollEl) {
      amlScrollEl.scrollTop = 0;
      amlScrollEl.classList.remove('HideLineBlur', 'is-user-scrolling');
    }
    this.animator.setUserScrolling(false);

    const surahMeta =
      this.catalog.surahs.find((s) => s.n === surahNumber) ?? this.catalog.surahs[0]!;
    const reciterMeta =
      this.catalog.reciters.find((r) => r.slug === reciterSlug) ?? this.catalog.reciters[0]!;

    this.updateNowPlayingLabels(surahMeta, reciterMeta);

    const pageMatchesSurah =
      this.catalog.pageData?.surahNumber === surahNumber &&
      Array.isArray(this.catalog.pageData?.ayahs) &&
      this.catalog.pageData.ayahs.length === surahMeta.ay;

    // Check for pre-embedded word timings in the bootstrap data (static export)
    const embeddedTimings = this.catalog.pageData?.defaultTimings as NormalizedSurahTimings | undefined;

    const [timingsRes, surahRes] = await Promise.all([
      embeddedTimings
        ? Promise.resolve(embeddedTimings)
        : fetchTimingsApi(reciterSlug, surahNumber, this.catalog, abortCtrl.signal).catch(() => null),
      pageMatchesSurah
        ? Promise.resolve({ ayahs: this.catalog.pageData!.ayahs! })
        : fetchSurahApi(surahNumber, 'en.sahih', 'ar.muyassar', this.catalog, abortCtrl.signal).catch(
            () => null
          ),
    ]);

    if (abortCtrl.signal.aborted) return;

    if (surahRes?.ayahs && Array.isArray(surahRes.ayahs)) {
      this.currentAyahsData = surahRes.ayahs;
    }

    this.currentTimings = timingsRes;
    const audioUrl =
      timingsRes?.audioUrl || getReciterStaticAudioUrl(reciterMeta, surahNumber);

    if (this.audioEl.src !== audioUrl) {
      this.audioEl.src = audioUrl;
      this.audioEl.playbackRate = this.speeds[this.speedIndex] ?? 1;
    }

    const syncBadgeEl = document.getElementById('qp-bar-sync-badge');
    const amlSyncPillEl = document.getElementById('aml-sync-mode-pill');
    if (timingsRes?.mode === 'word') {
      if (syncBadgeEl) syncBadgeEl.textContent = 'مزامنة الكلمات WBW';
      if (amlSyncPillEl) amlSyncPillEl.textContent = 'مزامنة دقيقة كلمة بكلمة';
    } else if (timingsRes?.mode === 'ayah') {
      if (syncBadgeEl) syncBadgeEl.textContent = 'مزامنة الآيات CC';
      if (amlSyncPillEl) amlSyncPillEl.textContent = `مزامنة الآيات (${timingsRes.source})`;
    } else {
      if (syncBadgeEl) syncBadgeEl.textContent = 'تلاوة صوتية';
      if (amlSyncPillEl) amlSyncPillEl.textContent = 'تلاوة صوتية متصلة';
    }

    this.renderFullscreenAyahsList();
    this.systemTimingOffsetMs = this.computeSystemTimingOffset(this.currentReciterSlug, surahNumber);

    const fsListEl = document.getElementById('aml-ayahs-list');
    const readerWrapEl =
      this.catalog.pageData?.surahNumber === surahNumber
        ? document.getElementById('surah-ayahs-wrapper')
        : null;

    this.animator.bindTimings(timingsRes?.ayahs ?? [], fsListEl, readerWrapEl);

    if (startAyah && startAyah > 1) {
      const targetSeg = timingsRes?.ayahs.find((a) => a.ayah === startAyah);
      if (targetSeg) {
        const targetSec = Math.max(0, (targetSeg.startMs - this.effectiveSyncOffsetMs) / 1000);
        this.pendingSeekTimeSec = targetSec;
        if (this.audioEl.readyState >= 1) {
          this.audioEl.currentTime = targetSec;
          this.pendingSeekTimeSec = -1;
        }
        this.animator.animate(targetSeg.startMs, 0);
        this.animator.forceAlignActiveLine();
      } else {
        this.pendingSeekTimeSec = -1;
      }
    } else {
      this.pendingSeekTimeSec = -1;
    }

    if (autoPlay) {
      this.audioEl.play().catch(() => {});
    }
  }

  private renderQueuePanel(): void {
    const list = document.getElementById('aml-queue-list');
    if (!list) return;
    if (this.currentAyahsData.length === 0) {
      list.innerHTML = '<p class="aml-empty-msg" style="padding:14px;">لا توجد آيات محمّلة بعد.</p>';
      return;
    }
    const escapeText = (value: string) =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    list.innerHTML = this.currentAyahsData
      .map((ayah) => {
        const snippet = escapeText(ayah.text.trim().slice(0, 70));
        const active = ayah.n === this.activeAyahNumber;
        return `<button type="button" class="aml-queue-item${active ? ' is-active' : ''}" data-queue-ayah="${ayah.n}">
          <span class="aml-queue-num">${toArDigits(ayah.n)}</span>
          <span class="aml-queue-snippet">${snippet}</span>
        </button>`;
      })
      .join('');
    list.querySelector<HTMLElement>('.aml-queue-item.is-active')?.scrollIntoView({ block: 'center' });
  }

  private initDybgCanvas(): void {
    const bgContainer = document.getElementById('dynamic-bg');
    if (!bgContainer) return;
    bgContainer.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.className = 'lyricsflow-dybg-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;';
    bgContainer.appendChild(canvas);
    try {
      this.dybgInstance = new dybg(canvas);
      if (typeof this.dybgInstance.setFlowSpeed === 'function') {
        this.dybgInstance.setFlowSpeed(0.2);
      }
      if (typeof this.dybgInstance.setRenderScale === 'function') {
        this.dybgInstance.setRenderScale(0.25);
      }
      this.dybgInstance.pause?.();
    } catch {
      this.dybgInstance = null;
    }
  }

  private updateDybgArtwork(reciterSlug: string): void {
    if (!this.dybgInstance || this.lastDybgReciterSlug === reciterSlug) return;
    this.lastDybgReciterSlug = reciterSlug;
    const reciterMeta =
      this.catalog.reciters.find((r) => r.slug === reciterSlug) ?? this.catalog.reciters[0]!;
    const avatarUrl = getAvatarProxyOrDirectUrl(reciterMeta);
    try {
      this.dybgInstance.setAlbum?.(avatarUrl, false);
    } catch {}
  }

  private updateNowPlayingLabels(
    surah: BootstrapCatalog['surahs'][number],
    reciter: BootstrapCatalog['reciters'][number]
  ): void {
    const locale = getActiveLocale();
    const isRtl = isRtlLocale(locale);
    const d = (n: number | string) => formatLocaleDigits(n, locale);
    const setTxt = (id: string, text: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    const kSlug = reciter.kSlug || reciter.slug;
    const reciterPhotoUrl =
      reciter.photo || `https://api.kalamalah.com/api/reciter-profile/${kSlug}`;

    const barImg = document.getElementById('qp-bar-reciter-img') as HTMLImageElement | null;
    if (barImg && barImg.src !== reciterPhotoUrl) {
      barImg.src = reciterPhotoUrl;
      barImg.alt = isRtl ? reciter.ar : reciter.en;
    }

    const amlImg = document.getElementById('aml-reciter-art-img') as HTMLImageElement | null;
    if (amlImg && amlImg.src !== reciterPhotoUrl) {
      amlImg.src = reciterPhotoUrl;
      amlImg.alt = isRtl ? reciter.ar : reciter.en;
    }

    this.updateDybgArtwork(reciter.slug);

    const surahTitle = isRtl
      ? `${t('surahPrefix', locale)} ${surah.ar}`
      : `${t('surahPrefix', locale)} ${surah.en} (${surah.ar})`;
    const reciterName = isRtl ? reciter.ar : reciter.en;
    const revLabel = surah.rev === 'مكية' ? t('filterMeccan', locale) : t('filterMedinan', locale);

    setTxt('qp-bar-surah-num', d(surah.n));
    setTxt('qp-bar-surah-title', surahTitle);
    setTxt('qp-bar-reciter-name', reciterName);
    setTxt('qp-bar-current-ayah-label', `${t('ayahPrefix', locale)} ${d(this.activeAyahNumber)}`);
    const recLink = document.getElementById('qp-bar-reciter-name') as HTMLAnchorElement | null;
    if (recLink) recLink.href = `/reciter-${reciter.slug}`;

    setTxt('aml-art-surah-name', `سورة ${surah.ar}`);
    setTxt(
      'aml-art-surah-meta',
      `${revLabel} · ${d(surah.ay)} ${t('ayahsUnit', locale)} · ${t('juzPrefix', locale)} ${d(surah.j)}`
    );
    setTxt('aml-now-surah-title', `${t('surahPrefix', locale)} ${surah.ar} (${surah.en})`);
    setTxt('aml-revelation-badge', revLabel);
    setTxt('aml-now-reciter-link', `${t('reciterPrefix', locale)} ${reciterName}`);
    const amlRecLink = document.getElementById('aml-now-reciter-link') as HTMLAnchorElement | null;
    if (amlRecLink) amlRecLink.href = `/reciter-${reciter.slug}`;

    // Fullscreen track info (music-player style, shown when Quran view is off)
    setTxt('aml-fs-surah-title', `سورة ${surah.ar}`);
    setTxt('aml-fs-reciter-name', reciterName);
    setTxt('aml-fs-ayah-label', `${t('ayahPrefix', locale)} ${d(this.activeAyahNumber)}`);

    setTxt('aml-head-surah', `سورة ${surah.ar}`);
    setTxt('aml-head-reciter', `${t('reciterPrefix', locale)} ${reciterName}`);
    const headRecLink = document.getElementById('aml-head-reciter') as HTMLAnchorElement | null;
    if (headRecLink) headRecLink.href = `/reciter-${reciter.slug}`;

    const headAvatar = document.getElementById('aml-head-avatar') as HTMLImageElement | null;
    if (headAvatar && headAvatar.src !== reciterPhotoUrl) {
      headAvatar.src = reciterPhotoUrl;
      headAvatar.alt = reciterName;
    }
    const vinylArt = document.getElementById('aml-vinyl-art') as HTMLImageElement | null;
    if (vinylArt && vinylArt.src !== reciterPhotoUrl) {
      vinylArt.src = reciterPhotoUrl;
      vinylArt.alt = reciterName;
    }

    const dlHref = getDownloadUrl(reciter, surah.n);
    const qpDlBtn = document.getElementById('qp-download-surah-btn') as HTMLAnchorElement | null;
    if (qpDlBtn) qpDlBtn.href = dlHref;
    const amlDlBtn = document.getElementById('aml-download-surah-btn') as HTMLAnchorElement | null;
    if (amlDlBtn) amlDlBtn.href = dlHref;
    const surahHeroDlBtn = document.getElementById('surah-download-btn') as HTMLAnchorElement | null;
    if (surahHeroDlBtn && this.catalog.pageData?.surahNumber === surah.n) {
      surahHeroDlBtn.href = dlHref;
    }

    this.updateMediaSessionMetadata();
  }

  private initMediaSessionHandlers(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const safeSetHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {}
    };

    safeSetHandler('play', () => {
      if (!this.audioEl.src) {
        this.loadTrackMetadata(this.currentSurahNumber, this.currentReciterSlug, true);
      } else {
        this.audioEl.play().catch(() => {});
      }
      navigator.mediaSession.playbackState = 'playing';
      this.updateMediaSessionPositionState();
    });
    safeSetHandler('pause', () => {
      this.audioEl.pause();
      navigator.mediaSession.playbackState = 'paused';
      this.updateMediaSessionPositionState();
    });
    safeSetHandler('stop', () => {
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
      navigator.mediaSession.playbackState = 'none';
      this.updateMediaSessionPositionState();
      this.startSyncLoop();
    });
    safeSetHandler('previoustrack', () => {
      if (this.activeAyahNumber > 1) {
        this.seekToAyah(this.activeAyahNumber - 1, !this.audioEl.paused);
      } else if (this.currentSurahNumber > 1) {
        this.playSurah(this.currentSurahNumber - 1);
      } else {
        this.audioEl.currentTime = 0;
        this.startSyncLoop();
      }
      this.updateMediaSessionPositionState();
    });
    safeSetHandler('nexttrack', () => {
      const surahMeta = this.catalog.surahs.find((s) => s.n === this.currentSurahNumber);
      const maxAyah = surahMeta?.ay ?? this.currentAyahsData.length;
      if (maxAyah > 0 && this.activeAyahNumber < maxAyah) {
        this.seekToAyah(this.activeAyahNumber + 1, !this.audioEl.paused);
      } else if (this.currentSurahNumber < 114) {
        this.playSurah(this.currentSurahNumber + 1);
      }
      this.updateMediaSessionPositionState();
    });
    safeSetHandler('seekbackward', (details) => {
      const offset = details.seekOffset || 10;
      this.audioEl.currentTime = Math.max(0, (this.audioEl.currentTime || 0) - offset);
      this.updateMediaSessionPositionState();
      this.startSyncLoop();
    });
    safeSetHandler('seekforward', (details) => {
      const offset = details.seekOffset || 10;
      const dur = Number.isFinite(this.audioEl.duration) ? this.audioEl.duration : Infinity;
      this.audioEl.currentTime = Math.min(dur, (this.audioEl.currentTime || 0) + offset);
      this.updateMediaSessionPositionState();
      this.startSyncLoop();
    });
    safeSetHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number' && Number.isFinite(details.seekTime)) {
        const dur = Number.isFinite(this.audioEl.duration) ? this.audioEl.duration : details.seekTime;
        this.audioEl.currentTime = Math.max(0, Math.min(dur, details.seekTime));
        this.updateMediaSessionPositionState();
        this.startSyncLoop();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (!this.audioEl.paused) {
          this.requestWakeLock();
          this.startSyncLoop();
        }
        this.animator.forceAlignActiveLine();
      }
    });
  }

  private updateMediaSessionMetadata(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') {
      return;
    }
    const locale = getActiveLocale();
    const isRtl = isRtlLocale(locale);

    const surah =
      this.catalog.surahs.find((s) => s.n === this.currentSurahNumber) ?? this.catalog.surahs[0];
    const reciter =
      this.catalog.reciters.find((r) => r.slug === this.currentReciterSlug) ??
      this.catalog.reciters[0];
    if (!surah || !reciter) return;

    const surahTitle = isRtl
      ? `${t('surahPrefix', locale)} ${surah.ar}`
      : `${t('surahPrefix', locale)} ${surah.en}`;
    const artistLabel = isRtl ? reciter.ar : reciter.en;
    const albumLabel = t('appTitle', locale);
    const avatarUrl = getAvatarProxyOrDirectUrl(reciter);
    const absoluteAvatarUrl = avatarUrl.startsWith('http')
      ? avatarUrl
      : `${window.location.origin}${avatarUrl}`;
    const fallbackLogo = `${window.location.origin}/images/logo.jpg`;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: surahTitle,
        artist: artistLabel,
        album: albumLabel,
        artwork: [
          { src: absoluteAvatarUrl, sizes: '512x512', type: 'image/jpeg' },
          { src: fallbackLogo, sizes: '512x512', type: 'image/jpeg' },
        ],
      });
    } catch {}
  }

  private updateMediaSessionPositionState(): void {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      typeof navigator.mediaSession.setPositionState !== 'function'
    ) {
      return;
    }
    const dur = this.audioEl.duration;
    const pos = this.audioEl.currentTime || 0;
    if (!Number.isFinite(dur) || dur <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: dur,
        playbackRate: this.audioEl.playbackRate || 1,
        position: Math.max(0, Math.min(pos, dur)),
      });
    } catch {}
  }

  private async requestWakeLock(): Promise<void> {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    if (this.wakeLockSentinel) return;
    try {
      this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      this.wakeLockSentinel?.addEventListener?.('release', () => {
        this.wakeLockSentinel = null;
      });
    } catch {}
  }

  private releaseWakeLock(): void {
    if (this.wakeLockSentinel) {
      this.wakeLockSentinel.release?.().catch?.(() => {});
      this.wakeLockSentinel = null;
    }
  }

  private renderFullscreenAyahsList(): void {
    const listEl = document.getElementById('aml-ayahs-list');
    if (!listEl) return;

    if (this.currentAyahsData.length === 0) {
      listEl.innerHTML = `<p class="aml-empty-msg">جاري تحميل آيات السورة...</p>`;
      return;
    }

    const timingByAyah = new Map(
      (this.currentTimings?.ayahs ?? []).map((seg) => [seg.ayah, seg])
    );

    listEl.innerHTML = this.currentAyahsData
      .map((a) => {
        const seg = timingByAyah.get(a.n);
        const startMs = seg?.startMs ?? 0;
        const tokens = a.text.trim().split(/\s+/);
        let spokenIdx = 0;
        const wordsHtml = tokens
          .map((tok) => {
            const isSpoken = /[\u0621-\u064A\u066E-\u06D3\u06FA-\u06FF]/.test(tok);
            const escaped = tok.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            if (!isSpoken) {
              return `<span class="aml-waqf">${escaped}</span>`;
            }
            const idx = spokenIdx++;
            const wSeg = seg?.words?.find((ws) => ws.wordIndex === idx);
            const wStart = wSeg ? wSeg.startMs : startMs;
            const inner = this.showFullscreenTajweed
              ? colorizeArabicWordTajweed(tok, 'alquran')
              : escaped;
            return `<span class="aml-word" data-seek-ms="${wStart}" data-word-idx="${idx}">${inner}</span>`;
          })
          .join(' ');

        const transHtml =
          this.showFullscreenTranslation && a.tr
            ? `<p class="aml-ayah-translation" dir="ltr">${a.tr.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`
            : '';

        return `<div class="aml-ayah-line line rtl NotSung" data-ayah="${a.n}" data-seek-ms="${startMs}">
          <div class="aml-ayah-arabic quran-reading-text" dir="rtl">
            ${wordsHtml}
            <span class="aml-ayah-num-end">﴿${toArDigits(a.n)}﴾</span>
          </div>
          ${transHtml}
        </div>`;
      })
      .join('\n');
  }

  private startSyncLoop(): void {
    if (this.rafId !== null) return;
    this.lastFrameTime = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000);
      this.lastFrameTime = now;

      const currentTimeSec = this.audioEl.currentTime || 0;
      const durationSec = this.audioEl.duration || 0;
      const effectiveTimeMs = currentTimeSec * 1000 + this.effectiveSyncOffsetMs;

      if (durationSec > 0) {
        const pct = Math.max(0, Math.min(100, (currentTimeSec / durationSec) * 100));
        const barFill = document.getElementById('qp-bar-progress-fill');
        const amlFill = document.getElementById('aml-scrubber-fill');
        if (barFill) barFill.style.width = `${pct.toFixed(2)}%`;
        if (amlFill) amlFill.style.width = `${pct.toFixed(2)}%`;

        const curTimeEl = document.getElementById('qp-current-time');
        const totTimeEl = document.getElementById('qp-total-duration');
        const amlCurEl = document.getElementById('aml-current-time');
        const amlRemEl = document.getElementById('aml-remaining-time');
        if (curTimeEl) curTimeEl.textContent = formatTimeSec(currentTimeSec);
        if (totTimeEl) totTimeEl.textContent = formatTimeSec(durationSec);
        if (amlCurEl) amlCurEl.textContent = formatTimeSec(currentTimeSec);
        if (amlRemEl) amlRemEl.textContent = `-${formatTimeSec(Math.max(0, durationSec - currentTimeSec))}`;
      }

      if (this.repeatMode === 'ayah' && this.currentTimings) {
        const activeSeg = this.currentTimings.ayahs.find((a) => a.ayah === this.activeAyahNumber);
        if (activeSeg && effectiveTimeMs >= activeSeg.endMs) {
          this.audioEl.currentTime = Math.max(0, (activeSeg.startMs - this.effectiveSyncOffsetMs) / 1000);
        }
      }

      const prevActive = this.activeAyahNumber;
      const { activeAyah, activeFullscreenEl, activeReaderEl } = this.animator.animate(
        effectiveTimeMs,
        dt
      );

      if (activeAyah > 0 && activeAyah !== prevActive) {
        this.activeAyahNumber = activeAyah;
        const barAyahLbl = document.getElementById('qp-bar-current-ayah-label');
        const locale = getActiveLocale();
        if (barAyahLbl) {
          barAyahLbl.textContent = `${t('ayahPrefix', locale)} ${formatLocaleDigits(activeAyah, locale)}`;
        }
        this.updateMediaSessionMetadata();
        this.updateMediaSessionPositionState();

        const fsOverlay = document.getElementById('aml-fullscreen-player');
        if (activeReaderEl && fsOverlay?.classList.contains('hidden')) {
          const rect = activeReaderEl.getBoundingClientRect();
          const dist = Math.abs(rect.top - window.innerHeight * 0.4);
          activeReaderEl.scrollIntoView({
            behavior: dist > window.innerHeight * 1.4 ? 'auto' : 'smooth',
            block: 'center',
          });
        }
      }

      if (!this.audioEl.paused) {
        this.rafId = requestAnimationFrame(step);
      } else {
        this.rafId = null;
      }
    };

    this.rafId = requestAnimationFrame(step);
  }

  private setAudioLoading(isLoading: boolean): void {
    document.querySelectorAll('#qp-play-toggle-btn, #aml-play-btn, #hero-play-btn').forEach((btn) => {
      btn.classList.toggle('is-loading', isLoading);
    });
  }

  private updatePlayPauseIcons(isPlaying: boolean): void {
    document.querySelectorAll('#qp-play-toggle-btn').forEach((btn) => {
      btn.querySelector('.icon-play')?.classList.toggle('hidden', isPlaying);
      btn.querySelector('.icon-pause')?.classList.toggle('hidden', !isPlaying);
    });
    // AeroUI play button: use setPlayerIcon for animated swap
    const amlPlayBtn = document.getElementById('aml-play-btn');
    if (amlPlayBtn && (window as any).setPlayerIcon) {
      (window as any).setPlayerIcon(amlPlayBtn, isPlaying ? 'pause' : 'play');
    }
    const artCard = document.getElementById('aml-artwork-card');
    artCard?.classList.toggle('is-playing', isPlaying);
    artCard?.classList.toggle('paused', !isPlaying);
    artCard?.classList.toggle('is-paused', !isPlaying);

    if (isPlaying && this.fullscreenBgMode === 'dybg') {
      this.dybgInstance?.resume?.();
    } else {
      this.dybgInstance?.pause?.();
    }

    this.scenes?.setPlaying(isPlaying);
    document.getElementById('aml-vinyl-stage')?.classList.toggle('is-spinning', isPlaying);
    if (isPlaying) {
      this.scheduleCinematicIdle();
    } else {
      this.clearCinematicTimer();
    }
  }

  private static readonly SCENE_LABELS: Record<SceneId, string> = {
    islamic: 'الخلفية: الكعبة والحرمين',
    rain: 'الخلفية: مطر',
    forest: 'الخلفية: غابة',
    dybg: 'الخلفية: ديناميكية',
    off: 'الخلفية: بدون',
  };

  public setSceneMode(mode: SceneId, persist = true): void {
    this.fullscreenBgMode = mode;
    if (persist) writeSetting(SETTINGS_KEYS.scene, mode);
    this.applyFullscreenBgMode();
  }

  private syncAmbientBed(): void {
    const mixer = getAmbientMixer();
    const track =
      this.fullscreenBgMode === 'rain' ? 'rain' : this.fullscreenBgMode === 'forest' ? 'forest' : null;
    const fsOverlay = document.getElementById('aml-fullscreen-player');
    const isFsOpen = fsOverlay ? !fsOverlay.classList.contains('hidden') : false;
    mixer.playOnly(track && isFsOpen ? track : null);
  }

  private applyFullscreenBgMode(): void {
    const dybgEl = document.getElementById('dynamic-bg');
    const islamicEl = document.getElementById('aml-islamic-bg');
    const modeBtn = document.getElementById('aml-bg-mode-btn');
    const modeLabel = document.getElementById('aml-bg-mode-label');
    const nextBtn = document.getElementById('aml-bg-next-btn');
    const fsOverlay = document.getElementById('aml-fullscreen-player');
    const isFsOpen = fsOverlay ? !fsOverlay.classList.contains('hidden') : false;
    const mode = this.fullscreenBgMode;

    dybgEl?.classList.toggle('hidden', mode !== 'dybg');
    islamicEl?.classList.toggle('hidden', mode !== 'islamic');
    this.scenes?.setScene(mode);

    if (modeBtn) {
      modeBtn.setAttribute('data-scene', mode);
      modeBtn.setAttribute('aria-expanded', 'false');
    }
    if (modeLabel) modeLabel.textContent = QuranPlayerController.SCENE_LABELS[mode];
    nextBtn?.classList.toggle('hidden', mode !== 'islamic');

    document.querySelectorAll<HTMLElement>('#aml-scene-menu [data-scene]').forEach((opt) => {
      const active = opt.getAttribute('data-scene') === mode;
      opt.classList.toggle('is-active', active);
      opt.setAttribute('aria-checked', String(active));
    });

    if (mode !== 'dybg') this.dybgInstance?.pause?.();
    if (mode !== 'islamic') this.stopIslamicBgRotator();

    if (mode === 'dybg') {
      if (!this.dybgInstance) this.initDybgCanvas();
      if (isFsOpen || !this.audioEl.paused) {
        this.dybgInstance?.resume?.();
      }
    } else if (mode === 'islamic') {
      this.showIslamicBackgroundSlide(this.islamicBgIndex, true);
      if (isFsOpen) {
        this.startIslamicBgRotator();
      }
    }

    this.syncAmbientBed();
    this.scenes?.setPlaying(isFsOpen && !this.audioEl.paused);
  }

  private applyQuranView(): void {
    const fsOverlay = document.getElementById('aml-fullscreen-player');
    if (!fsOverlay) return;
    fsOverlay.classList.toggle('quran-view-off', !this.showQuranText);
    const viewBtn = document.getElementById('aml-quran-view-btn');
    if (viewBtn) {
      viewBtn.setAttribute('aria-pressed', String(this.showQuranText));
      viewBtn.classList.toggle('active', this.showQuranText);
    }
  }

  private applyDisplayMode(): void {
    const fsOverlay = document.getElementById('aml-fullscreen-player');
    if (!fsOverlay) return;
    const cinematic = this.displayMode === 'cinematic';
    fsOverlay.classList.toggle('cinematic-mode', cinematic);
    if (!cinematic) {
      this.clearCinematicTimer();
      fsOverlay.classList.remove('hud-hidden');
      const hudToggleBtn = document.getElementById('aml-toggle-hud-btn');
      hudToggleBtn?.setAttribute('aria-pressed', 'false');
      hudToggleBtn?.querySelector('.icon-hud-hide')?.classList.remove('hidden');
      hudToggleBtn?.querySelector('.icon-hud-show')?.classList.add('hidden');
    } else if (!this.audioEl.paused) {
      this.scheduleCinematicIdle();
    }
  }

  private clearCinematicTimer(): void {
    if (this.cinematicIdleTimer) {
      clearTimeout(this.cinematicIdleTimer);
      this.cinematicIdleTimer = null;
    }
  }

  private scheduleCinematicIdle(): void {
    this.clearCinematicTimer();
    if (this.displayMode !== 'cinematic') return;
    const fsOverlay = document.getElementById('aml-fullscreen-player');
    if (!fsOverlay || fsOverlay.classList.contains('hidden')) return;
    this.cinematicIdleTimer = setTimeout(() => {
      if (this.audioEl.paused) return;
      fsOverlay.classList.add('hud-hidden');
      const hudToggleBtn = document.getElementById('aml-toggle-hud-btn');
      hudToggleBtn?.setAttribute('aria-pressed', 'true');
      hudToggleBtn?.querySelector('.icon-hud-hide')?.classList.add('hidden');
      hudToggleBtn?.querySelector('.icon-hud-show')?.classList.remove('hidden');
    }, 4200);
  }

  private wakeCinematicChrome(): void {
    if (this.displayMode !== 'cinematic') return;
    const fsOverlay = document.getElementById('aml-fullscreen-player');
    if (!fsOverlay) return;
    fsOverlay.classList.remove('hud-hidden');
    const hudToggleBtn = document.getElementById('aml-toggle-hud-btn');
    hudToggleBtn?.setAttribute('aria-pressed', 'false');
    hudToggleBtn?.querySelector('.icon-hud-hide')?.classList.remove('hidden');
    hudToggleBtn?.querySelector('.icon-hud-show')?.classList.add('hidden');
    this.scheduleCinematicIdle();
  }

  private showIslamicBackgroundSlide(index: number, immediate = false): void {
    const urls = QuranPlayerController.ISLAMIC_BACKGROUNDS;
    if (urls.length === 0) return;
    const normalizedIdx = ((index % urls.length) + urls.length) % urls.length;
    this.islamicBgIndex = normalizedIdx;
    const targetUrl = urls[normalizedIdx]!;

    const slideA = document.getElementById('aml-bg-slide-a');
    const slideB = document.getElementById('aml-bg-slide-b');
    if (!slideA || !slideB) return;

    const commitSlide = (url: string) => {
      if (immediate) {
        this.islamicActiveSlot = 'a';
        slideA.style.backgroundImage = `url("${url}")`;
        slideA.classList.add('is-visible', 'kb-pan-a');
        slideB.classList.remove('is-visible', 'kb-pan-b');
        return;
      }

      if (this.islamicActiveSlot === 'a') {
        this.islamicActiveSlot = 'b';
        slideB.style.backgroundImage = `url("${url}")`;
        slideB.classList.remove('kb-pan-b');
        void slideB.offsetWidth;
        slideB.classList.add('is-visible', 'kb-pan-b');
        slideA.classList.remove('is-visible');
      } else {
        this.islamicActiveSlot = 'a';
        slideA.style.backgroundImage = `url("${url}")`;
        slideA.classList.remove('kb-pan-a');
        void slideA.offsetWidth;
        slideA.classList.add('is-visible', 'kb-pan-a');
        slideB.classList.remove('is-visible');
      }
    };

    const preload = new Image();
    preload.onload = () => commitSlide(targetUrl);
    preload.onerror = () => commitSlide('/images/logo.jpg');
    preload.src = targetUrl;

    // Preload next slide in background for zero-latency crossfade
    const nextUrl = urls[(normalizedIdx + 1) % urls.length];
    if (nextUrl) {
      const nextImg = new Image();
      nextImg.src = nextUrl;
    }
  }

  private startIslamicBgRotator(): void {
    this.stopIslamicBgRotator();
    if (this.fullscreenBgMode !== 'islamic') return;
    this.islamicBgTimer = setInterval(() => {
      this.showIslamicBackgroundSlide(this.islamicBgIndex + 1, false);
    }, 12000);
  }

  private stopIslamicBgRotator(): void {
    if (this.islamicBgTimer) {
      clearInterval(this.islamicBgTimer);
      this.islamicBgTimer = null;
    }
  }

  private bindUIEvents(): void {
    this.audioEl.addEventListener('play', () => {
      if (this.pendingRestoreTimeSec > 0 && Number.isFinite(this.audioEl.duration) && this.audioEl.duration > 1) {
        this.audioEl.currentTime = Math.min(this.pendingRestoreTimeSec, Math.max(0, this.audioEl.duration - 1));
        this.pendingRestoreTimeSec = 0;
      }
      this.updatePlayPauseIcons(true);
      this.startSyncLoop();
      this.requestWakeLock();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
      this.updateMediaSessionMetadata();
      this.updateMediaSessionPositionState();
      this.savePlaybackState(true);
    });

    this.audioEl.addEventListener('pause', () => {
      this.updatePlayPauseIcons(false);
      this.releaseWakeLock();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
      this.updateMediaSessionPositionState();
      this.savePlaybackState(true);
    });

    this.audioEl.addEventListener('loadstart', () => this.setAudioLoading(true));
    this.audioEl.addEventListener('waiting', () => this.setAudioLoading(true));
    this.audioEl.addEventListener('canplay', () => this.setAudioLoading(false));
    this.audioEl.addEventListener('playing', () => this.setAudioLoading(false));
    this.audioEl.addEventListener('pause', () => this.setAudioLoading(false));
    this.audioEl.addEventListener('ended', () => this.setAudioLoading(false));
    this.audioEl.addEventListener('error', () => this.setAudioLoading(false));

    this.audioEl.addEventListener('loadedmetadata', () => {
      const dur = this.audioEl.duration || 0;
      const seekTarget =
        this.pendingSeekTimeSec >= 0
          ? this.pendingSeekTimeSec
          : this.pendingRestoreTimeSec > 0
            ? this.pendingRestoreTimeSec
            : -1;
      if (seekTarget >= 0 && Number.isFinite(dur) && dur > 1) {
        const target = Math.min(seekTarget, Math.max(0, dur - 1));
        this.audioEl.currentTime = target;
        this.pendingSeekTimeSec = -1;
        this.pendingRestoreTimeSec = 0;
        const pct = Math.max(0, Math.min(100, (target / dur) * 100));
        const barFill = document.getElementById('qp-bar-progress-fill');
        const amlFill = document.getElementById('aml-scrubber-fill');
        if (barFill) barFill.style.width = `${pct.toFixed(2)}%`;
        if (amlFill) amlFill.style.width = `${pct.toFixed(2)}%`;
        const curTimeEl = document.getElementById('qp-current-time');
        const amlCurEl = document.getElementById('aml-current-time');
        if (curTimeEl) curTimeEl.textContent = formatTimeSec(target);
        if (amlCurEl) amlCurEl.textContent = formatTimeSec(target);
        this.animator.animate(target * 1000 + this.effectiveSyncOffsetMs, 0);
        this.animator.forceAlignActiveLine();
      }
      const curSec = this.audioEl.currentTime || 0;
      const totEl = document.getElementById('qp-total-duration');
      const remEl = document.getElementById('aml-remaining-time');
      if (totEl) totEl.textContent = formatTimeSec(dur);
      if (remEl) remEl.textContent = `-${formatTimeSec(Math.max(0, dur - curSec))}`;
      this.updateMediaSessionMetadata();
      this.updateMediaSessionPositionState();
    });

    this.audioEl.addEventListener('seeked', () => {
      this.updateMediaSessionPositionState();
      this.savePlaybackState(true);
    });

    window.addEventListener('beforeunload', () => {
      this.savePlaybackState(true);
    });

    this.audioEl.addEventListener('ratechange', () => {
      this.updateMediaSessionPositionState();
    });

    // Background / locked-screen fallback when requestAnimationFrame is throttled by the OS
    this.audioEl.addEventListener('timeupdate', () => {
      this.savePlaybackState(false);
      const now = performance.now();
      if (now - this.lastMediaPositionUpdateMs > 1000) {
        this.lastMediaPositionUpdateMs = now;
        this.updateMediaSessionPositionState();
      }
      if (document.hidden && this.currentTimings) {
        const effectiveTimeMs = (this.audioEl.currentTime || 0) * 1000 + this.effectiveSyncOffsetMs;
        if (this.repeatMode === 'ayah') {
          const activeSeg = this.currentTimings.ayahs.find((a) => a.ayah === this.activeAyahNumber);
          if (activeSeg && effectiveTimeMs >= activeSeg.endMs) {
            this.audioEl.currentTime = Math.max(0, (activeSeg.startMs - this.effectiveSyncOffsetMs) / 1000);
            return;
          }
        }
        const curSeg = this.currentTimings.ayahs.find(
          (a) => effectiveTimeMs >= a.startMs && effectiveTimeMs <= a.endMs
        );
        if (curSeg && curSeg.ayah !== this.activeAyahNumber) {
          this.activeAyahNumber = curSeg.ayah;
          const barAyahLbl = document.getElementById('qp-bar-current-ayah-label');
          const fsAyahLbl = document.getElementById('aml-fs-ayah-label');
          const locale = getActiveLocale();
          const ayahText = `${t('ayahPrefix', locale)} ${formatLocaleDigits(curSeg.ayah, locale)}`;
          if (barAyahLbl) barAyahLbl.textContent = ayahText;
          if (fsAyahLbl) fsAyahLbl.textContent = ayahText;
          this.updateMediaSessionMetadata();
        }
      }
    });

    this.audioEl.addEventListener('ended', () => {
      this.updatePlayPauseIcons(false);
      this.releaseWakeLock();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
      if (this.repeatMode === 'surah') {
        this.audioEl.currentTime = 0;
        this.audioEl.play().catch(() => {});
      } else if (this.currentSurahNumber < 114) {
        this.playSurah(this.currentSurahNumber + 1);
      }
    });

    const togglePlay = () => {
      if (this.audioEl.paused) {
        this.audioEl.play().catch(() => {});
      } else {
        this.audioEl.pause();
      }
    };
    document.getElementById('qp-play-toggle-btn')?.addEventListener('click', togglePlay);
    // AeroUI play button: listen for pressend event
    const amlPlayBtn = document.getElementById('aml-play-btn');
    amlPlayBtn?.addEventListener('pressend', togglePlay);

    const stepAyah = (delta: -1 | 1) => {
      const target = Math.max(1, this.activeAyahNumber + delta);
      this.seekToAyah(target, true);
    };
    document.getElementById('qp-prev-ayah-btn')?.addEventListener('click', () => stepAyah(-1));
    document.getElementById('qp-next-ayah-btn')?.addEventListener('click', () => stepAyah(1));
    // AeroUI prev/next: listen for pressend, trigger skip animation
    const prevBtn = document.getElementById('aml-prev-btn');
    const nextBtn = document.getElementById('aml-next-btn');
    const prevSkip = prevBtn?.querySelector('.aero-skip');
    const nextSkip = nextBtn?.querySelector('.aero-skip');
    prevBtn?.addEventListener('pressend', () => {
      if (prevSkip) (window as any).playSkip?.(prevSkip, { bouncing: true });
      stepAyah(-1);
    });
    nextBtn?.addEventListener('pressend', () => {
      if (nextSkip) (window as any).playSkip?.(nextSkip, { bouncing: true });
      stepAyah(1);
    });

    const cycleSpeed = () => {
      this.speedIndex = (this.speedIndex + 1) % this.speeds.length;
      const spd = this.speeds[this.speedIndex] ?? 1;
      this.audioEl.playbackRate = spd;
      const label = `${spd}x`;
      const b1 = document.getElementById('qp-speed-btn');
      const b2 = document.getElementById('aml-speed-cycle-btn');
      if (b1) b1.textContent = label;
      if (b2) b2.textContent = label;
    };
    document.getElementById('qp-speed-btn')?.addEventListener('click', cycleSpeed);
    document.getElementById('aml-speed-cycle-btn')?.addEventListener('click', cycleSpeed);

    const cycleRepeat = () => {
      if (this.repeatMode === 'off') this.repeatMode = 'surah';
      else if (this.repeatMode === 'surah') this.repeatMode = 'ayah';
      else this.repeatMode = 'off';

      const qpRep = document.getElementById('qp-repeat-btn');
      const amlRep = document.getElementById('aml-repeat-btn');
      const qpIcon = document.getElementById('qp-repeat-icon') as HTMLImageElement | null;
      const amlIcon = document.getElementById('aml-repeat-icon') as HTMLImageElement | null;

      const iconPath =
        this.repeatMode === 'ayah'
          ? '/icons/being-repeat1.svg'
          : this.repeatMode === 'surah'
            ? '/icons/being-repeat.svg'
            : '/icons/repeat.svg';

      if (qpIcon) qpIcon.src = iconPath;
      if (amlIcon) amlIcon.src = iconPath;
      qpRep?.classList.toggle('active', this.repeatMode !== 'off');
      amlRep?.classList.toggle('active', this.repeatMode !== 'off');
    };
    document.getElementById('qp-repeat-btn')?.addEventListener('click', cycleRepeat);
    document.getElementById('aml-repeat-btn')?.addEventListener('click', cycleRepeat);

    const bindScrubber = (scrubberId: string) => {
      const el = document.getElementById(scrubberId);
      if (!el) return;
      const maxValue = Number(el.dataset.max ?? 1000);
      const setTimeFromEvent = (evt: MouseEvent) => {
        if (!this.audioEl.duration) return;
        const rect = el.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const value = Math.max(0, Math.min(1, x / rect.width));
        this.audioEl.currentTime = value * this.audioEl.duration;
      };
      // Click to seek
      el.addEventListener('click', setTimeFromEvent);
      // Drag to seek
      let isDragging = false;
      el.addEventListener('mousedown', () => { isDragging = true; });
      el.addEventListener('mousemove', (evt) => {
        if (isDragging) setTimeFromEvent(evt);
      });
      el.addEventListener('mouseup', () => { isDragging = false; this.startSyncLoop(); });
      el.addEventListener('mouseleave', () => { isDragging = false; });
      // AeroUI elastic slider: listen for input (drag) and change (release)
      el.addEventListener('input', (e: Event) => {
        const value = (e as CustomEvent<{ value: number }>).detail?.value;
        if (value !== undefined && this.audioEl.duration > 0) {
          this.audioEl.currentTime = (value / maxValue) * this.audioEl.duration;
        }
      });
      el.addEventListener('change', () => {
        this.startSyncLoop();
      });
    };
    bindScrubber('qp-bar-scrubber');
    bindScrubber('aml-scrubber-track');

    const volSlider = document.getElementById('aml-volume-slider') as HTMLInputElement | null;
    const quranVolOut = document.getElementById('aml-quran-volume-val');
    const ambientSlider = document.getElementById('aml-ambient-volume') as HTMLInputElement | null;
    const ambientVolOut = document.getElementById('aml-ambient-volume-val');
    const muteBtn = document.getElementById('aml-mute-btn');

    const updateMuteVisual = () => {
      const muted = this.audioEl.muted || this.audioEl.volume === 0;
      muteBtn?.classList.toggle('active', muted);
      muteBtn?.setAttribute('aria-pressed', String(muted));
      muteBtn?.querySelector('.icon-vol-on')?.classList.toggle('hidden', muted);
      muteBtn?.querySelector('.icon-vol-off')?.classList.toggle('hidden', !muted);
    };

    const applyQuranVolume = (volume: number, persist = false) => {
      const clamped = Math.max(0, Math.min(1, volume));
      this.audioEl.volume = clamped;
      if (clamped > 0) this.audioEl.muted = false;
      updateMuteVisual();
      if (volSlider) volSlider.value = String(clamped);
      if (quranVolOut) quranVolOut.textContent = `${Math.round(clamped * 100)}%`;
      if (persist) writeSetting(SETTINGS_KEYS.quranVolume, clamped.toFixed(2));
    };

    const applyAmbientVolume = (volume: number, persist = false) => {
      const clamped = Math.max(0, Math.min(1, volume));
      getAmbientMixer().setMasterVolume(clamped);
      if (ambientSlider) ambientSlider.value = String(clamped);
      if (ambientVolOut) ambientVolOut.textContent = `${Math.round(clamped * 100)}%`;
      if (persist) writeSetting(SETTINGS_KEYS.ambientVolume, clamped.toFixed(2));
    };

    const toggleMixer = (show?: boolean) => {
      if (show === undefined) this.showMixer = !this.showMixer;
      else this.showMixer = show;
      const mixerEl = document.getElementById('aml-mixer');
      if (mixerEl) {
        if (this.showMixer) {
          mixerEl.classList.remove('hidden');
          mixerEl.style.display = 'flex';
        } else {
          mixerEl.classList.add('hidden');
        }
      }
    };

    volSlider?.addEventListener('input', () => applyQuranVolume(Number(volSlider.value), true));
    ambientSlider?.addEventListener('input', () => applyAmbientVolume(Number(ambientSlider.value), true));
    muteBtn?.addEventListener('click', () => {
      this.audioEl.muted = !this.audioEl.muted;
      updateMuteVisual();
      toggleMixer(this.audioEl.muted); // show mixer when muted, hide when unmuted
    });

    applyQuranVolume(Number(this.audioEl.volume));
    applyAmbientVolume(getAmbientMixer().getMasterVolume());
    updateMuteVisual();

    const updateOffsetLabel = () => {
      const lbl = document.getElementById('aml-sync-offset-label');
      if (lbl) {
        const sign = this.userManualOffsetMs > 0 ? '+' : '';
        lbl.textContent = `${sign}${this.userManualOffsetMs}ms`;
      }
    };
    document.getElementById('aml-sync-minus-btn')?.addEventListener('click', () => {
      this.userManualOffsetMs -= 100;
      updateOffsetLabel();
    });
    document.getElementById('aml-sync-plus-btn')?.addEventListener('click', () => {
      this.userManualOffsetMs += 100;
      updateOffsetLabel();
    });
    document.getElementById('aml-sync-offset-label')?.addEventListener('click', () => {
      this.userManualOffsetMs = 0;
      updateOffsetLabel();
    });

    // Native Fullscreen Sheet Transition (Web Animations API)
    const fsOverlay = document.getElementById('aml-fullscreen-player');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const openFullscreen = () => {
      if (!fsOverlay) return;
      fsOverlay.classList.remove('hidden');
      document.body.classList.add('aml-fullscreen-open');
      this.applyQuranView();
      this.applyDisplayMode();
      this.applyFullscreenBgMode();
      this.scenes?.setPlaying(!this.audioEl.paused);
      if (!reducedMotion) {
        fsOverlay.animate(
          [
            { transform: 'translateY(100%)', opacity: 0.6 },
            { transform: 'translateY(0)', opacity: 1 }
          ],
          { duration: 440, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
        ).finished.then(() => {
          fsOverlay.style.transform = '';
          fsOverlay.style.opacity = '';
        });
      }
      setTimeout(() => {
        this.animator.forceAlignActiveLine();
      }, 60);
    };

    const closeFullscreen = () => {
      if (!fsOverlay) return;
      document.body.classList.remove('aml-fullscreen-open');
      this.stopIslamicBgRotator();
      // Always pause: the canvas is hidden, so leaving its rAF loop running
      // only burns CPU/GPU (and battery) in the background.
      this.dybgInstance?.pause?.();
      this.scenes?.setPlaying(false);
      this.clearCinematicTimer();
      getAmbientMixer().playOnly(null);
      document.getElementById('aml-scene-menu')?.classList.add('hidden');
      document.getElementById('aml-more-panel')?.classList.add('hidden');
      document.getElementById('aml-queue-panel')?.classList.add('hidden');
      if (!reducedMotion) {
        fsOverlay.animate(
          [
            { transform: 'translateY(0)', opacity: 1 },
            { transform: 'translateY(100%)', opacity: 0 }
          ],
          { duration: 320, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
        ).finished.then(() => {
          fsOverlay.classList.add('hidden');
          fsOverlay.style.transform = '';
          fsOverlay.style.opacity = '';
        });
      } else {
        fsOverlay.classList.add('hidden');
      }
    };

    document.getElementById('qp-expand-fullscreen-btn')?.addEventListener('click', openFullscreen);
    document.getElementById('qp-open-fullscreen-trigger')?.addEventListener('click', openFullscreen);
    document.getElementById('surah-open-aml-btn')?.addEventListener('click', () => {
      openFullscreen();
      if (this.audioEl.paused) {
        this.audioEl.play().catch(() => {});
      }
    });
    document.getElementById('aml-close-fullscreen-btn')?.addEventListener('click', closeFullscreen);
    document.getElementById('aml-corner-close-btn')?.addEventListener('click', closeFullscreen);

    const hudToggleBtn = document.getElementById('aml-toggle-hud-btn');
    const toggleFullscreenHud = () => {
      if (!fsOverlay) return;
      const hidden = fsOverlay.classList.toggle('hud-hidden');
      if (hudToggleBtn) {
        hudToggleBtn.setAttribute('aria-pressed', String(hidden));
        hudToggleBtn.querySelector('.icon-hud-hide')?.classList.toggle('hidden', hidden);
        hudToggleBtn.querySelector('.icon-hud-show')?.classList.toggle('hidden', !hidden);
      }
    };
    hudToggleBtn?.addEventListener('click', toggleFullscreenHud);

    const sceneMenu = document.getElementById('aml-scene-menu');
    const bgModeBtn = document.getElementById('aml-bg-mode-btn');
    const coverEl = document.getElementById('aml-bg-mode-cover');

    // Background scene cover icons — Salah Icons (mosque) + Lucide (weather/nature/state)
    const SCENE_ICONS: Record<SceneId, string> = {
      islamic: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 240 240" fill="none"><circle cx="120" cy="120" r="88" fill="var(--halo)"/><g fill="var(--paper)" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(32.013 28.174) scale(0.723)" stroke-width="3.321"><ellipse cx="122" cy="198" rx="76" ry="4" fill="var(--tone)" stroke="none"/><path d="M48 158l30-15H198l-30 15Z" fill="var(--paper)"/><path d="M48 158v-7l2.5-4.25L53 148.5v4l5-2.5v-4l2.5-4.25L63 143.5v4l5-2.5v-4l2.5-4.25L73 138.5v4l5-2.5v-4v4h6v-4l3-3l3 3v4h6v-4l3-3l3 3v4h6v-4l3-3l3 3v4h6v-4l3-3l3 3v4h6v-4l3-3l3 3v4h6v-4l3-3l3 3v4h6v-4l3-3l3 3v4h6v-4l3-3l3 3v7H78Z" fill="var(--paper)"/><g transform="translate(-9 2)"><path d="M163 158l5-100h10l5 100" fill="var(--paper)"/><path d="M173 43V37"/><circle cx="173" cy="34.5" r="2.5" fill="var(--paper)"/><path d="M170.75 65.75V63.73c0-1.54 1.49-2.23 2.25-2.48c.77 .25 2.25 .94 2.25 2.48v2.02ZM170.5 88V83.5c0-3.41 1.65-4.95 2.5-5.5c.85 .55 2.5 2.09 2.5 5.5V88Zm-1 56v-5.4c0-4.09 2.31-5.94 3.5-6.6c1.19 .66 3.5 2.51 3.5 6.6V144Z" fill="var(--tone)" stroke-width="2.145"/><path d="M166 100l3.5 3l3.5-3l3.5 3l3.5-3m-14 6l3.5 3l3.5-3l3.5 3l3.5-3m-14 6l3.5 3l3.5-3l3.5 3l3.5-3" stroke-width="2.145"/><path d="M168 58c0-7 3-12 5-15c2 3 5 8 5 15Zm-5.5 13.5q0-2.5 2.5-2.5h16q2.5 0 2.5 2.5v0q0 2.5-2.5 2.5H165q-2.5 0-2.5-2.5Zm-1.5 22q0-2.5 2.5-2.5h19q2.5 0 2.5 2.5v0q0 2.5-2.5 2.5h-19q-2.5 0-2.5-2.5ZM159 123q0-3 3-3h22q3 0 3 3v0q0 3-3 3H162q-3 0-3-3Z" fill="var(--tone)"/></g><g transform="translate(20.16 28.44) scale(0.82)" stroke-width="4.05"><path d="M70 143h84v15H70Z" fill="var(--tone)"/><path d="M70 143V121c1-18 11-27 26-36c8-4 12-7 14-8h4c6 4 9 5 14 8c16 9 25 18 26 36v22Z" fill="var(--tone)"/><path d="M70 121h84m-72 0c1-18 17-31 26-40M98 121c0-20 8-33 13-41m15 41c0-20-8-33-13-41m29 41c-1-18-17-31-26-40" stroke-width="2.615"/><path d="M76.5 134v-5a2.5 2.5 0 0 1 5 0v5Zm11 0v-5a2.5 2.5 0 0 1 5 0v5Zm11 0v-5a2.5 2.5 0 0 1 5 0v5Zm11 0v-5a2.5 2.5 0 0 1 5 0v5Zm11 0v-5a2.5 2.5 0 0 1 5 0v5Zm11 0v-5a2.5 2.5 0 0 1 5 0v5Zm11 0v-5a2.5 2.5 0 0 1 5 0v5Z" fill="var(--paper)" stroke-width="2.615"/><path d="M108 77l4-6l4 6Z" fill="var(--paper)"/><path d="M112 71V59"/><circle cx="112" cy="66" r="2" fill="var(--tone)" stroke-width="2.615"/><path d="M112 54q-3.5 5 0 7q3.5-2 0-7Z" fill="var(--tone)" stroke-width="2.615"/></g><path d="M48 158H168v38H48Z" fill="var(--paper)"/><path d="M168 158l30-15v38l-30 15Z" fill="var(--tone)"/><path d="M55.5 191V179.75c0-8.52 4.29-12.37 6.5-13.75c2.21 1.38 6.5 5.23 6.5 13.75V191Zm23 0V179.75c0-8.52 4.29-12.37 6.5-13.75c2.21 1.38 6.5 5.23 6.5 13.75V191Zm23 0V179.75c0-8.52 4.29-12.37 6.5-13.75c2.21 1.38 6.5 5.23 6.5 13.75V191Zm23 0V179.75c0-8.52 4.29-12.37 6.5-13.75c2.21 1.38 6.5 5.23 6.5 13.75V191Zm23 0V179.75c0-8.52 4.29-12.37 6.5-13.75c2.21 1.38 6.5 5.23 6.5 13.75V191Z" fill="var(--tone)" stroke-width="2.145"/><g transform="matrix(1 -.5 0 1 178 186)"><path d="M-3.5 0V-9.9C-3.5-17.4-1.19-20.79 0-22c1.19 1.21 3.5 4.6 3.5 12.1V0Z" fill="var(--paper)" stroke-width="2.145"/></g><g transform="matrix(1 -.5 0 1 190 180)"><path d="M-3.5 0V-9.9C-3.5-17.4-1.19-20.79 0-22c1.19 1.21 3.5 4.6 3.5 12.1V0Z" fill="var(--paper)" stroke-width="2.145"/></g><path d="M48 158v-7l3-3l3 3v4h6v-4l3-3l3 3v4h6v-4l3-3l3 3v4h6v-4l3-3l3 3v4h6v-4l3-3l3 3v4h6v-4l3-3l3 3v4h6v-4l3-3l3 3v4h6v-4l3-3l3 3v4h6v-4l3-3l3 3v4h6v-4l3-3l3 3v4h6v-4l3-3l3 3v4h6v-4l2.5-4.25l2.5 1.75v4l5-2.5v-4l2.5-4.25l2.5 1.75v4l5-2.5v-4l2.5-4.25l2.5 1.75v4l5-2.5v3l-30 15Z" fill="var(--paper)"/></g></g></svg>',
      rain: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>',
      forest: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/><path d="M12 22v-3"/></svg>',
      dybg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/></svg>',
      off: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/></svg>',
    };

    const setSceneCover = (scene: SceneId) => {
      if (!coverEl) return;
      coverEl.innerHTML = SCENE_ICONS[scene] ?? SCENE_ICONS.islamic;
    };

    const setSceneMenuOpen = (open: boolean) => {
      sceneMenu?.classList.toggle('hidden', !open);
      bgModeBtn?.setAttribute('aria-expanded', String(open));
    };

    bgModeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      setSceneMenuOpen(sceneMenu?.classList.contains('hidden') ?? false);
    });

    sceneMenu?.addEventListener('click', (e) => {
      const opt = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-scene]');
      if (!opt) return;
      const scene = (opt.getAttribute('data-scene') as SceneId) || 'islamic';
      this.setSceneMode(scene);
      setSceneMenuOpen(false);
      setSceneCover(scene);
    });

    document.getElementById('aml-bg-next-btn')?.addEventListener('click', () => {
      if (this.fullscreenBgMode === 'islamic') {
        this.showIslamicBackgroundSlide(this.islamicBgIndex + 1, false);
        this.startIslamicBgRotator();
      }
    });

    // Settings sheet from fullscreen (closes other panels first, then opens sheet)
    document.getElementById('aml-settings-btn-fullscreen')?.addEventListener('click', (e) => {
      document.getElementById('aml-more-panel')?.classList.add('hidden');
      document.getElementById('aml-scene-menu')?.classList.add('hidden');
      document.getElementById('aml-queue-panel')?.classList.add('hidden');
      // settings-sheet.ts listens globally on [data-open-settings] and opens the sheet
    });

    // ── More panel (sync, background image, text view, translation, repeat, download)
    const moreBtn = document.getElementById('aml-more-btn');
    const morePanel = document.getElementById('aml-more-panel');
    const setMoreOpen = (open: boolean) => {
      morePanel?.classList.toggle('hidden', !open);
      moreBtn?.setAttribute('aria-expanded', String(open));
    };
    moreBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      setMoreOpen(morePanel?.classList.contains('hidden') ?? false);
    });

    // The repeat button is already wired to cycleRepeat above.
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest('.aml-scene-pill-wrap')) setSceneMenuOpen(false);
      if (!target.closest('#aml-more-panel') && !target.closest('#aml-more-btn')) setMoreOpen(false);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        setSceneMenuOpen(false);
        setMoreOpen(false);
      }
    });

    // ── Quran text view (vinyl mode when off)
    const quranViewBtn = document.getElementById('aml-quran-view-btn');
    quranViewBtn?.addEventListener('click', () => {
      this.showQuranText = !this.showQuranText;
      writeSetting(SETTINGS_KEYS.quranView, this.showQuranText ? '1' : '0');
      this.applyQuranView();
    });

    // ── Sharing
    const openShareModal = () => {
      document.getElementById('shareModal')?.classList.remove('hidden');
    };
    document.getElementById('aml-share-btn')?.addEventListener('click', openShareModal);
    document.getElementById('aml-head-share-btn')?.addEventListener('click', openShareModal);

    // ── Translation & tajweed
    const transBtn = document.getElementById('aml-toggle-translation-btn');
    const applyTranslation = (enabled: boolean, persist = false, rerender = true) => {
      this.showFullscreenTranslation = enabled;
      transBtn?.classList.toggle('active', enabled);
      transBtn?.setAttribute('aria-pressed', String(enabled));
      if (persist) writeSetting(SETTINGS_KEYS.translation, enabled ? '1' : '0');
      if (rerender) {
        this.renderFullscreenAyahsList();
        this.rebindAnimator();
      }
    };
    transBtn?.addEventListener('click', () => applyTranslation(!this.showFullscreenTranslation, true));

    const tjBtn = document.getElementById('aml-toggle-tajweed-btn');
    const applyQuranSide = (enabled: boolean, persist = false) => {
      this.showQuranText = enabled;
      tjBtn?.classList.toggle('active', enabled);
      tjBtn?.setAttribute('aria-pressed', String(enabled));
      if (persist) writeSetting(SETTINGS_KEYS.quranView, enabled ? '1' : '0');
      this.applyQuranView();
    };
    tjBtn?.addEventListener('click', () => applyQuranSide(!this.showQuranText, true));

    // Tajweed coloring stays settings-controlled (default ON). The fullscreen
    // tajweed button no longer touches it — it now shows/hides the Quran side.
    const applyTajweed = (enabled: boolean, persist = false, rerender = true) => {
      this.showFullscreenTajweed = enabled;
      if (persist) writeSetting(SETTINGS_KEYS.tajweed, enabled ? '1' : '0');
      if (rerender) {
        this.renderFullscreenAyahsList();
        this.rebindAnimator();
      }
    };

    // ── Ayah queue
    const queueBtn = document.getElementById('aml-queue-btn');
    const queuePanel = document.getElementById('aml-queue-panel');
    const queueList = document.getElementById('aml-queue-list');
    const setQueueOpen = (open: boolean) => {
      queuePanel?.classList.toggle('hidden', !open);
      queueBtn?.setAttribute('aria-expanded', String(open));
      if (open) this.renderQueuePanel();
    };
    const escapeText = (value: string) =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    queueBtn?.addEventListener('click', () => {
      setMoreOpen(false);
      setQueueOpen(queuePanel?.classList.contains('hidden') ?? false);
    });
    document.getElementById('aml-queue-close-btn')?.addEventListener('click', () => setQueueOpen(false));
    queueList?.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-queue-ayah]');
      if (!item) return;
      const ayah = Number(item.getAttribute('data-queue-ayah') || 0);
      if (ayah > 0) this.seekToAyah(ayah, true);
      setQueueOpen(false);
    });

    // ── Settings sheet events
    window.addEventListener('kalamalah:scene-changed', (e: Event) => {
      const detail = (e as CustomEvent<{ scene: SceneId }>).detail;
      if (detail?.scene) {
        this.setSceneMode(detail.scene, false);
        setSceneCover(detail.scene);
      }
    });
    window.addEventListener('kalamalah:quran-view-changed', (e: Event) => {
      this.showQuranText = (e as CustomEvent<{ enabled: boolean }>).detail?.enabled !== false;
      this.applyQuranView();
    });
    window.addEventListener('kalamalah:translation-changed', (e: Event) => {
      applyTranslation((e as CustomEvent<{ enabled: boolean }>).detail?.enabled !== false, false, true);
    });
    window.addEventListener('kalamalah:tajweed-changed', (e: Event) => {
      applyTajweed((e as CustomEvent<{ enabled: boolean }>).detail?.enabled === true, false, true);
    });
    window.addEventListener('kalamalah:display-mode-changed', (e: Event) => {
      this.displayMode = (e as CustomEvent<{ mode: string }>).detail?.mode === 'cinematic' ? 'cinematic' : 'default';
      this.applyDisplayMode();
    });
    window.addEventListener('kalamalah:reduce-motion-changed', (e: Event) => {
      const enabled = (e as CustomEvent<{ enabled: boolean }>).detail?.enabled === true;
      this.scenes?.setMotionAllowed(!enabled);
    });
    window.addEventListener('kalamalah:quran-volume-changed', (e: Event) => {
      const volume = Number((e as CustomEvent<{ volume: number }>).detail?.volume);
      if (Number.isFinite(volume)) applyQuranVolume(volume);
    });
    window.addEventListener('kalamalah:ambient-volume-changed', (e: Event) => {
      const volume = Number((e as CustomEvent<{ volume: number }>).detail?.volume);
      if (Number.isFinite(volume)) applyAmbientVolume(volume);
    });

    // Cinematic mode reveals the chrome on interaction, then fades it again.
    fsOverlay?.addEventListener('pointermove', () => this.wakeCinematicChrome());
    fsOverlay?.addEventListener('touchstart', () => this.wakeCinematicChrome(), { passive: true });
    fsOverlay?.addEventListener('click', () => this.wakeCinematicChrome());

    // ── Bookmarks (desktop metadata row + mobile head)
    const bookmarkCurrentAyah = () => {
      const sMeta = this.catalog.surahs.find((s) => s.n === this.currentSurahNumber);
      const aData = this.currentAyahsData.find((a) => a.n === this.activeAyahNumber);
      if (sMeta && aData) {
        toggleBookmarkAyah(sMeta.n, sMeta.ar, aData.n, aData.text);
      }
    };
    document.getElementById('aml-bookmark-ayah-btn')?.addEventListener('click', bookmarkCurrentAyah);
    document.getElementById('aml-head-bookmark-btn')?.addEventListener('click', bookmarkCurrentAyah);

    // Initial visual state
    transBtn?.classList.toggle('active', this.showFullscreenTranslation);
    tjBtn?.classList.toggle('active', this.showQuranText);
    this.applyQuranView();
    this.applyDisplayMode();

    document.getElementById('aml-ayahs-list')?.addEventListener('click', (e) => {
      const wordEl = (e.target as HTMLElement | null)?.closest<HTMLElement>('.aml-word');
      if (wordEl) {
        e.stopPropagation();
        const wordIdx = Number(wordEl.getAttribute('data-word-idx') || -1);
        const lineEl = wordEl.closest<HTMLElement>('.aml-ayah-line');
        const ayahNum = lineEl ? Number(lineEl.getAttribute('data-ayah') || 0) : 0;
        if (wordIdx >= 0 && ayahNum > 0) {
          this.playWordAudio(this.currentSurahNumber, ayahNum, wordIdx);
          return;
        }
        // Fallback to seeking
        const ms = Number(wordEl.getAttribute('data-seek-ms') || 0);
        this.audioEl.currentTime = Math.max(0, (ms - this.effectiveSyncOffsetMs) / 1000);
        if (this.audioEl.paused) this.audioEl.play().catch(() => {});
        return;
      }
      const lineEl = (e.target as HTMLElement | null)?.closest<HTMLElement>('.aml-ayah-line');
      if (lineEl) {
        const ms = Number(lineEl.getAttribute('data-seek-ms') || 0);
        this.audioEl.currentTime = Math.max(0, (ms - this.effectiveSyncOffsetMs) / 1000);
        if (this.audioEl.paused) this.audioEl.play().catch(() => {});
      }
    });

    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Support clicking a word in the reader (cards, متصل mushaf-flow, or mushaf page) to play word audio
      const quranWordEl = target.closest<HTMLElement>('.quran-word[data-seek-ms]:not(.memo-hidden-word)');
      if (quranWordEl) {
        const surahEl = document.getElementById('surah-ayahs-wrapper');
        const surahNum = surahEl ? Number(surahEl.getAttribute('data-surah-number') || 0) : this.currentSurahNumber;
        const ayahNum = Number(quranWordEl.getAttribute('data-ayah') || 0);
        const wordIdx = Number(quranWordEl.getAttribute('data-word-idx') || -1);
        if (surahNum > 0 && ayahNum > 0 && wordIdx >= 0) {
          this.playWordAudio(surahNum, ayahNum, wordIdx);
          return;
        }
        // Fallback to seeking
        const ms = Number(quranWordEl.getAttribute('data-seek-ms') || 0);
        if (ms >= 0 && this.audioEl.src) {
          this.audioEl.currentTime = Math.max(0, (ms - this.effectiveSyncOffsetMs) / 1000);
          if (this.audioEl.paused) this.audioEl.play().catch(() => {});
          this.startSyncLoop();
          return;
        }
      }

      const playAyahBtn = target.closest<HTMLElement>('[data-play-ayah]');
      if (playAyahBtn) {
        e.preventDefault();
        const ayahNum = Number(playAyahBtn.getAttribute('data-play-ayah') || 1);
        const explicitSurah = Number(
          playAyahBtn.getAttribute('data-play-surah') ||
            document.getElementById('surah-ayahs-wrapper')?.getAttribute('data-surah-number') ||
            this.currentSurahNumber
        );

        if (explicitSurah !== this.currentSurahNumber) {
          this.playSurah(explicitSurah, undefined, ayahNum);
        } else {
          this.seekToAyah(ayahNum, true);
        }
        return;
      }

      const playSurahBtn = target.closest<HTMLElement>('[data-play-surah]');
      if (playSurahBtn) {
        e.preventDefault();
        const sNum = Number(playSurahBtn.getAttribute('data-play-surah') || 1);
        const recSlug = playSurahBtn.getAttribute('data-play-reciter') || undefined;
        this.playSurah(sNum, recSlug);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!fsOverlay || fsOverlay.classList.contains('hidden')) return;
      if (e.key === 'Escape') {
        closeFullscreen();
      } else if (
        (e.key === 'h' || e.key === 'H') &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        toggleFullscreenHud();
      }
    });

    window.addEventListener('kalamalah:locale-changed', () => {
      const sMeta =
        this.catalog.surahs.find((s) => s.n === this.currentSurahNumber) ?? this.catalog.surahs[0];
      const rMeta =
        this.catalog.reciters.find((r) => r.slug === this.currentReciterSlug) ??
        this.catalog.reciters[0];
      if (sMeta && rMeta) {
        this.updateNowPlayingLabels(sMeta, rMeta);
      }
      this.applyFullscreenBgMode();
      updateOffsetLabel();
    });
  }

  public rebindAnimator(): void {
    const fsListEl = document.getElementById('aml-ayahs-list');
    const readerWrapEl =
      this.catalog.pageData?.surahNumber === this.currentSurahNumber
        ? document.getElementById('surah-ayahs-wrapper')
        : null;
    this.animator.bindTimings(this.currentTimings?.ayahs ?? [], fsListEl, readerWrapEl);
  }
}
