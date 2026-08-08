import * as THREE from 'three';
import type { CameraRig } from '../core/CameraRig';

/**
 * Pointer input: click & hold to move (the pointer is raycast onto the court
 * plane and drives the paddle's target X), tap/Space fires `onPrimary`
 * (serve, restart). Touch and mouse share the pointer-event path.
 */
export class Input {
  /** World-space X the paddle should chase, or null when the pointer is up. */
  targetX: number | null = null;
  /** World-space Z the paddle should chase (screen up/down), or null when up. */
  targetZ: number | null = null;
  onPrimary: (() => void) | null = null;
  onDash: (() => void) | null = null;

  private isDown = false;
  private lastTapTime = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();

  constructor(
    private dom: HTMLElement,
    private rig: CameraRig
  ) {
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  private updateTarget(e: PointerEvent): void {
    const bounds = this.dom.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((e.clientY - bounds.top) / bounds.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.rig.camera);
    if (this.raycaster.ray.intersectPlane(this.plane, this.hit)) {
      this.targetX = this.hit.x;
      this.targetZ = this.hit.z;
    }
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button === 2) {
      // right-click = dash (context menu is already suppressed)
      this.onDash?.();
      return;
    }
    const now = performance.now();
    if (now - this.lastTapTime < 300) this.onDash?.(); // mobile double-tap
    this.lastTapTime = now;

    this.isDown = true;
    this.updateTarget(e);
    this.onPrimary?.();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.isDown) this.updateTarget(e);
  };

  private onPointerUp = (): void => {
    this.isDown = false;
    this.targetX = null;
    this.targetZ = null;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === ' ') this.onPrimary?.();
    else if (e.key === 'Shift') this.onDash?.();
  };

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.dom.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
  }
}
