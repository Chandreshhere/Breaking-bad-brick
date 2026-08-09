import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';
import { disposeSubtree } from '../environment/materials';

export type PowerupType =
  | 'RACKET_XL'
  | 'MULTIBALL'
  | 'HEAVY_BALL'
  | 'DEFENSIVE_WALL'
  | 'SMASH'
  | 'POWER_SHOT';

export const POWERUP_TYPES: PowerupType[] = [
  'RACKET_XL',
  'MULTIBALL',
  'HEAVY_BALL',
  'DEFENSIVE_WALL',
  'SMASH',
  'POWER_SHOT',
];

interface Capsule {
  type: PowerupType;
  root: THREE.Group;
  seed: number;
}

export interface PaddleInfo {
  x: number;
  z: number;
  halfW: number;
}

/**
 * Owns bonus capsules (drop, fall, catch), effect timers, and the shield /
 * smash-beam meshes. Gameplay consequences (multiball spawns, brick kills,
 * paddle scaling) stay in Game — this class answers "what is active now".
 */
export class PowerupManager {
  readonly group = new THREE.Group();
  private capsules: Capsule[] = [];
  private capsuleDiscGeo!: THREE.CylinderGeometry;
  private capsuleRingGeo!: THREE.TorusGeometry;
  private readonly capsuleMats: Record<
    string,
    { disc: THREE.MeshStandardMaterial; ring: THREE.MeshStandardMaterial }
  > = {};
  private readonly capsulePool: {
    root: THREE.Group;
    disc: THREE.Mesh;
    ring: THREE.Mesh;
    inUse: boolean;
  }[] = [];
  private readonly shield: THREE.Mesh;
  private readonly shieldMaterial: THREE.MeshStandardMaterial;
  private readonly beam: THREE.Mesh;
  private readonly beamMaterial: THREE.MeshStandardMaterial;
  private beamLife = -1;
  private beamDuration = 0.35;
  private beamPriority = 0;
  private time = 0;
  private xlUntil = 0;
  private heavyUntil = 0;
  private shieldUntil = 0;
  private powerShotArmed = false;

