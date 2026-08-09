import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';

/**
 * Game-controlled camera. No OrbitControls in production — the camera is
 * always the composition of a config-driven base state (plus, later, tiny
 * game-driven offsets like shake and FOV kicks).
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly target = new THREE.Vector3();
  /** Config-driven position — shake offsets are added on top each frame. */
  readonly basePosition = new THREE.Vector3();
  /** Config-driven (aspect-adjusted) FOV — feel punches are added on top. */
  baseFov = 40;
  /** Base orientation from lookAt — rotational shake multiplies onto this. */
  readonly baseQuaternion = new THREE.Quaternion();

  constructor(private cfg: VisualConfig, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(
      cfg.camera.states.gameplay.fov,
      aspect,
      cfg.camera.near,
      cfg.camera.far
    );
    this.syncFromConfig();
  }

  /** Re-applies the currently selected camera state from the config. */
  syncFromConfig(): void {
    const state = this.cfg.camera.states[this.cfg.camera.state];
    const p = this.cfg.camera.portrait;
    const t = this.portraitBlend();

    this.basePosition.set(...state.position);
    this.target.set(...state.target);
    if (t > 0) {
      SCRATCH_A.set(...p.position);
      SCRATCH_B.set(...p.target);
      this.basePosition.lerp(SCRATCH_A, t);
      this.target.lerp(SCRATCH_B, t);
    }
    this.camera.position.copy(this.basePosition);

    const landscapeFov = this.effectiveFov(state.fov);
    this.baseFov = t > 0 ? THREE.MathUtils.lerp(landscapeFov, this.fitWidthFov(), t) : landscapeFov;
    this.camera.fov = this.baseFov;
    this.camera.near = this.cfg.camera.near;
    this.camera.far = this.cfg.camera.far;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.target);
    this.baseQuaternion.copy(this.camera.quaternion);
  }

  /**
   * The config FOV is vertical and tuned for ~16:9. On narrow (portrait)
   * aspects a fixed vertical FOV crops the side walls off-screen, so the
   * FOV widens partway toward preserving the horizontal view instead.
   */
  private effectiveFov(baseFov: number): number {
    const REF_ASPECT = 16 / 9;
    const aspect = this.camera.aspect;
    if (aspect >= REF_ASPECT) return baseFov;
    const factor = Math.pow(REF_ASPECT / aspect, 0.55);
    const halfTan = Math.tan(THREE.MathUtils.degToRad(baseFov / 2)) * factor;
    return Math.min(66, THREE.MathUtils.radToDeg(Math.atan(halfTan)) * 2);
  }

  /**
   * 0 on a normal landscape viewport, easing to 1 once the screen is fully
   * portrait. Smoothstepped so a phone rotating through the threshold — or a
   * mobile browser collapsing its URL bar — never snaps.
   */
  private portraitBlend(): number {
    const p = this.cfg.camera.portrait;
    const raw = (p.startAspect - this.camera.aspect) / (p.startAspect - p.fullAspect);
    const k = THREE.MathUtils.clamp(raw, 0, 1);
    return k * k * (3 - 2 * k);
  }

  /**
   * The vertical FOV that makes `fitHalfWidth` span exactly half the screen
   * width from the portrait station. Solving it beats a tuned constant: the
   * court stays edge-to-edge on every phone from a 4:3 tablet to a 21:9
   * handset, instead of being framed for one device.
   */
  private fitWidthFov(): number {
    const p = this.cfg.camera.portrait;
    const dist = this.basePosition.distanceTo(this.target);
    const hHalf = Math.atan(p.fitHalfWidth / Math.max(dist, 0.001));
    const vHalf = Math.atan(Math.tan(hHalf) / Math.max(this.camera.aspect, 0.001));
    return Math.min(p.maxFov, THREE.MathUtils.radToDeg(vHalf) * 2);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.syncFromConfig();
  }
}

const SCRATCH_A = new THREE.Vector3();
const SCRATCH_B = new THREE.Vector3();
