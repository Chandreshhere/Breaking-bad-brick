import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';
import type { CameraRig } from '../core/CameraRig';
import { createGlowTexture } from '../game/Ball';
import type { Hud } from '../ui/Hud';
import { CameraShake } from './CameraShake';
import { ImpactLightPool } from './ImpactLights';
import { ParticlePool } from './Particles';

/**
 * Facade over the collision-feedback systems (sparks, impact glow, camera
 * shake, score pops). Gameplay code describes *what happened*; this module
 * owns how it looks.
 */
// Hoisted burst palettes — no per-hit allocations during kill chains.
const BRICK_A = new THREE.Color('#fff6c8');
const BRICK_B = new THREE.Color('#ff9a2e');
const HEAVY_A = new THREE.Color('#ffd4c0');
const HEAVY_B = new THREE.Color('#ff3c1e');
const PADDLE_A = new THREE.Color('#f2ffc9');
const PADDLE_B = new THREE.Color('#8fce4a');
const WALL_A = new THREE.Color('#ffedb0');
const WALL_B = new THREE.Color('#c98a3a');
const LOSS_A = new THREE.Color('#ffb0a0');
const LOSS_B = new THREE.Color('#8a1a0e');
const DASH_A = new THREE.Color('#eaffb0');
const DASH_B = new THREE.Color('#5f9c3f');
const ARC_A = new THREE.Color('#eaf2ff');
const ARC_B = new THREE.Color('#6a8aff');

// Original generic comic words — never IP text.
const COMIC_WORDS = ['BAM!', 'POW!', 'SMASH!', 'CRACK!', 'BOOM!'];
const COMIC_COLORS = ['#ff3ad8', '#ffd21e', '#3a7dff', '#ff5a3a', '#7dff6a'];

