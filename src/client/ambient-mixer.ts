export type AmbientTrack = 'rain' | 'forest' | 'snow' | 'masjid';

interface ChannelState {
  gain: GainNode | null;
  source: AudioBufferSourceNode | null;
  volume: number;
  active: boolean;
  filter: BiquadFilterNode | null;
}

const DEFAULT_TRACK_VOLUMES: Record<AmbientTrack, number> = {
  rain: 0.35,
  forest: 0.26,
  snow: 0.25,
  masjid: 0.2,
};

export class AmbientMixer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private masterVolume = 0.35;
  private channels: Record<AmbientTrack, ChannelState> = {
    rain: { gain: null, source: null, volume: DEFAULT_TRACK_VOLUMES.rain, active: false, filter: null },
    forest: { gain: null, source: null, volume: DEFAULT_TRACK_VOLUMES.forest, active: false, filter: null },
    snow: { gain: null, source: null, volume: DEFAULT_TRACK_VOLUMES.snow, active: false, filter: null },
    masjid: { gain: null, source: null, volume: DEFAULT_TRACK_VOLUMES.masjid, active: false, filter: null },
  };

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext, type: AmbientTrack): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (type === 'rain') {
        // Pink-ish rain noise
        lastOut = (lastOut + 0.08 * white) / 1.08;
        data[i] = lastOut * 2.2;
      } else if (type === 'forest') {
        // Soft wind through leaves: pink noise with a slow amplitude drift
        lastOut = (lastOut + 0.05 * white) / 1.05;
        const drift = 0.78 + 0.22 * Math.sin((i / sampleRate) * 0.6);
        data[i] = lastOut * 2.4 * drift;
      } else if (type === 'snow') {
        // Soft, deep wind/snow brown noise
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 3.0;
      } else {
        // Warm low-frequency room/masjid ambience
        lastOut = (lastOut + 0.012 * white) / 1.012;
        data[i] = lastOut * 2.6;
      }
    }
    return buffer;
  }

  public toggle(track: AmbientTrack, force?: boolean): boolean {
    const ch = this.channels[track];
    const next = force ?? !ch.active;
    if (next === ch.active) return ch.active;

    if (next) {
      const ctx = this.ensureContext();
      const source = ctx.createBufferSource();
      source.buffer = this.createNoiseBuffer(ctx, track);
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = track === 'rain' ? 'bandpass' : 'lowpass';
      filter.frequency.value =
        track === 'rain' ? 1200 : track === 'forest' ? 760 : track === 'snow' ? 420 : 240;

      const gain = ctx.createGain();
      gain.gain.value = ch.volume;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master ?? ctx.destination);
      source.start();

      ch.source = source;
      ch.gain = gain;
      ch.filter = filter;
      ch.active = true;
    } else {
      try {
        ch.source?.stop();
        ch.source?.disconnect();
        ch.gain?.disconnect();
        ch.filter?.disconnect();
      } catch {}
      ch.source = null;
      ch.gain = null;
      ch.filter = null;
      ch.active = false;
    }
    return ch.active;
  }

  /** Only one ambient bed should ever play at a time. */
  public playOnly(track: AmbientTrack | null): void {
    (Object.keys(this.channels) as AmbientTrack[]).forEach((t) => {
      this.toggle(t, t === track);
    });
  }

  public setVolume(track: AmbientTrack, volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    const ch = this.channels[track];
    ch.volume = clamped;
    if (ch.gain && this.ctx) {
      ch.gain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
    }
  }

  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.06);
    }
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public isActive(track: AmbientTrack): boolean {
    return this.channels[track].active;
  }

  public stopAll(): void {
    (Object.keys(this.channels) as AmbientTrack[]).forEach((t) => this.toggle(t, false));
  }
}

let mixerSingleton: AmbientMixer | null = null;

export function getAmbientMixer(): AmbientMixer {
  if (!mixerSingleton) {
    mixerSingleton = new AmbientMixer();
    (window as any).__KALAMALAH_AMBIENT_MIXER__ = mixerSingleton;
  }
  return mixerSingleton;
}

export function initAmbientMixer(): AmbientMixer {
  return getAmbientMixer();
}
