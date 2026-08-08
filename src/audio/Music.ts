import type { AudioFx } from './AudioFx';

/**
 * Adaptive music engine — fully synthesized (no audio files), trap-flavoured
 * at 140 BPM. Conceptual stems, each with its own gain bus:
 *
 *   AMBIENCE  sustained detuned pad             (always on, quiet)
 *   DRUMS     kick + snare pattern              intensity > ~0.2
 *   BASS_808  gliding sub notes under the kick  intensity > ~0.4
 *   HIHATS    8th/16th hats with velocity       intensity > ~0.55
 *   MELODY    sparse minor pluck arp            intensity > ~0.7
 *   OVERDRIVE saw stabs + 16th hat layer        intensity > ~0.9
 *
 * A look-ahead scheduler places notes on a 16-step bar grid; stem gains
 * ramp at bar boundaries so layers enter and leave musically, never
 * mid-beat. The whole engine routes through AudioFx's master bus, so the
 * life-lost duck/low-pass and mute apply to music automatically.
 */

const BPM = 140;
const STEPS_PER_BAR = 16;
const STEP_SECONDS = 60 / BPM / 4;
const LOOKAHEAD_SECONDS = 0.2;
const TICK_MS = 90;

// D minor world. Frequencies in Hz.
const SUB_NOTES = [36.71, 36.71, 43.65, 32.7]; // D1 D1 F1 C1 per bar
const PLUCK_SCALE = [293.66, 349.23, 392.0, 440.0, 523.25]; // D4 F4 G4 A4 C5

interface StemLevels {
  ambience: number;
  drums: number;
  bass: number;
  hats: number;
  melody: number;
  overdrive: number;
}

