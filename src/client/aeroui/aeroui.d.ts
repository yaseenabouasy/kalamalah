// AeroUI TypeScript declarations

// Player Button
export interface PlayerButtonInstance {
  el: HTMLElement;
  label: HTMLElement;
  held: boolean;
  downT: number;
  timer: ReturnType<typeof setInterval> | null;
  hideT: ReturnType<typeof setTimeout> | null;
  _releaseT: ReturnType<typeof setTimeout> | null;
  lastEnd: number;
  _swap: Animation | null;
  _mo: MutationObserver | null;
}

export function initPlayerButtons(root?: Document | HTMLElement): void;
export function initPlayerButton(el: HTMLElement): PlayerButtonInstance;

export const PLAYER_ICONS: {
  play: string;
  pause: string;
};

export function setPlayerIcon(el: HTMLElement, name: 'play' | 'pause'): void;

// Elastic Slider
export interface ElasticSliderInstance {
  el: HTMLElement;
  hit: HTMLElement;
  track: HTMLElement;
  fill: HTMLElement;
  value: number;
  lastStored: number;
  stretching: number;
  active: boolean;
  extreme: boolean;
  gesture: {
    id: number;
    startX: number;
    startValue: number;
    baseActive: number;
    dist: number;
    moved: boolean;
    downT: number;
  } | null;
  _ro: ResizeObserver | null;
  _keyT: ReturnType<typeof setTimeout> | null;
}

export function initElasticSliders(root?: Document | HTMLElement): void;
export function initElasticSlider(el: HTMLElement): ElasticSliderInstance;
export function getElasticValue(el: HTMLElement): number;
export function setElasticValue(el: HTMLElement, v: number, options?: { emitEvents?: boolean }): void;

// Skip Label
export interface SkipLabelInstance {
  el: HTMLElement;
  parts: {
    ghostL: HTMLElement;
    mid: HTMLElement;
    ghostR: HTMLElement;
  };
  size: number;
  duration: number;
  raf: number;
  lastStart: number;
  pending: { bouncing?: boolean; duration?: number } | null;
  pendingT: ReturnType<typeof setTimeout> | null;
}

export function initSkipLabels(root?: Document | HTMLElement): void;
export function initSkipLabel(el: HTMLElement): SkipLabelInstance;
export function playSkip(el: HTMLElement, opts?: { bouncing?: boolean; duration?: number }): void;
export function skipFrame(size: number, progress: number, linear: boolean): {
  leftOffset: number;
  leftWidth: number;
  rightOffset: number;
  rightWidth: number;
  leftOpacity: number;
  rightOpacity: number;
};