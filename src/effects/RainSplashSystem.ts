import * as THREE from 'three';
import type { RainQuality } from './RainSystem';

const POOL_SIZE = 22;
const QUALITY_ACTIVE: Record<RainQuality, number> = { LOW: 8, MEDIUM: 14, HIGH: 22 };

function ringTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface Splash {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
}

const SPLASH_LIFE = 0.32;

/**
 * Pooled ground splashes — small expanding rings where rain meets the
 * court. Probabilistic (never one per drop), rate scales with intensity
 * and quality tier. Flat quads on the court plane, additive, short-lived.
 */
export class RainSplashSystem {
  readonly group = new THREE.Group();
  private readonly pool: Splash[] = [];
  private activeLimit = POOL_SIZE;
  private enabled = false;
  private intensity = 0;

  constructor() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const texture = ringTexture();
    for (let i = 0; i < POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({ mesh, material, life: -1 });
    }
  }

  setQuality(quality: RainQuality): void {
    this.activeLimit = QUALITY_ACTIVE[quality];
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setIntensity(value: number): void {
    this.intensity = THREE.MathUtils.clamp(value, 0, 1);
  }

  update(dt: number): void {
    // Advance live splashes.
    for (const splash of this.pool) {
      if (splash.life < 0) continue;
      splash.life += dt;
      const t = splash.life / SPLASH_LIFE;
      if (t >= 1) {
        splash.life = -1;
        splash.mesh.visible = false;
        continue;
      }
      const scale = 0.12 + t * 0.5;
      splash.mesh.scale.set(scale, 1, scale);
      splash.material.opacity = 0.45 * (1 - t);
    }

    // Probabilistic spawning within the court area.
    if (!this.enabled || this.intensity <= 0.02) return;
    const spawnRate = 14 * this.intensity; // per second at full intensity
    if (Math.random() < spawnRate * dt) {
      let used = 0;
      let slot: Splash | null = null;
      for (const splash of this.pool) {
        if (splash.life >= 0) used += 1;
        else if (!slot) slot = splash;
      }
      if (slot && used < this.activeLimit) {
        slot.life = 0;
        slot.mesh.visible = true;
        slot.mesh.position.set((Math.random() - 0.5) * 13, 0.03, (Math.random() - 0.5) * 15);
      }
    }
  }
}
