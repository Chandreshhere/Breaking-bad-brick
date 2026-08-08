import * as THREE from 'three';

/**
 * Gradually wets the court while it rains: roughness drops (stronger
 * specular response) and the surface darkens slightly — never a mirror.
 * Re-attach after any stadium rebuild (the clay material is recreated).
 */
export class WetSurfaceController {
  private material: THREE.MeshStandardMaterial | null = null;
  private baseRoughness = 0.92;
  private readonly baseColor = new THREE.Color();
  private wetness = 0;

  attach(material: THREE.MeshStandardMaterial | null): void {
    this.material = material;
    if (material) {
      this.baseRoughness = material.roughness;
      this.baseColor.copy(material.color);
      // Re-apply the current wetness to the fresh material immediately.
      this.apply();
    }
  }

  update(dt: number, raining: boolean, intensity: number): void {
    const target = raining ? Math.min(1, intensity * 1.2) : 0;
    // Slow soak, slightly faster dry-off.
    const rate = target > this.wetness ? 0.18 : 0.3;
    this.wetness += (target - this.wetness) * (1 - Math.exp(-rate * dt));
    this.apply();
  }

  private apply(): void {
    if (!this.material) return;
    this.material.roughness = this.baseRoughness * (1 - this.wetness * 0.4);
    this.material.color.copy(this.baseColor).multiplyScalar(1 - this.wetness * 0.12);
  }
}