/** Smooth 0..1 gate around a threshold. */
function gate(intensity: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (intensity - from) / (to - from)));
}

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private stems: Record<keyof StemLevels, GainNode> | null = null;
  private padNodes: OscillatorNode[] = [];
  private intensity = 0;
  private nextStepTime = 0;
  private step = 0;
  private bar = 0;
  private timer: number | null = null;
  private rngState = 1234;
  private volume = 0.7;

  constructor(private audio: AudioFx) {}

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.bus) this.bus.gain.value = 0.42 * this.volume;
  }

  private rand(): number {
    this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  /** Idempotent; call from a user-gesture path after AudioFx.unlock(). */
  start(): void {
    if (this.ctx) return;
    const ctx = this.audio.context;
    const master = this.audio.bus;
    if (!ctx || !master) return;
    this.ctx = ctx;

    this.bus = ctx.createGain();
    this.bus.gain.value = 0.42 * this.volume;
    this.bus.connect(master);

    const makeStem = (): GainNode => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.bus as GainNode);
      return g;
    };
    this.stems = {
      ambience: makeStem(),
      drums: makeStem(),
      bass: makeStem(),
      hats: makeStem(),
      melody: makeStem(),
      overdrive: makeStem(),
    };

    // AMBIENCE pad: three detuned triangles, D minor colour, always running.
    for (const freq of [146.83, 174.61, 220.0]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = (this.rand() - 0.5) * 12;
      const g = ctx.createGain();
      g.gain.value = 0.035;
      osc.connect(g).connect(this.stems.ambience);
      osc.start();
      this.padNodes.push(osc);
    }

    this.nextStepTime = ctx.currentTime + 0.1;
    this.step = 0;
    this.bar = 0;
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  setIntensity(value: number): void {
    this.intensity = Math.min(1, Math.max(0, value));
  }

  get started(): boolean {
    return this.ctx !== null;
  }

  get currentBar(): number {
    return this.bar;
  }

  private levels(): StemLevels {
    const i = this.intensity;
    return {
      ambience: 0.5 + i * 0.5,
      drums: gate(i, 0.18, 0.32),
      bass: gate(i, 0.38, 0.5),
      hats: gate(i, 0.52, 0.66),
      melody: gate(i, 0.68, 0.8),
      overdrive: gate(i, 0.88, 0.96),
    };
  }

  /** Look-ahead scheduler: schedules every step falling in the window. */
  private tick(): void {
    if (!this.ctx || !this.stems) return;
    // Catch-up clamp: after a stall or hidden-tab throttle, fast-forward the
    // grid silently instead of bursting every missed note at once.
    if (this.nextStepTime < this.ctx.currentTime - 0.05) {
      while (this.nextStepTime < this.ctx.currentTime) {
        this.nextStepTime += STEP_SECONDS;
        this.step += 1;
        if (this.step >= STEPS_PER_BAR) {
          this.step = 0;
          this.bar += 1;
        }
      }
      this.applyStemLevels(this.nextStepTime);
    }
    while (this.nextStepTime < this.ctx.currentTime + LOOKAHEAD_SECONDS) {
      this.scheduleStep(this.step, this.nextStepTime);
      this.nextStepTime += STEP_SECONDS;
      this.step += 1;
      if (this.step >= STEPS_PER_BAR) {
        this.step = 0;
        this.bar += 1;
        this.applyStemLevels(this.nextStepTime);
      }
    }
  }

  /** Stem gains ramp at the bar boundary — layers change musically. */
  private applyStemLevels(atTime: number): void {
    if (!this.stems) return;
    const levels = this.levels();
    for (const key of Object.keys(levels) as Array<keyof StemLevels>) {
      const gain = this.stems[key].gain;
      gain.cancelScheduledValues(atTime);
      gain.setValueAtTime(gain.value, atTime);
      gain.linearRampToValueAtTime(levels[key], atTime + 0.12);
    }
  }

  private scheduleStep(step: number, t: number): void {
    if (!this.ctx || !this.stems) return;

    // DRUMS — trap kick pattern + snare backbeat.
    if (step === 0 || step === 6 || step === 10) this.kick(t);
    if (step === 8) this.snare(t, 0.5);
    if (step === 14 && this.intensity > 0.6 && this.rand() < 0.4) this.snare(t, 0.22);

    // BASS_808 — glides under the kick, progression cycles per bar.
    if (step === 0 || step === 6 || step === 10) {
      const root = SUB_NOTES[this.bar % SUB_NOTES.length];
      this.sub808(t, root, step === 0 ? 0.5 : 0.32);
    }

    // HIHATS — 8ths, upgraded to 16ths with rolls as intensity climbs.
    const sixteenths = this.intensity > 0.75;
    if (step % 2 === 0 || sixteenths) {
      const accent = step % 4 === 0 ? 0.24 : 0.13;
      this.hat(t, accent * (0.8 + this.rand() * 0.4));
      if (sixteenths && step === 12 && this.rand() < 0.5) {
        // little roll
        this.hat(t + STEP_SECONDS * 0.33, 0.1);
        this.hat(t + STEP_SECONDS * 0.66, 0.1);
      }
    }

    // MELODY — sparse pluck arp.
    if ((step === 2 || step === 7 || step === 12) && this.rand() < 0.75) {
      const note = PLUCK_SCALE[Math.floor(this.rand() * PLUCK_SCALE.length)];
      this.pluck(t, note);
    }

    // OVERDRIVE layer — saw stabs on the 1 and the 3.
    if (step === 0 || step === 8) {
      const root = SUB_NOTES[this.bar % SUB_NOTES.length];
      this.stab(t, root * 4);
    }
  }

  // ── Voices ────────────────────────────────────────────────────────────

  private kick(t: number): void {
    if (!this.ctx || !this.stems) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g).connect(this.stems.drums);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  private snare(t: number, gain: number): void {
    if (!this.ctx || !this.stems) return;
    const length = Math.floor(this.ctx.sampleRate * 0.12);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(filter).connect(g).connect(this.stems.drums);
    src.start(t);
    const tone = this.ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.value = 190;
    const tg = this.ctx.createGain();
    tg.gain.setValueAtTime(gain * 0.5, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    tone.connect(tg).connect(this.stems.drums);
    tone.start(t);
    tone.stop(t + 0.1);
  }

  private sub808(t: number, freq: number, gain: number): void {
    if (!this.ctx || !this.stems) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.5, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.06); // glide down
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(g).connect(this.stems.bass);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  private hat(t: number, gain: number): void {
    if (!this.ctx || !this.stems) return;
    const length = Math.floor(this.ctx.sampleRate * 0.05);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src.connect(filter).connect(g).connect(this.stems.hats);
    src.start(t);
  }

  private pluck(t: number, freq: number): void {
    if (!this.ctx || !this.stems) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(g).connect(this.stems.melody);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private stab(t: number, freq: number): void {
    if (!this.ctx || !this.stems) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + 0.2);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(filter).connect(g).connect(this.stems.overdrive);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  dispose(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const osc of this.padNodes) osc.stop();
    this.padNodes = [];
    this.bus?.disconnect();
    this.ctx = null;
    this.stems = null;
    this.bus = null;
  }
}