  constructor(private cfg: VisualConfig) {
    this.shieldMaterial = new THREE.MeshStandardMaterial({
      color: '#3a3410',
      emissive: new THREE.Color('#ffe36e'),
      emissiveIntensity: 2.2,
      transparent: true,
      opacity: 0.85,
    });
    this.shield = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.court.playWidth + 1, 0.26, 0.12),
      this.shieldMaterial
    );
    this.shield.position.set(0, 0.16, cfg.game.powerups.shieldZ);
    this.shield.visible = false;

    this.beamMaterial = new THREE.MeshStandardMaterial({
      color: '#2c330f',
      emissive: new THREE.Color('#eaff6a'),
      emissiveIntensity: 3,
      transparent: true,
      opacity: 0,
    });
    this.beam = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.court.playWidth + 1, 0.22, 0.4),
      this.beamMaterial
    );
    this.beam.visible = false;

    this.group.add(this.shield, this.beam);
    this.buildCapsulePool();
  }

  /**
   * Capsules used to allocate a geometry and two materials per drop and
   * dispose them on pickup. Disposing a material releases its compiled
   * program, so a burst of drops meant compile / free / recompile on the
   * render thread — the hitch during a capsule storm. Geometry and one
   * material pair per bonus type are built once here and shared; drops just
   * claim a parked mesh and point it at the right materials.
   */
  private buildCapsulePool(): void {
    this.capsuleDiscGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.09, 20);
    this.capsuleRingGeo = new THREE.TorusGeometry(0.36, 0.04, 10, 32);

    for (const type of POWERUP_TYPES) {
      const color = this.cfg.game.powerups.capsuleColors[type];
      this.capsuleMats[type] = {
        disc: new THREE.MeshStandardMaterial({
          color: '#0e2c1a',
          emissive: new THREE.Color(color),
          emissiveIntensity: 1.4,
          roughness: 0.4,
        }),
        ring: new THREE.MeshStandardMaterial({
          color,
          emissive: new THREE.Color(color),
          emissiveIntensity: 2.2,
          roughness: 0.4,
        }),
      };
    }

    const first = this.capsuleMats[POWERUP_TYPES[0]];
    for (let i = 0; i < this.cfg.game.powerups.maxCapsules; i++) {
      const root = new THREE.Group();
      const disc = new THREE.Mesh(this.capsuleDiscGeo, first.disc);
      const ring = new THREE.Mesh(this.capsuleRingGeo, first.ring);
      ring.rotation.x = Math.PI / 2;
      root.add(disc, ring);
      root.visible = false;
      this.group.add(root);
      this.capsulePool.push({ root, disc, ring, inUse: false });
    }
  }

  get isXl(): boolean {
    return this.time < this.xlUntil;
  }
  get isHeavy(): boolean {
    return this.time < this.heavyUntil;
  }
  get isShieldActive(): boolean {
    return this.time < this.shieldUntil;
  }
  get isPowerShotArmed(): boolean {
    return this.powerShotArmed;
  }

  activate(type: PowerupType): void {
    const d = this.cfg.game.powerups.durations;
    if (type === 'RACKET_XL') this.xlUntil = this.time + d.racketXl;
    else if (type === 'HEAVY_BALL') this.heavyUntil = this.time + d.heavyBall;
    else if (type === 'DEFENSIVE_WALL') this.shieldUntil = this.time + d.defensiveWall;
    else if (type === 'POWER_SHOT') this.powerShotArmed = true;
    // MULTIBALL and SMASH are instantaneous — Game handles them directly.
  }

  /** True exactly once per armed shot — consumed by the next paddle hit. */
  consumePowerShot(): boolean {
    if (!this.powerShotArmed) return false;
    this.powerShotArmed = false;
    return true;
  }

  maybeDrop(x: number, z: number, force = false, chanceScale = 1): void {
    const p = this.cfg.game.powerups;
    if (!force && Math.random() > p.dropChance * chanceScale) return;
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];

    const slot = this.capsulePool.find((s) => !s.inUse);
    if (!slot) return; // pool exhausted — the screen is already saturated

    const mats = this.capsuleMats[type];
    slot.inUse = true;
    slot.disc.material = mats.disc;
    slot.ring.material = mats.ring;
    slot.root.position.set(x, 0.35, z);
    slot.root.rotation.y = 0;
    slot.root.visible = true;
    this.capsules.push({ type, root: slot.root, seed: Math.random() * Math.PI * 2 });
  }

  /** Advances capsules/visuals; returns power-ups caught by the paddle this frame. */
  update(dt: number, paddle: PaddleInfo, canCatch = true): PowerupType[] {
    this.time += dt;
    const p = this.cfg.game.powerups;
    const caught: PowerupType[] = [];

    for (const capsule of [...this.capsules]) {
      const pos = capsule.root.position;
      pos.z += p.fallSpeed * dt;
      pos.y = 0.35 + Math.sin(this.time * 5 + capsule.seed) * 0.06;
      capsule.root.rotation.y += 3 * dt;

      const caughtByPaddle =
        canCatch &&
        pos.z >= paddle.z - 0.55 &&
        pos.z <= paddle.z + 0.55 &&
        Math.abs(pos.x - paddle.x) <= paddle.halfW + 0.35;
      if (caughtByPaddle) {
        caught.push(capsule.type);
        this.removeCapsule(capsule);
      } else if (pos.z > 9.2) {
        this.removeCapsule(capsule);
      }
    }

    this.shield.visible = this.isShieldActive;
    if (this.shield.visible) {
      this.shieldMaterial.emissiveIntensity = 2.2 + Math.sin(this.time * 9) * 0.7;
    }

    if (this.beamLife >= 0) {
      this.beamLife += dt;
      const t = Math.min(1, this.beamLife / this.beamDuration);
      this.beamMaterial.opacity = Math.sin(t * Math.PI);
      this.beamMaterial.emissiveIntensity = 3 + Math.sin(t * Math.PI) * 2;
      if (this.beamLife >= this.beamDuration) {
        this.beamLife = -1;
        this.beamPriority = 0;
        this.beam.visible = false;
      }
    }

    return caught;
  }

  showBeam(z: number, color = '#eaff6a', duration = 0.35, priority = 0): void {
    // A live higher-priority beam (boss telegraph) can't be clobbered by a
    // lower-priority one (SMASH) — the warning must stay readable.
    if (this.beamLife >= 0 && this.beamPriority > priority) return;
    this.beamPriority = priority;
    this.beamMaterial.emissive.set(color);
    this.beam.position.set(0, 0.32, z);
    this.beam.visible = true;
    this.beamLife = 0;
    this.beamDuration = duration;
  }

  reset(): void {
    for (const capsule of [...this.capsules]) this.removeCapsule(capsule);
    this.xlUntil = 0;
    this.heavyUntil = 0;
    this.shieldUntil = 0;
    this.powerShotArmed = false;
    this.beamLife = -1;
    this.beam.visible = false;
    this.shield.visible = false;
  }

  /** Parks a capsule back in the pool. Shared geometry/materials survive. */
  private removeCapsule(capsule: Capsule): void {
    const slot = this.capsulePool.find((s) => s.root === capsule.root);
    if (slot) {
      slot.inUse = false;
      slot.root.visible = false;
    }
    const i = this.capsules.indexOf(capsule);
    if (i >= 0) this.capsules.splice(i, 1);
  }

  dispose(): void {
    this.reset();
    disposeSubtree(this.group);
  }
}
