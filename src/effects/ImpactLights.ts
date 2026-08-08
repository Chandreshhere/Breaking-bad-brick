import * as THREE from 'three';

interface ActiveLight {
  light: THREE.PointLight;
  life: number;
  maxLife: number;
  peak: number;
}

/**
 * Small pool of short-lived point lights — the local glow of an impact.
 * Reuses the oldest light when the pool is full.
 */
export class ImpactLightPool {
  readonly group = new THREE.Group();
  private readonly pool: ActiveLight[] = [];

  constructor(count = 4) {
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight('#ffd27a', 0, 5, 2);
      this.group.add(light);
      this.pool.push({ light, life: 0, maxLife: 0.28, peak: 0 });
    }
  }

  flash(position: THREE.Vector3, intensity: number, color?: string): void {
    let slot = this.pool.find((s) => s.life <= 0);
    if (!slot) {
      slot = this.pool.reduce((a, b) => (a.life < b.life ? a : b));
    }
    slot.light.position.copy(position);
    if (color) slot.light.color.set(color);
    slot.peak = intensity;
    slot.life = slot.maxLife;
  }

  update(dt: number): void {
    for (const slot of this.pool) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      const ratio = Math.max(0, slot.life / slot.maxLife);
      slot.light.intensity = slot.peak * ratio * ratio;
    }
  }
}
