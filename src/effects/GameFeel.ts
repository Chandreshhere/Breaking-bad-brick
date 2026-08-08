import type { AudioFx } from '../audio/AudioFx';
import type { VisualConfig } from '../config/visual.config';
import type { CameraRig } from '../core/CameraRig';
import type { Hud } from '../ui/Hud';
import type { CameraShake } from './CameraShake';
import type { PostProcessing } from './PostProcessing';

export type ImpactPreset = 'TINY' | 'NORMAL' | 'HEAVY' | 'CRITICAL' | 'BOSS';

/**
 * The single owner of every game-feel impulse: hitstop, time scale, camera
 * shake and FOV punches, screen flash, vignette/bloom/aberration pulses,
 * damage grading, UI punch, and bass transients. Gameplay code describes an
 * impact ("NORMAL", "CRITICAL"); this manager composes concurrent impulses
 * and is the only writer of camera FOV and post-processing values — no
 * other system touches them directly.
 *
 * Everything decays to neutral. Nothing here is ever permanently on.
 */
export class GameFeelManager {
  private hitstopTimer = 0;
  private timeScale = 1;
  private flash = 0;
  private redEdge = 0;
  private saturation = 1;
  private aberration = 0;
  private bloomPulse = 0;
  private vignettePulse = 0;
  private fovOffset = 0;
  /** Sustained glow (0..1) — overdrive holds this while active. */
  sustainedBloom = 0;
  // Rapid impact chains (heavy ball ploughing a row) must not stack
  // hitstops — repeated 50ms freezes read as lag, not punch.
  private hitstopCooldown = 0;

  constructor(
    private cfg: VisualConfig,
    private rig: CameraRig,
    private post: PostProcessing,
    // (post is swapped by quality-tier changes via setPost below)
    private hud: Hud,
    private audio: AudioFx,
    private shake: CameraShake
  ) {}

  /** Quality-tier changes rebuild the composer — adopt the new instance. */
  setPost(post: PostProcessing): void {
    this.post = post;
  }

  /** Fire a preset impact. Concurrent impacts compose (max/add with clamps). */
  impact(name: ImpactPreset): void {
    const p = this.cfg.game.feel.impacts[name];
    // Hitstop only lands if the previous one has breathed out — chains keep
    // their flashes/shake but the clock stops at most ~4×/second.
    if (p.hitstop > 0 && this.hitstopCooldown <= 0) {
      this.hitstopTimer = Math.max(this.hitstopTimer, p.hitstop);
      this.hitstopCooldown = 0.26;
    }
    if (p.slowmo > 0) this.timeScale = Math.min(this.timeScale, 1 - p.slowmo);
    // Violent presets (long hitstop) get a sharp directional kick too.
    if (p.shake > 0) this.shake.impulse(p.shake, p.hitstop >= 0.05);
    this.flash = Math.min(1, this.flash + p.flash);
    this.aberration = Math.min(1, this.aberration + p.aberration);
    this.bloomPulse = Math.min(1.2, this.bloomPulse + p.bloom);
    this.vignettePulse = Math.min(1, this.vignettePulse + p.vignette);
    this.fovOffset = Math.min(4.5, this.fovOffset + p.fov);
    if (p.ui > 0) this.hud.punchScore(p.ui);
    if (p.bass > 0) this.audio.bassThump(p.bass);
  }

  /** Red-edge + desaturation pulse — player damage (life lost). */
  damagePulse(): void {
    this.redEdge = 1;
    this.saturation = 0.35;
  }

  /** Bare screen flash (lightning, transitions) without a full impact. */
  flashPulse(amount: number): void {
    this.flash = Math.min(1, this.flash + amount);
  }

  hitstop(seconds: number): void {
    this.hitstopTimer = Math.max(this.hitstopTimer, seconds);
  }

  slowmo(scale: number): void {
    this.timeScale = Math.min(this.timeScale, scale);
  }

  /**
   * Advances the time-control state with the real frame dt and returns the
   * scaled gameplay dt (0 during hitstop). Call once per frame from the
   * game loop before stepping gameplay.
   */
  step(dt: number): number {
    this.hitstopCooldown -= dt;
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return 0;
    }
    this.timeScale += (1 - this.timeScale) * (1 - Math.exp(-2.5 * dt));
    return dt * this.timeScale;
  }

  /** Decays all impulses and pushes them to camera + post. Real dt. */
  applyFrame(dt: number): void {
    this.flash *= Math.exp(-14 * dt);
    this.aberration *= Math.exp(-5 * dt);
    this.bloomPulse *= Math.exp(-6 * dt);
    this.vignettePulse *= Math.exp(-4 * dt);
    this.fovOffset *= Math.exp(-8 * dt);
    this.redEdge *= Math.exp(-2.0 * dt);
    this.saturation += (1 - this.saturation) * (1 - Math.exp(-1.8 * dt));

    this.post.applyImpulses(
      {
        flash: this.flash,
        redEdge: this.redEdge,
        saturation: this.saturation,
        aberration: this.aberration,
        bloomPulse: this.bloomPulse + this.sustainedBloom * 0.25,
        vignettePulse: this.vignettePulse,
      },
      this.cfg
    );

    const camera = this.rig.camera;
    // FOV punches respect the screen-shake accessibility setting too.
    const shakeSetting = this.cfg.accessibility.screenShake;
    const fovScale = shakeSetting === 'OFF' ? 0 : shakeSetting === 'REDUCED' ? 0.5 : 1;
    const fov = this.rig.baseFov + this.fovOffset * fovScale;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  reset(): void {
    this.hitstopTimer = 0;
    this.timeScale = 1;
    this.sustainedBloom = 0;
    this.flash = 0;
    this.redEdge = 0;
    this.saturation = 1;
    this.aberration = 0;
    this.bloomPulse = 0;
    this.vignettePulse = 0;
    this.fovOffset = 0;
  }
}
