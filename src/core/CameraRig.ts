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
    this.basePosition.set(...state.position);
    this.camera.position.copy(this.basePosition);
    this.target.set(...state.target);
    this.baseFov = this.effectiveFov(state.fov);
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

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.syncFromConfig();
  }
}
