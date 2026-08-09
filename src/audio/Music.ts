import type { BiomeName } from '../environment/EnvironmentDirector';
import type { AudioFx } from './AudioFx';
import { BOSS_TRACK, DEFAULT_TRACK, TRACKS, type MusicTrack } from './tracks';

/**
 * Adaptive music engine — fully synthesized, no audio files. Each world has
 * its own track (tempo, key, patterns, timbres) in `tracks.ts`; this engine
 * renders whichever one is active. Conceptual stems, each with its own bus:
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

const STEPS_PER_BAR = 16;
const LOOKAHEAD_SECONDS = 0.2;
const TICK_MS = 90;

interface StemLevels {
  ambience: number;
  drums: number;
  bass: number;
  hats: number;
  melody: number;
  overdrive: number;
  guitar: number;
}

/** Smooth 0..1 gate around a threshold. */
function gate(intensity: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (intensity - from) / (to - from)));
}

/**
 * Classic waveshaper transfer curve. `amount` is the drive: the harder the
 * curve bends, the more odd harmonics get generated, which is what turns a
 * pair of sawtooth oscillators into something that reads as a guitar amp.
 */
function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 8192;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
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
  private track: MusicTrack = DEFAULT_TRACK;
  /** Queued track change — applied on a bar line so it never lands mid-phrase. */
  private pendingTrack: MusicTrack | null = null;
  private biome: BiomeName = 'CLAY';
  private bossMode = false;
  /** Distortion transfer curve, built once — it is 8k samples wide. */
  private distortionCurve: Float32Array<ArrayBuffer> | null = null;

  constructor(private audio: AudioFx) {}

  private get stepSeconds(): number {
    return 60 / this.track.bpm / 4;
  }

  /**
   * Switches the world's track. The swap waits for the next bar so the
   * change lands on a downbeat rather than cutting a phrase in half.
   */
  setBiome(biome: BiomeName): void {
    this.biome = biome;
    this.refreshTrack();
  }

  /** Boss levels override the world's track with the metal one. */
  setBossMode(on: boolean): void {
    if (this.bossMode === on) return;
    this.bossMode = on;
    this.refreshTrack();
  }

  private refreshTrack(): void {
    const next = this.bossMode ? BOSS_TRACK : (TRACKS[this.biome] ?? DEFAULT_TRACK);
    if (next === this.track || next === this.pendingTrack) return;
    if (!this.ctx) {
      this.track = next; // not started yet — adopt it directly
      return;
    }
    this.pendingTrack = next;
  }

  /** Rebuilds the sustained pad for the current track. */
  private buildPad(): void {
    if (!this.ctx || !this.stems) return;
    const now = this.ctx.currentTime;
    for (const osc of this.padNodes) {
      try {
        osc.stop(now + 0.35);
      } catch {
        /* already stopped */
      }
    }
    this.padNodes = [];
    for (const freq of this.track.padChord) {
      const osc = this.ctx.createOscillator();
      osc.type = this.track.padType;
      osc.frequency.value = freq;
      osc.detune.value = (this.rand() - 0.5) * 12;
      const g = this.ctx.createGain();
      // Fade in across the crossfade so the two pads overlap instead of clicking.
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(this.track.padGain, now + 0.35);
      osc.connect(g).connect(this.stems.ambience);
      osc.start(now);
      this.padNodes.push(osc);
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.bus) this.bus.gain.value = 0.52 * this.volume;
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
    this.bus.gain.value = 0.52 * this.volume;
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
      guitar: makeStem(),
    };

    // AMBIENCE pad: the current track's chord, always running.
    this.buildPad();

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
    // Stems enter early and hot — the loop should already be driving at
    // mid intensity, not waiting for a perfect rally to wake up.
    return {
      ambience: 0.5 + i * 0.5,
      drums: gate(i, 0.1, 0.22),
      bass: gate(i, 0.26, 0.38),
      hats: gate(i, 0.4, 0.52),
      melody: gate(i, 0.56, 0.7),
      overdrive: gate(i, 0.8, 0.9),
      // The boss riff is the floor of its track, not a reward layer — it
      // has to be there the moment the fight starts.
      guitar: 0.55 + gate(i, 0.2, 0.75) * 0.45,
    };
  }

  /** Look-ahead scheduler: schedules every step falling in the window. */
  private tick(): void {
    if (!this.ctx || !this.stems) return;
    // Catch-up clamp: after a stall or hidden-tab throttle, fast-forward the
    // grid silently instead of bursting every missed note at once.
    if (this.nextStepTime < this.ctx.currentTime - 0.05) {
      while (this.nextStepTime < this.ctx.currentTime) {
        this.nextStepTime += this.stepSeconds;
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
      this.nextStepTime += this.stepSeconds;
      this.step += 1;
      if (this.step >= STEPS_PER_BAR) {
        this.step = 0;
        this.bar += 1;
        // Bar line: the only place the world's track may change.
        if (this.pendingTrack) {
          this.track = this.pendingTrack;
          this.pendingTrack = null;
          this.distortionCurve = null; // drive is per-track
          this.buildPad();
        }
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

  private scheduleStep(step: number, rawTime: number): void {
    if (!this.ctx || !this.stems) return;
    const tr = this.track;
    const stepSecs = this.stepSeconds;
    // Swing pushes the odd 16ths late — the difference between the funk
    // world's shuffle and the arcade world's rigid grid.
    const t = step % 2 === 1 ? rawTime + stepSecs * tr.swing : rawTime;

    if (tr.kickSteps.includes(step)) this.kick(t);
    if (tr.snareSteps.includes(step)) this.snare(t, 0.5);
    if (step === 14 && this.intensity > 0.6 && this.rand() < 0.4) this.snare(t, 0.22);

    // BASS — follows the kick; the progression cycles per bar.
    if (tr.kickSteps.includes(step)) {
      const root = tr.subNotes[this.bar % tr.subNotes.length];
      this.sub808(t, root, step === 0 ? 0.5 : 0.32);
    }

    this.scheduleHats(step, t, stepSecs);

    if (tr.melodySteps.includes(step) && this.rand() < tr.melodyChance) {
      const note = tr.pluckScale[Math.floor(this.rand() * tr.pluckScale.length)];
      this.pluck(t, note);
    }

    if (tr.stabSteps.includes(step)) {
      const root = tr.subNotes[this.bar % tr.subNotes.length];
      this.stab(t, root * 4);
    }

    if (tr.guitarSteps.includes(step)) {
      const root = tr.subNotes[this.bar % tr.subNotes.length] * tr.guitarOctave;
      const accent = tr.guitarAccents.includes(step);
      // Accents ring out as a chord; everything else is a palm-muted chug.
      this.guitar(t, root, accent ? 0.34 : 0.14, accent ? 0.42 : 0.085);
    }
  }

  /**
   * Distorted power chord: root plus a fifth, driven through a waveshaper.
   * Two saws into hard clipping is what makes it read as a guitar rather
   * than a synth — the clipping generates the odd harmonics.
   */
  private guitar(t: number, freq: number, gain: number, decay: number): void {
    if (!this.ctx || !this.stems) return;
    const ctx = this.ctx;
    if (!this.distortionCurve) this.distortionCurve = makeDistortionCurve(this.track.guitarDrive);

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.distortionCurve;
    shaper.oversample = '2x';

    // Roll off the fizz above the amp's range, and the mud below it.
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    const body = ctx.createBiquadFilter();
    body.type = 'highpass';
    body.frequency.value = 90;

    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);

    shaper.connect(tone).connect(body).connect(g).connect(this.stems.guitar);

    for (const mult of [1, 1.4983]) {
      // 1.4983 = a just perfect fifth. Root + fifth = the power chord.
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq * mult;
      osc.detune.value = (this.rand() - 0.5) * 8; // two amps, never quite in tune
      osc.connect(shaper);
      osc.start(t);
      osc.stop(t + decay + 0.02);
    }
  }

  /** Hat pattern per track — each world keeps time differently. */
  private scheduleHats(step: number, t: number, stepSecs: number): void {
    const tr = this.track;
    if (tr.hatMode === 'none') return;

    if (tr.hatMode === 'offbeat') {
      // Only the "and" of each beat — the synthwave/funk pulse.
      if (step % 4 === 2) this.hat(t, 0.2 * (0.8 + this.rand() * 0.4));
      return;
    }
    if (tr.hatMode === 'four') {
      if (step % 4 === 0) this.hat(t, 0.22);
      return;
    }
    if (tr.hatMode === 'shaker') {
      // Continuous quiet 16ths — texture rather than a beat.
      this.hat(t, 0.05 + this.rand() * 0.03);
      return;
    }

    // 'trap': 8ths that become 16ths with rolls as intensity climbs.
    const sixteenths = this.intensity > 0.75;
    if (step % 2 === 0 || sixteenths) {
      const accent = step % 4 === 0 ? 0.24 : 0.13;
      this.hat(t, accent * (0.8 + this.rand() * 0.4));
      if (sixteenths && step === 12 && this.rand() < 0.5) {
        this.hat(t + stepSecs * 0.33, 0.1);
        this.hat(t + stepSecs * 0.66, 0.1);
      }
    }
  }

  // ── Voices ────────────────────────────────────────────────────────────

  private kick(t: number): void {
    if (!this.ctx || !this.stems) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const tr = this.track;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(tr.kickFrom, t);
    osc.frequency.exponentialRampToValueAtTime(tr.kickTo, t + tr.kickDecay * 0.4);
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + tr.kickDecay);
    osc.connect(g).connect(this.stems.drums);
    osc.start(t);
    osc.stop(t + tr.kickDecay + 0.03);
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
    filter.frequency.value = this.track.snareBand;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(filter).connect(g).connect(this.stems.drums);
    src.start(t);
    const tone = this.ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.value = this.track.snareTone;
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
    const tr = this.track;
    osc.type = tr.bassType;
    if (tr.bassGlide) {
      osc.frequency.setValueAtTime(freq * 1.5, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.06); // 808 dive
    } else {
      osc.frequency.setValueAtTime(freq, t);
    }
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + tr.bassDecay);
    osc.connect(g).connect(this.stems.bass);
    osc.start(t);
    osc.stop(t + tr.bassDecay + 0.05);
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
    filter.frequency.value = this.track.hatHighpass;
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
    const tr = this.track;
    osc.type = tr.pluckType;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + tr.pluckDecay);
    osc.connect(g).connect(this.stems.melody);
    osc.start(t);
    osc.stop(t + tr.pluckDecay + 0.03);
  }

  private stab(t: number, freq: number): void {
    if (!this.ctx || !this.stems) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    osc.type = this.track.stabType;
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.track.stabCutoff, t);
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
