import * as THREE from 'three';
import type { AudioFx } from '../audio/AudioFx';
import type { WeatherModeName } from '../environment/EnvironmentDirector';
import { RainSplashSystem } from './RainSplashSystem';
import { RainSystem, type RainQuality } from './RainSystem';

const MAX_PARTICLES = 600;

interface ModeParams {
  color: THREE.Color;
  size: number;
  baseCount: number;
  spawnY: [number, number];
  velocityY: [number, number];
  drift: number;
  rising: boolean;
}

// Point particles serve the "soft mote" weathers — embers rising, data
// symbols and confetti drifting down. Rain uses the dedicated streaks.
const MODE_PARAMS: Partial<Record<WeatherModeName, ModeParams>> = {
  EMBERS: {
    color: new THREE.Color('#ff8a3a'),
    size: 0.075,
    baseCount: 180,
    spawnY: [0, 0.4],
    velocityY: [0.7, 1.6],
    drift: 0.5,
    rising: true,
  },
  DATA: {
    color: new THREE.Color('#47e0ff'),
    size: 0.06,
    baseCount: 220,
    spawnY: [8, 12],
    velocityY: [-1.1, -2.2],
    drift: 0.2,
    rising: false,
  },
  CONFETTI: {
    color: new THREE.Color('#ffd21e'),
    size: 0.07,
    baseCount: 150,
    spawnY: [8, 12],
    velocityY: [-0.8, -1.6],
    drift: 1.6,
    rising: false,
  },
};

/**
 * Continuous ambient weather, independent of the EnvironmentDirector: one
 * recycled GPU point cloud (rain streaks fall, embers rise), plus
 * procedural lightning for THUNDERSTORM — a jagged additive bolt behind
 * the arena, a screen flash through the GameFeelManager, and thunder
 * delayed by apparent distance. `intensity` (0..1) scales density and
 * strike frequency; heavy gameplay moments can push it up.
 */
export class WeatherManager {
  readonly group = new THREE.Group();
  private mode: WeatherModeName = 'CLEAR';
  private intensity = 0;
  private readonly points: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly active: boolean[] = new Array(MAX_PARTICLES).fill(false);
  private strikeTimer = 6;
  readonly rain = new RainSystem();
  readonly splashes = new RainSplashSystem();
  /** Set by Experience — the LightningDirector answers strike requests. */
  onStrikeRequested: ((forceGameplay: boolean) => void) | null = null;

  constructor(private audio: AudioFx) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.velocities = new Float32Array(MAX_PARTICLES * 3);
    this.material = new THREE.PointsMaterial({
      color: '#ffffff',
      size: 0.06,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.group.add(this.points);

    this.group.add(this.rain.mesh, this.splashes.group);
  }

  get currentMode(): WeatherModeName {
    return this.mode;
  }

  setQuality(quality: RainQuality): void {
    this.rain.setQuality(quality);
    this.splashes.setQuality(quality);
  }

  setMode(mode: WeatherModeName, baseIntensity: number): void {
    this.mode = mode;
    this.intensity = baseIntensity;

    const raining = mode === 'RAIN' || mode === 'THUNDERSTORM';
    this.rain.setEnabled(raining);
    this.splashes.setEnabled(raining);
    // Storm rain slants hard; ordinary rain barely. Transitions smooth.
    this.rain.setWindTarget(mode === 'THUNDERSTORM' ? 0.17 : 0.06, 0.02);

    const params = MODE_PARAMS[mode];
    this.points.visible = !!params;
    if (params) {
      this.material.color.copy(params.color);
      this.material.size = params.size;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        this.active[i] = false;
        this.positions[i * 3 + 1] = -100;
      }
    } else {
      this.active.fill(false);
    }
    this.strikeTimer = 4 + Math.random() * 6;
  }

  /** Adds gameplay tension on top of the biome's base intensity. */
  setIntensity(value: number): void {
    this.intensity = Math.min(1, Math.max(0, value));
  }

  /** How much this weather mode wants to darken the scene (0..1). The
   * LightingDirector clamps the result to its readability floors. */
  get darkening(): number {
    if (this.mode === 'THUNDERSTORM') return 1;
    if (this.mode === 'RAIN') return 0.5;
    return 0;
  }

  /** Gameplay moments (overdrive entry) can demand a targeted strike. */
  forceStrike(): void {
    if (this.mode === 'THUNDERSTORM') this.onStrikeRequested?.(true);
  }

  update(dt: number): void {
    // Rain streaks + splashes + audio bed (self-gating on enabled state).
    const raining = this.mode === 'RAIN' || this.mode === 'THUNDERSTORM';
    this.rain.setIntensity(this.intensity);
    this.rain.update(dt);
    this.splashes.setIntensity(this.intensity);
    this.splashes.update(dt);
    this.audio.setRainIntensity(raining ? this.intensity : 0);
    if (raining && Math.random() < dt * this.intensity * 2.5) this.audio.rainDrop();

    if (this.mode === 'THUNDERSTORM') {
      this.strikeTimer -= dt * (0.6 + this.intensity);
      if (this.strikeTimer <= 0) {
        this.onStrikeRequested?.(false);
        this.strikeTimer = 7 + Math.random() * 11;
      }
    }

    const params = MODE_PARAMS[this.mode];
    if (!params) return;
    const targetCount = Math.floor(params.baseCount * (0.35 + this.intensity * 0.65));

    let activeCount = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) if (this.active[i]) activeCount += 1;

    // Spawn toward the target density.
    let toSpawn = Math.min(24, targetCount - activeCount);
    for (let i = 0; i < MAX_PARTICLES && toSpawn > 0; i++) {
      if (this.active[i]) continue;
      this.spawn(i, params);
      toSpawn -= 1;
    }

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!this.active[i]) continue;
      const i3 = i * 3;
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;
      const y = this.positions[i3 + 1];
      if ((params.rising && y > 6.5) || (!params.rising && y < 0.05)) {
        this.active[i] = false;
        this.positions[i3 + 1] = -100;
      }
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private spawn(index: number, params: ModeParams): void {
    const i3 = index * 3;
    this.active[index] = true;
    this.positions[i3] = (Math.random() - 0.5) * 26;
    this.positions[i3 + 1] =
      params.spawnY[0] + Math.random() * (params.spawnY[1] - params.spawnY[0]);
    this.positions[i3 + 2] = (Math.random() - 0.5) * 30;
    this.velocities[i3] = (Math.random() - 0.5) * params.drift;
    this.velocities[i3 + 1] =
      params.velocityY[0] + Math.random() * (params.velocityY[1] - params.velocityY[0]);
    this.velocities[i3 + 2] = (Math.random() - 0.5) * params.drift;
  }
}
