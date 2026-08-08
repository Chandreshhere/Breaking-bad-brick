import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';

export type ShakeSetting = 'FULL' | 'REDUCED' | 'OFF';

const SETTING_SCALE: Record<ShakeSetting, number> = { FULL: 1, REDUCED: 0.4, OFF: 0 };

/**
 * Trauma-based cinematic shake. Events add trauma (0..1); magnitude
 * follows trauma², so small hits barely register while big ones kick.
 *
 * Three separated channels, all driven by smooth procedural noise (summed
 * incommensurate sines — continuous, never per-frame randomness):
 *   - POSITIONAL: low-frequency body sway + high-frequency micro vibration
 *   - ROTATIONAL: small roll/pitch/yaw
 *   - sharp KICK: an instant directional impulse for violent events
 *     (lightning, boss hits) that decays fast into the ambient shake
 *
 * FOV punches live in the GameFeelManager. The accessibility setting
 * (FULL / REDUCED / OFF) scales everything here.
 */
export class CameraShake {
  setting: ShakeSetting = 'FULL';
  /** Radians — applied on top of the rig's base orientation. */
  readonly rotationOffset = new THREE.Euler();
  private trauma = 0;
  private time = 0;
  private readonly offset = new THREE.Vector3();
  private readonly kick = new THREE.Vector3();

  constructor(private cfg: VisualConfig) {}

  /** `sharp` adds an instant directional jolt on top of the trauma. */
  impulse(amount: number, sharp = false): void {
    this.trauma = Math.min(1, this.trauma + amount);
    if (sharp && this.setting !== 'OFF') {
      const angle = Math.random() * Math.PI * 2;
      this.kick.x += Math.cos(angle) * amount * 0.4;
      this.kick.y += Math.abs(Math.sin(angle)) * amount * 0.25;
    }
  }

  update(dt: number): THREE.Vector3 {
    const shake = this.cfg.game.vfx.shake;
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - shake.decay * dt);
    this.kick.multiplyScalar(Math.exp(-14 * dt));

    const scale = SETTING_SCALE[this.setting];
    const strength = this.trauma * this.trauma * shake.amplitude * scale;
    const t = this.time;

    // Low-frequency body sway.
    const swayX = Math.sin(t * 37.1) + 0.6 * Math.sin(t * 59.3);
    const swayY = Math.sin(t * 41.7 + 1.3) + 0.5 * Math.sin(t * 67.9);
    const swayZ = Math.sin(t * 29.3 + 2.1);
    // High-frequency micro vibration — the "rattle" layer.
    const microX = Math.sin(t * 143.7 + 0.7);
    const microY = Math.sin(t * 131.1 + 2.9);

    this.offset.set(
      (swayX + microX * 0.35) * strength + this.kick.x * scale,
      (swayY + microY * 0.35) * strength * 0.6 + this.kick.y * scale,
      swayZ * strength * 0.4
    );

    // Rotational shake: subtle roll dominates, tiny pitch/yaw. Clamped so
    // the game never becomes unreadable.
    const rotStrength = Math.min(0.016, this.trauma * this.trauma * 0.016) * scale;
    this.rotationOffset.set(
      Math.sin(t * 47.3 + 0.9) * rotStrength * 0.5,
      Math.sin(t * 39.1 + 1.7) * rotStrength * 0.35,
      (Math.sin(t * 53.7) + 0.5 * Math.sin(t * 91.3)) * rotStrength
    );

    return this.offset;
  }
}
