import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';

// Heavy-ball warm accents — subtle shifts, never a scene takeover.
const WARM_SUN = new THREE.Color('#ff7a4a');
const WARM_FOG = new THREE.Color('#2a0f08');
const WARM_BG = new THREE.Color('#160a06');

export interface LightingState {
  /** 0..1 heavy-ball factor (from Game). */
  heavy: number;
  /** 0..1 weather darkening demand (storms). */
  weather: number;
}

/**
 * LightingDirector — lighting as independent layers that compose, with
 * hard readability floors:
 *
 *   1. BASE environment (biome sun + hemisphere fill), from config
 *   2. GAMEPLAY readability — a camera-side SpotLight over the brick
 *      field, no shadows, guaranteeing readable front faces
 *   3. WEATHER — may darken the base, clamped to the floors
 *   4. POWER-UP — additive/limited shifts (heavy ball warms, never
 *      blackens); the environment always survives
 *   5. IMPACT — short-lived flashes (ImpactLightPool, elsewhere)
 *
 * CRITICAL RULE: no state combination may push lighting below
 * cfg.lighting.floors. NORMAL / DARK / STORM / HEAVY / STORM+HEAVY must
 * all keep every brick clearly readable.
 */
export class LightingDirector {
  readonly sun: THREE.DirectionalLight;
  readonly fill: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly gameplaySpot: THREE.SpotLight;

  /** Quality-tier shadow control: 0 disables the sun's shadow entirely. */
  setShadowMapSize(size: number): void {
    this.sun.castShadow = size > 0;
    if (size > 0 && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose(); // realloc at the new size next frame
      this.sun.shadow.map = null;
    }
  }

  constructor(scene: THREE.Scene, cfg: VisualConfig, shadowMapSize = 2048) {
    this.sun = new THREE.DirectionalLight();
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 70;
    this.sun.shadow.camera.left = -22;
    this.sun.shadow.camera.right = 22;
    this.sun.shadow.camera.top = 26;
    this.sun.shadow.camera.bottom = -26;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.03;

    this.fill = new THREE.DirectionalLight();
    this.hemi = new THREE.HemisphereLight();

    // Readability layer: wide cone from the camera side onto the brick
    // field. Never casts shadows — it exists purely for front faces.
    this.gameplaySpot = new THREE.SpotLight('#fff2dd');
    this.gameplaySpot.position.set(0, 13, 13);
    this.gameplaySpot.angle = 0.62;
    this.gameplaySpot.penumbra = 0.55;
    this.gameplaySpot.decay = 0; // constant within range — a stage light
    this.gameplaySpot.distance = 45;
    this.gameplaySpot.castShadow = false;
    this.gameplaySpot.target.position.set(0, 0, -3);

    scene.add(
      this.sun,
      this.sun.target,
      this.fill,
      this.hemi,
      this.gameplaySpot,
      this.gameplaySpot.target
    );
    this.applyConfig(cfg);
  }

  /** Base (biome) values — called on config/biome changes. */
  applyConfig(cfg: VisualConfig): void {
    const l = cfg.lighting;
    this.sun.position.set(...l.sunPosition);
    this.sun.target.position.set(0, 0, 0);
    this.fill.position.set(...l.fillPosition);
    this.gameplaySpot.intensity = l.floors.gameplaySpotIntensity;
    // Colours/intensities are recomputed each frame in update() so weather
    // and power-up layers compose without destroying the base.
  }

  /**
   * Composes all layers for this frame. Base values are re-read from
   * config (biome + GUI live), then weather darkens within floors and the
   * heavy layer applies its restrained warm shift.
   */
  update(state: LightingState, scene: THREE.Scene, cfg: VisualConfig): void {
    const l = cfg.lighting;
    const floors = l.floors;
    const heavy = THREE.MathUtils.clamp(state.heavy, 0, 1);
    const weather = THREE.MathUtils.clamp(state.weather, 0, 1);

    // WEATHER layer: darkening demand, clamped to the floors.
    const sunIntensity = Math.max(floors.minSunIntensity, l.sunIntensity * (1 - weather * 0.45));
    const hemiIntensity = Math.max(
      floors.minFillIntensity,
      l.hemiIntensity * (1 - weather * 0.35)
    );

    // POWER-UP layer: heavy ball warms — capped lerps, never a takeover.
    this.sun.color.set(l.sunColor).lerp(WARM_SUN, heavy * 0.35);
    this.sun.intensity = sunIntensity;
    this.fill.color.set(l.fillColor).lerp(WARM_SUN, heavy * 0.3);
    this.fill.intensity = l.fillIntensity;
    this.hemi.color.set(l.hemiSky).lerp(WARM_SUN, heavy * 0.15);
    this.hemi.groundColor.set(l.hemiGround);
    this.hemi.intensity = hemiIntensity;

    // The readability spot never dims — if anything, it lifts slightly
    // when the rest of the scene darkens.
    this.gameplaySpot.intensity =
      floors.gameplaySpotIntensity * (1 + weather * 0.35 + heavy * 0.2);

    // Atmosphere: restrained warm shift only. Fog/background keep their
    // biome identity — heavy ball may tint, never replace.
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(cfg.fog.color).lerp(WARM_FOG, heavy * 0.3);
    }
    if (scene.background instanceof THREE.Color) {
      scene.background.set(cfg.fog.background).lerp(WARM_BG, heavy * 0.15);
    }
  }
}