function comicWordTexture(word: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = 'italic 900 64px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#101020';
    ctx.strokeText(word, 128, 64);
    ctx.fillStyle = color;
    ctx.fillText(word, 128, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface ComicWordInstance {
  sprite: THREE.Sprite;
  t: number;
}

export class Vfx {
  readonly group = new THREE.Group();
  readonly shake: CameraShake;
  /** COMIC world: brick impacts slam original comic words into 3D space. */
  comicMode = false;
  private readonly particles: ParticlePool;
  private readonly impactLights: ImpactLightPool;
  private readonly projected = new THREE.Vector3();
  private readonly comicTextures = COMIC_WORDS.map((word, i) =>
    comicWordTexture(word, COMIC_COLORS[i % COMIC_COLORS.length])
  );
  private readonly comicWords: ComicWordInstance[] = [];

  constructor(
    private cfg: VisualConfig,
    private rig: CameraRig,
    private dom: HTMLElement,
    private hud: Hud,
    private pixelRatio: number
  ) {
    this.shake = new CameraShake(cfg);
    this.particles = new ParticlePool(createGlowTexture());
    this.impactLights = new ImpactLightPool(4);
    this.group.add(this.particles.points, this.impactLights.group);
  }

  brickImpact(position: THREE.Vector3, scoreText: string, heavy = false, energy = 0): void {
    const v = this.cfg.game.vfx;
    const energyScale = 1 + energy * 0.8;
    this.particles.burst(position, {
      count: Math.ceil((heavy ? v.sparkCount * 1.8 : v.sparkCount) * energyScale),
      speed: (heavy ? v.sparkSpeed * 1.4 : v.sparkSpeed) * (1 + energy * 0.3),
      size: heavy ? 0.22 : 0.16,
      life: 0.5,
      colorA: heavy ? HEAVY_A : BRICK_A,
      colorB: heavy ? HEAVY_B : BRICK_B,
      gravity: 5,
      upwardBias: 0.75,
    });
    this.impactLights.flash(position, heavy ? 22 : 14, heavy ? '#ff6a3c' : '#ffd27a');
    this.scorePop(position, scoreText);
    if (this.comicMode) this.comicWord(position, heavy);
  }

  /** Brief 3D comic word near the collision — stronger hits, bigger type. */
  private comicWord(position: THREE.Vector3, heavy: boolean): void {
    if (this.comicWords.length >= 4) return; // budget
    const texture = this.comicTextures[Math.floor(Math.random() * this.comicTextures.length)];
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
    );
    sprite.position.copy(position);
    sprite.position.y += 0.9;
    sprite.scale.set(0.01, 0.005, 1);
    sprite.userData['big'] = heavy;
    this.group.add(sprite);
    this.comicWords.push({ sprite, t: 0 });
  }

  paddleImpact(position: THREE.Vector3): void {
    const v = this.cfg.game.vfx;
    this.particles.burst(position, {
      count: Math.ceil(v.sparkCount * 0.4),
      speed: v.sparkSpeed * 0.7,
      size: 0.11,
      life: 0.35,
      colorA: PADDLE_A,
      colorB: PADDLE_B,
      gravity: 4,
      upwardBias: 0.85,
    });
    this.impactLights.flash(position, 8, '#d8e788');
  }

  wallImpact(position: THREE.Vector3): void {
    const v = this.cfg.game.vfx;
    this.particles.burst(position, {
      count: Math.ceil(v.sparkCount * 0.3),
      speed: v.sparkSpeed * 0.55,
      size: 0.09,
      life: 0.3,
      colorA: WALL_A,
      colorB: WALL_B,
      gravity: 3,
      upwardBias: 0.6,
    });
  }

  /**
   * The loss moment's world-space dressing: red impact light + ember burst.
   * Time/camera/grading impulses come from the GameFeelManager.
   */
  lifeLostCinematic(position: THREE.Vector3): void {
    this.impactLights.flash(position, 20, '#ff2a1a');
    this.particles.burst(position, {
      count: 18,
      speed: 4,
      size: 0.16,
      life: 0.6,
      colorA: LOSS_A,
      colorB: LOSS_B,
      gravity: 4,
      upwardBias: 0.7,
    });
  }

  /** COMIC level-clear signature: a big word slam with a spark shower. */
  comicBurst(position: THREE.Vector3): void {
    this.comicWord(position, true);
    this.particles.burst(position, {
      count: 30,
      speed: 6,
      size: 0.2,
      life: 0.55,
      colorA: BRICK_A,
      colorB: HEAVY_B,
      gravity: 5,
      upwardBias: 0.7,
    });
    this.impactLights.flash(position, 24, '#ffd21e');
  }

  /** Small electric crackle on a telegraphed lightning target. */
  telegraphSpark(position: THREE.Vector3): void {
    this.particles.burst(position, {
      count: 3,
      speed: 2.2,
      size: 0.09,
      life: 0.22,
      colorA: ARC_A,
      colorB: ARC_B,
      gravity: 1,
      upwardBias: 0.7,
    });
  }

  /** The lightning strike lands — electric arcs + blue-white flash. */
  lightningImpact(position: THREE.Vector3): void {
    this.particles.burst(position, {
      count: 24,
      speed: 6.5,
      size: 0.18,
      life: 0.5,
      colorA: ARC_A,
      colorB: ARC_B,
      gravity: 5,
      upwardBias: 0.65,
    });
    this.impactLights.flash(position, 26, '#aac8ff');
  }

  /** Short green streak burst at the paddle when it dashes. */
  dashBurst(position: THREE.Vector3): void {
    this.particles.burst(position, {
      count: 10,
      speed: 3.5,
      size: 0.12,
      life: 0.3,
      colorA: DASH_A,
      colorB: DASH_B,
      gravity: 2,
      upwardBias: 0.4,
    });
  }

  private scorePop(worldPosition: THREE.Vector3, text: string): void {
    this.projected.copy(worldPosition).project(this.rig.camera);
    if (this.projected.z > 1) return; // behind the camera
    const bounds = this.dom.getBoundingClientRect();
    const x = (this.projected.x * 0.5 + 0.5) * bounds.width;
    const y = (-this.projected.y * 0.5 + 0.5) * bounds.height;
    this.hud.scorePop(x, y, text);
  }

  update(dt: number): void {
    this.particles.update(dt);
    this.impactLights.update(dt);

    // Comic words: fast entrance, overshoot, settle, fade.
    for (const word of [...this.comicWords]) {
      word.t += dt;
      const big = word.sprite.userData['big'] ? 1.5 : 1;
      const t = word.t;
      let scale: number;
      if (t < 0.1) scale = (t / 0.1) * 1.3;
      else if (t < 0.2) scale = 1.3 - ((t - 0.1) / 0.1) * 0.3;
      else scale = 1;
      word.sprite.scale.set(2.2 * scale * big, 1.1 * scale * big, 1);
      const material = word.sprite.material as THREE.SpriteMaterial;
      material.opacity = t > 0.4 ? Math.max(0, 1 - (t - 0.4) / 0.2) : 1;
      if (t >= 0.6) {
        this.group.remove(word.sprite);
        material.dispose();
        this.comicWords.splice(this.comicWords.indexOf(word), 1);
      }
    }
    // World-unit → pixel scale for the point sprites.
    const heightPx = this.dom.clientHeight * this.pixelRatio;
    const fovRad = THREE.MathUtils.degToRad(this.rig.camera.fov);
    this.particles.setPixelScale(heightPx / (2 * Math.tan(fovRad / 2)));
  }

  dispose(): void {
    this.particles.dispose();
    for (const word of this.comicWords) {
      this.group.remove(word.sprite);
      (word.sprite.material as THREE.SpriteMaterial).dispose();
    }
    this.comicWords.length = 0;
    for (const texture of this.comicTextures) texture.dispose();
  }
}
