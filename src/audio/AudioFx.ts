/**
 * Fully procedural audio — Web Audio oscillators and filtered noise, no
 * sample files (the project's no-external-assets rule applies to sound
 * too). The context is created/resumed on the first user gesture.
 */
export class AudioFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private muted = false;
  private sfxScale = 0.7;
  private rainHiss: GainNode | null = null;
  private rainWash: GainNode | null = null;
  private rainSources: AudioBufferSourceNode[] = [];
  private readonly lastVoice = new Map<string, number>();

  /** Rate-limits a voice — impact chains must not flood the audio graph. */
  private throttled(key: string, minInterval: number): boolean {
    if (!this.ctx) return true;
    const now = this.ctx.currentTime;
    const last = this.lastVoice.get(key) ?? -1;
    if (now - last < minInterval) return true;
    this.lastVoice.set(key, now);
    return false;
  }

  /** The live context, if unlocked — the music engine builds on it. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** The pre-duck master bus — routing music here inherits duck + low-pass. */
  get bus(): GainNode | null {
    return this.master;
  }

  /** Call from inside a user-gesture handler (button click, key press). */
  unlock(): void {
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ??
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.lowpass = this.ctx.createBiquadFilter();
      this.lowpass.type = 'lowpass';
      this.lowpass.frequency.value = 18000;
      this.master.connect(this.lowpass).connect(this.ctx.destination);
    }
    void this.ctx.resume();
  }

  setSfxVolume(volume: number): void {
    this.sfxScale = Math.min(1, Math.max(0, volume));
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx && this.master && this.lowpass) {
      // A pending duck() ramp would otherwise override the mute later.
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.muted ? 0 : 0.35, t);
      this.lowpass.frequency.cancelScheduledValues(t);
      this.lowpass.frequency.setValueAtTime(18000, t);
    }
    return this.muted;
  }

  /**
   * Silences everything while the app is backgrounded.
   *
   * Suspending the context rather than muting the gain: a suspended context
   * stops scheduling work entirely, so the music scheduler and every decaying
   * envelope freeze instead of running unheard behind another app.
   */
  async setSuspended(suspended: boolean): Promise<void> {
    if (!this.ctx) return;
    try {
      if (suspended && this.ctx.state === 'running') await this.ctx.suspend();
      else if (!suspended && this.ctx.state === 'suspended') await this.ctx.resume();
    } catch {
      /* context already closed */
    }
  }

  dispose(): void {
    for (const src of this.rainSources) src.stop();
    this.rainSources = [];
    this.rainHiss = null;
    this.rainWash = null;
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slideTo?: number,
    delay = 0
  ): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(gain * this.sfxScale * 1.4, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, gain: number, cutoff: number, delay = 0): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain * this.sfxScale * 1.4, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }

  click(): void {
    this.tone(700, 0.05, 'sine', 0.2);
  }

  serve(): void {
    this.noise(0.22, 0.22, 1400);
    this.tone(320, 0.16, 'sine', 0.2, 540);
  }

  dash(): void {
    this.noise(0.16, 0.22, 2600);
    this.tone(280, 0.14, 'sine', 0.22, 540);
  }

  paddle(): void {
    this.tone(210, 0.08, 'triangle', 0.5, 165);
    this.noise(0.05, 0.12, 2500);
  }

  wall(): void {
    this.tone(150, 0.06, 'sine', 0.3, 130);
  }

  brick(heavy: boolean): void {
    if (this.throttled('brick', 0.07)) return;
    if (heavy) {
      this.tone(130, 0.2, 'sawtooth', 0.5, 55);
      this.noise(0.16, 0.3, 900);
    } else {
      this.tone(520, 0.1, 'square', 0.28, 310);
      this.noise(0.07, 0.18, 3200);
    }
  }

  shield(): void {
    this.tone(320, 0.1, 'sine', 0.4, 430);
  }

  /** Metallic clink — armour soaked the hit. */
  armor(): void {
    if (this.throttled('armor', 0.06)) return;
    this.tone(950, 0.05, 'square', 0.16, 760);
    this.tone(1500, 0.04, 'square', 0.1, 1150, 0.02);
  }

  explosion(): void {
    if (this.throttled('explosion', 0.09)) return;
    this.noise(0.35, 0.4, 900);
    this.bassThump(0.9);
  }

  /** Continuous layered rain bed: high hiss + low wash, gain-driven. */
  private ensureRainLayers(): void {
    if (!this.ctx || !this.master || this.rainHiss) return;
    const length = Math.floor(this.ctx.sampleRate * 2);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    const makeLayer = (type: BiquadFilterType, freq: number): GainNode => {
      const src = this.ctx!.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = this.ctx!.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      const gain = this.ctx!.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master!);
      src.start();
      this.rainSources.push(src);
      return gain;
    };
    this.rainHiss = makeLayer('highpass', 3800);
    this.rainWash = makeLayer('lowpass', 420);
  }

  /** Follows WeatherManager intensity; 0 fades the bed out. */
  setRainIntensity(intensity: number): void {
    if (!this.ctx) return;
    if (intensity > 0.01) this.ensureRainLayers();
    if (!this.rainHiss || !this.rainWash) return;
    const t = this.ctx.currentTime;
    this.rainHiss.gain.setTargetAtTime(0.05 * intensity, t, 0.6);
    this.rainWash.gain.setTargetAtTime(0.055 * intensity, t, 0.6);
  }

  /** A single close raindrop plink — spawned probabilistically. */
  rainDrop(): void {
    this.tone(1300 + Math.random() * 900, 0.03, 'sine', 0.05, 650);
  }

  /**
   * Thunder with real structure: a sharp broadband CRACK at the front
   * (strong for near strikes, softened by distance), then the mid-band
   * body, then a long low rumble tail. `delay` is the light→sound gap —
   * near-zero for gameplay strikes, up to ~1.2s for horizon bolts.
   */
  thunder(delay: number, gain = 0.35): void {
    const near = Math.max(0, 1 - delay); // closer strike → harder crack
    this.noise(0.14, gain * (0.5 + near * 0.7), 3600, delay);
    this.noise(2.1, gain, 300, delay + 0.05);
    this.tone(48, 2.3, 'sine', gain * 0.85, 34, delay + 0.1);
    this.tone(64, 1.5, 'sine', gain * 0.4, 46, delay + 0.4);
  }

  /** Rising electrical charge — a lightning telegraph is building. */
  chargeUp(duration: number): void {
    this.tone(180, duration, 'sawtooth', 0.1, 1200);
    this.tone(90, duration, 'sine', 0.12, 400);
  }

  /** Boss laser hit — paddle stunned. */
  zap(): void {
    this.tone(420, 0.28, 'sawtooth', 0.35, 70);
    this.noise(0.2, 0.25, 1600);
  }

  powerup(): void {
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.28, undefined, i * 0.07));
  }

  /** Rising tier sting — pitch scales with the tier reached. */
  comboTier(tier: number): void {
    const base = 440 * Math.pow(1.25, tier);
    [base, base * 1.25, base * 1.5].forEach((f, i) =>
      this.tone(f, 0.08, 'triangle', 0.25, undefined, i * 0.05)
    );
  }

  overdrive(): void {
    this.tone(220, 0.5, 'sawtooth', 0.3, 880);
    this.noise(0.4, 0.25, 3000);
    this.bassThump(1);
    [660, 880, 1100].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.22, undefined, 0.15 + i * 0.08));
  }

  powerShot(): void {
    this.tone(180, 0.25, 'sawtooth', 0.4, 720);
    this.noise(0.2, 0.25, 2000);
  }

  lifeLost(): void {
    [392, 311, 233].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.32, undefined, i * 0.13));
  }

  /** Low-frequency transient layered under heavy/critical impacts. */
  bassThump(strength: number): void {
    if (this.throttled('bass', 0.12)) return;
    this.tone(66, 0.28, 'sine', 0.45 * strength, 44);
  }

  /** Deep sub-frequency hit for the loss moment itself. */
  lifeLostImpact(): void {
    this.tone(58, 0.5, 'sine', 0.7, 40);
    this.tone(120, 0.25, 'triangle', 0.4, 60);
    this.noise(0.3, 0.35, 260);
  }

  /** Ducks everything and closes the low-pass, recovering after `hold` s. */
  duck(hold: number): void {
    if (!this.ctx || !this.master || !this.lowpass || this.muted) return;
    const t0 = this.ctx.currentTime;
    const gain = this.master.gain;
    const freq = this.lowpass.frequency;
    gain.cancelScheduledValues(t0);
    freq.cancelScheduledValues(t0);
    gain.setValueAtTime(gain.value, t0);
    gain.linearRampToValueAtTime(0.1, t0 + 0.06);
    gain.setValueAtTime(0.1, t0 + hold);
    gain.linearRampToValueAtTime(0.35, t0 + hold + 0.9);
    freq.setValueAtTime(freq.value, t0);
    freq.exponentialRampToValueAtTime(500, t0 + 0.08);
    freq.setValueAtTime(500, t0 + hold);
    freq.exponentialRampToValueAtTime(18000, t0 + hold + 0.9);
  }

  win(): void {
    [523, 659, 784, 1046].forEach((f, i) =>
      this.tone(f, 0.3, 'triangle', 0.28, undefined, i * 0.1)
    );
  }

  gameOver(): void {
    [330, 262, 196, 147].forEach((f, i) =>
      this.tone(f, 0.32, 'triangle', 0.3, undefined, i * 0.15)
    );
  }
}
