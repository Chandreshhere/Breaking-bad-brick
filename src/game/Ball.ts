import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';

export function createGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.25, 'rgba(255, 244, 190, 0.55)');
    gradient.addColorStop(0.6, 'rgba(255, 220, 110, 0.16)');
    gradient.addColorStop(1, 'rgba(255, 200, 80, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The "moving sun": emissive sphere + additive glow sprites + a dynamic
 * PointLight that paints clay, paddle, bricks, and walls. Collision pulses
 * and an idle shimmer are driven from `update` every frame; base values are
 * re-read from config live so the GUI tunes without rebuilds.
 */
const HEAVY_LIGHT = new THREE.Color('#ff5230');
const HEAVY_EMISSIVE = new THREE.Color('#ff3a1e');

export class BallVisual {
  readonly root = new THREE.Group();
  /** 0..1 — blends toward the red heavy-ball look; driven by Game. */
  heavyFactor = 0;
  /** 1/√(live ball count) — keeps multiball from stacking into one flare. */
  countFactor = 1;
  /** 0 = whole, 1 = fully dissolved (life-lost fade / respawn-in). */
  dissolve = 0;
  /** 0..1 combo energy — hotter core, bigger presence. Never speed. */
  energy = 0;
  private readonly sphereMaterial: THREE.MeshStandardMaterial;
  private readonly light: THREE.PointLight;
  private readonly sphere: THREE.Mesh;
  private readonly innerGlow: THREE.Sprite;
  private readonly outerGlow: THREE.Sprite;
  private pulseAmount = 0;
  private time = 0;
  private active = true;

  constructor(private cfg: VisualConfig) {
    const b = cfg.game.ball;
    this.root.name = 'BallRoot';

    this.sphereMaterial = new THREE.MeshStandardMaterial({
      color: b.color,
      emissive: new THREE.Color(b.emissive),
      emissiveIntensity: b.emissiveIntensity,
      roughness: 0.35,
      metalness: 0,
      transparent: true, // dissolve fade on life loss
    });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(b.radius, 32, 16), this.sphereMaterial);
    this.sphere.castShadow = true;
    this.root.add(this.sphere);

    const glowTexture = createGlowTexture();
    const makeGlow = (scale: number, opacity: number, tint: string): THREE.Sprite => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: tint,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      sprite.scale.setScalar(b.radius * scale);
      return sprite;
    };
    this.innerGlow = makeGlow(b.innerGlowScale, 0.55, '#fff7c0');
    this.outerGlow = makeGlow(b.outerGlowScale, 0.16, '#f8e162');
    this.root.add(this.innerGlow, this.outerGlow);

    this.light = new THREE.PointLight(b.lightColor, b.lightIntensity, b.lightDistance, 2);
    this.light.name = 'BallLight';
    this.root.add(this.light);
  }

  /**
   * Parks or wakes a pooled ball.
   *
   * Critically, this never touches `root.visible` and never detaches the
   * light. Three.js keys every material's compiled program on the number of
   * lights in the scene, and it skips invisible subtrees when it gathers
   * them — so hiding the root, like adding or removing the ball outright,
   * changes the light count and forces *every* material in the stadium to
   * recompile. That recompile is the multiball freeze. Parked balls keep
   * their light in the scene at zero intensity, which costs nothing to
   * render and keeps the program cache stable.
   */
  setActive(on: boolean): void {
    this.active = on;
    this.sphere.visible = on;
    this.innerGlow.visible = on;
    this.outerGlow.visible = on;
    if (!on) {
      this.light.intensity = 0;
      this.pulseAmount = 0;
      this.dissolve = 0;
      this.heavyFactor = 0;
      this.energy = 0;
    }
  }

  /** Kick the glow — bricks hit hardest, walls softest. */
  pulse(strength: number): void {
    this.pulseAmount = Math.min(1.5, this.pulseAmount + strength);
  }

  update(dt: number): void {
    if (!this.active) {
      this.light.intensity = 0;
      return;
    }
    const b = this.cfg.game.ball;
    const heavy = this.cfg.game.powerups.heavy;
    const h = this.heavyFactor;
    this.time += dt;
    this.pulseAmount *= Math.exp(-b.pulseDecay * dt);

    const alive = 1 - THREE.MathUtils.clamp(this.dissolve, 0, 1);
    const energyBoost = 1 + this.energy * 0.28; // hot, not blinding
    const shimmer = 1 + Math.sin(this.time * (6.3 + this.energy * 4)) * (0.05 + this.energy * 0.03);
    const heavyLight = 1 + h * (heavy.lightScale - 1);
    this.light.intensity =
      b.lightIntensity *
      shimmer *
      (1 + this.pulseAmount * 1.6) *
      heavyLight *
      this.countFactor *
      alive *
      energyBoost;
    this.light.distance = b.lightDistance;
    this.light.color.set(b.lightColor).lerp(HEAVY_LIGHT, h);
    this.sphereMaterial.emissiveIntensity =
      b.emissiveIntensity * (1 + this.pulseAmount * 0.9) * energyBoost;
    this.sphereMaterial.emissive.set(b.emissive).lerp(HEAVY_EMISSIVE, h);
    this.sphereMaterial.opacity = alive;
    this.root.scale.setScalar(
      THREE.MathUtils.lerp(1, heavy.radiusScale, h) * (0.35 + 0.65 * alive)
    );

    const glowPulse = shimmer * (1 + this.pulseAmount * 0.3);
    this.innerGlow.scale.setScalar(b.radius * b.innerGlowScale * glowPulse);
    this.outerGlow.scale.setScalar(b.radius * b.outerGlowScale * glowPulse);
    const opacityFactor = Math.sqrt(this.countFactor) * alive;
    (this.innerGlow.material as THREE.SpriteMaterial).opacity = 0.55 * opacityFactor;
    (this.outerGlow.material as THREE.SpriteMaterial).opacity = 0.16 * opacityFactor;
  }
}
