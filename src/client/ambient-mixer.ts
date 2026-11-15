export type AmbientTrack = 'rain' | 'snow' | 'masjid';

interface ChannelState {
  gain: GainNode | null;
  source: AudioBufferSourceNode | null;
  volume: number;
  active: boolean;
}

export class AmbientMixer {
  private ctx: AudioContext | null = null;
  private channels: Record<AmbientTrack, ChannelState> = {
    rain: { gain: null, source: null, volume: 0.35, active: false },
    snow: { gain: null, source: null, volume: 0.25, active: false },
    masjid: { gain: null, source: null, volume: 0.2, active: false },
  };

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
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
      filter.frequency.value = track === 'rain' ? 1200 : track === 'snow' ? 420 : 240;

      const gain = ctx.createGain();
      gain.gain.value = ch.volume;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start();

      ch.source = source;
      ch.gain = gain;
      ch.active = true;
    } else {
      try {
        ch.source?.stop();
        ch.source?.disconnect();
        ch.gain?.disconnect();
      } catch {}
      ch.source = null;
      ch.gain = null;
      ch.active = false;
    }
    return ch.active;
  }

  public setVolume(track: AmbientTrack, volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    const ch = this.channels[track];
    ch.volume = clamped;
    if (ch.gain && this.ctx) {
      ch.gain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
    }
  }

  public stopAll(): void {
    (Object.keys(this.channels) as AmbientTrack[]).forEach((t) => this.toggle(t, false));
  }
}

export function initAmbientMixer(): AmbientMixer {
  const mixer = new AmbientMixer();
  (window as any).__KALAMALAH_AMBIENT_MIXER__ = mixer;
  return mixer;
}
