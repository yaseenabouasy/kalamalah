/**
 * Photographic background scenes for the fullscreen player.
 * Rain and forest are short muted video loops with a WebP poster fallback.
 * Videos only play while the overlay is open, audio is playing and motion is
 * allowed, so phones do not decode video in the background.
 */

export type SceneId = 'islamic' | 'rain' | 'forest' | 'dybg' | 'off';
type VideoScene = 'rain' | 'forest';

interface SceneSource {
  src: string;
  poster: string;
}

const SCENE_SOURCES: Record<VideoScene, SceneSource> = {
  rain: { src: '/media/scenes/rain.mp4', poster: '/media/scenes/rain-poster.webp' },
  forest: { src: '/media/scenes/forest.mp4', poster: '/media/scenes/forest-poster.webp' },
};

export class BackgroundScenes {
  private videos = new Map<VideoScene, HTMLVideoElement>();
  private active: VideoScene | null = null;
  private shouldPlay = false;
  private motionAllowed = true;
  private visible = !document.hidden;

  constructor() {
    this.motionAllowed = !this.prefersReducedMotion();
    document.addEventListener('visibilitychange', () => {
      this.visible = !document.hidden;
      this.syncPlayback();
    });
  }

  private prefersReducedMotion(): boolean {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  private saveData(): boolean {
    const connection = (navigator as any)?.connection;
    return Boolean(connection?.saveData);
  }

  public setMotionAllowed(allowed: boolean): void {
    this.motionAllowed = allowed;
    if (!allowed) {
      this.pauseAll();
      this.videos.forEach((video) => video.remove());
      this.videos.clear();
    }
    this.syncPlayback();
  }

  public setScene(scene: SceneId): void {
    const next: VideoScene | null = scene === 'rain' || scene === 'forest' ? scene : null;
    this.active = next;

    (['rain', 'forest'] as VideoScene[]).forEach((kind) => {
      const layer = document.getElementById(`aml-scene-${kind}`);
      if (!layer) return;
      const isActive = kind === next;
      layer.classList.toggle('is-active', isActive);
      layer.setAttribute('aria-hidden', String(!isActive));
      if (!isActive) {
        this.videos.get(kind)?.pause();
        return;
      }
      this.ensureVideo(kind, layer);
    });

    this.syncPlayback();
  }

  public setPlaying(playing: boolean): void {
    this.shouldPlay = playing;
    this.syncPlayback();
  }

  public destroy(): void {
    this.pauseAll();
    this.videos.forEach((video) => video.remove());
    this.videos.clear();
  }

  private pauseAll(): void {
    this.videos.forEach((video) => {
      try {
        video.pause();
      } catch {}
    });
  }

  private ensureVideo(kind: VideoScene, layer: HTMLElement): void {
    if (!this.motionAllowed || this.saveData()) return;

    let video = this.videos.get(kind);
    if (!video) {
      const source = SCENE_SOURCES[kind];
      video = document.createElement('video');
      video.className = 'aml-scene-video';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'none';
      video.setAttribute('aria-hidden', 'true');
      video.setAttribute('disablepictureinpicture', '');
      video.poster = source.poster;
      video.src = source.src;

      video.addEventListener(
        'loadeddata',
        () => {
          video?.classList.add('is-ready');
        },
        { once: true }
      );

      // Poster (already painted behind the video) is the graceful fallback.
      video.addEventListener(
        'error',
        () => {
          video?.remove();
          this.videos.delete(kind);
        },
        { once: true }
      );

      layer.appendChild(video);
      this.videos.set(kind, video);
    }

    if (video.preload === 'none') {
      video.preload = 'auto';
    }
  }

  private syncPlayback(): void {
    const canPlay = this.motionAllowed && this.shouldPlay && this.visible;
    this.videos.forEach((video, kind) => {
      if (kind !== this.active) return;
      if (canPlay) {
        if (video.preload === 'none') video.preload = 'auto';
        const promise = video.play();
        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => {
            video.classList.remove('is-ready');
          });
        }
      } else {
        try {
          video.pause();
        } catch {}
      }
    });
  }
}
