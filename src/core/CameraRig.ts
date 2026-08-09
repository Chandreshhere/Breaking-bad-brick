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
    const landscapeFov = this.effectiveFov(state.fov);
    // fitWidthFov may dolly basePosition backwards, so the camera adopts the
    // position only after the fit has run.
    this.baseFov = t > 0 ? THREE.MathUtils.lerp(landscapeFov, this.fitWidthFov(), t) : landscapeFov;
    this.camera.position.copy(this.basePosition);
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
   * The vertical FOV that keeps every point the player must see inside the
   * frame, solved rather than tuned.
   *
   * Fitting a single half-width at the target distance is not enough: under
   * a steep portrait camera the frustum is far narrower near the camera than
   * it is at the court centre, so a width that fits the far bricks still
   * lets the *paddle* — which lives at the near end — slide off the edge.
   * So the fit runs over the actual extreme corners, in camera space, and
   * takes the widest angle any of them needs.
   */
  private fitWidthFov(): number {
    const p = this.cfg.camera.portrait;
    const aspect = Math.max(this.camera.aspect, 0.001);

    // View basis from the (already blended) station.
    const forward = SCRATCH_A.copy(this.target).sub(this.basePosition).normalize();
    const right = SCRATCH_B.copy(forward).cross(WORLD_UP);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();

    // The paddle's outer edge reaches the inner wall face, and its zone runs
    // to `zoneZMax` — nearest the camera, and therefore the binding case.
    const edgeX = this.cfg.walls.innerX + p.fitMargin;
    const nearZ = this.cfg.game.paddle.zoneZMax;
    const farZ = -this.cfg.court.length / 2;

    // Widest tangent the FOV cap can express on this screen.
    const maxTanAllowed = Math.tan(THREE.MathUtils.degToRad(p.maxFov / 2)) * aspect;

    // On very narrow phones the required angle exceeds the cap, and clamping
    // there is exactly what pushed the paddle off screen. Dolly straight back
    // along the view axis instead: sliding along `forward` leaves each point's
    // lateral offset untouched and only grows its depth, so the needed
    // distance solves in closed form — and backing up distorts far less than
    // a 100-degree lens would.
    let dolly = 0;
    for (const sx of [-1, 1]) {
      for (const z of [nearZ, farZ]) {
        const v = SCRATCH_C.set(sx * edgeX, 0.2, z).sub(this.basePosition);
        const depth = v.dot(forward);
        const lateral = Math.abs(v.dot(right));
        if (depth <= 0.01) continue;
        dolly = Math.max(dolly, lateral / maxTanAllowed - depth);
      }
    }
    if (dolly > 0) this.basePosition.addScaledVector(forward, -dolly);

    let maxTan = 0;
    for (const sx of [-1, 1]) {
      for (const z of [nearZ, farZ]) {
        const v = SCRATCH_C.set(sx * edgeX, 0.2, z).sub(this.basePosition);
        const depth = v.dot(forward);
        if (depth <= 0.01) continue; // behind the camera; not a constraint
        maxTan = Math.max(maxTan, Math.abs(v.dot(right)) / depth);
      }
    }
    if (maxTan <= 0) return p.maxFov;

    const vHalf = Math.atan(maxTan / aspect);
    return Math.min(p.maxFov, THREE.MathUtils.radToDeg(vHalf) * 2);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.syncFromConfig();
  }
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const SCRATCH_A = new THREE.Vector3();
const SCRATCH_B = new THREE.Vector3();
const SCRATCH_C = new THREE.Vector3();
