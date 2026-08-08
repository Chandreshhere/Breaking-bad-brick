import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';
import { BOSS_SCALE, BRICK_TYPES, type BrickTypeName } from './BrickType';
import type { BrickSpec } from './LevelDirector';

export interface BrickState {
  id: number;
  type: BrickTypeName;
  meshIndex: number; // instance index within this type's InstancedMesh
  x: number;
  z: number;
  baseX: number;
  row: number;
  col: number;
  alive: boolean;
  intangible: boolean; // ghosts phase out of collision
  health: number;
  maxHealth: number;
  halfW: number; // per-brick collision extents (the boss is bigger)
  halfD: number;
}

export interface BrickHitResult {
  destroyed: boolean;
  neighbors: BrickState[]; // chain victims of an explosive death
}

interface DamageFlash {
  brick: BrickState;
  t: number;
}

function bevelledBrickGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const r = 0.07;
  const hw = w / 2 - r;
  const hd = d / 2 - r;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hd - r);
  shape.lineTo(hw, -hd - r);
  shape.absarc(hw, -hd, r, -Math.PI / 2, 0, false);
  shape.lineTo(hw + r, hd);
  shape.absarc(hw, hd, r, 0, Math.PI / 2, false);
  shape.lineTo(-hw, hd + r);
  shape.absarc(-hw, hd, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-hw - r, -hd);
  shape.absarc(-hw, -hd, r, Math.PI, Math.PI * 1.5, false);

  const bevel = 0.045;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: h - bevel * 2,
    steps: 1,
    curveSegments: 6,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bevel, 0);
  return geometry;
}

/**
 * The live brick field: one InstancedMesh per brick type (shared bevelled
 * geometry), per-brick state, and per-frame behaviours — moving rows
 * oscillate, ghosts phase in/out of tangibility, explosive cores pulse,
 * armour flashes and darkens as it takes damage.
 */
export class BrickField {
  readonly group = new THREE.Group();
  readonly states: BrickState[] = [];
  private readonly meshes = new Map<BrickTypeName, THREE.InstancedMesh>();
  private readonly damageFlashes: DamageFlash[] = [];
  private explosiveMaterial: THREE.MeshStandardMaterial | null = null;
  private ghostMaterial: THREE.MeshStandardMaterial | null = null;
  private time = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor(cfg: VisualConfig, specs: BrickSpec[]) {
    const b = cfg.game.bricks;
    const geometry = bevelledBrickGeometry(b.width, b.height, b.depth);

    // Group specs by type; one instanced mesh per type present.
    const byType = new Map<BrickTypeName, BrickSpec[]>();
    for (const spec of specs) {
      const list = byType.get(spec.type) ?? [];
      list.push(spec);
      byType.set(spec.type, list);
    }

    let id = 0;
    const white = new THREE.Color(1, 1, 1);
    for (const [type, list] of byType) {
      const def = BRICK_TYPES[type];
      const material = new THREE.MeshStandardMaterial({
        color: def.color,
        emissive: new THREE.Color(def.emissive),
        emissiveIntensity: def.emissiveIntensity,
        metalness: def.metalness,
        roughness: def.roughness,
        transparent: def.transparent ?? false,
        opacity: 1,
      });
      if (type === 'EXPLOSIVE') this.explosiveMaterial = material;
      if (type === 'GHOST') this.ghostMaterial = material;

      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      list.forEach((spec, meshIndex) => {
        const isBoss = type === 'BOSS';
        this.dummy.position.set(spec.x, 0.01, spec.z);
        this.dummy.rotation.set(0, 0, 0);
        if (isBoss) this.dummy.scale.set(BOSS_SCALE.x, BOSS_SCALE.y, BOSS_SCALE.z);
        else this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(meshIndex, this.dummy.matrix);
        mesh.setColorAt(meshIndex, white);
        this.states.push({
          id: id++,
          type,
          meshIndex,
          x: spec.x,
          z: spec.z,
          baseX: spec.x,
          row: spec.row,
          col: spec.col,
          alive: true,
          intangible: false,
          health: BRICK_TYPES[type].health,
          maxHealth: BRICK_TYPES[type].health,
          halfW: (b.width / 2) * (isBoss ? BOSS_SCALE.x : 1),
          halfD: (b.depth / 2) * (isBoss ? BOSS_SCALE.z : 1),
        });
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.meshes.set(type, mesh);
      this.group.add(mesh);
    }
  }

  meshFor(type: BrickTypeName): THREE.InstancedMesh | null {
    return this.meshes.get(type) ?? null;
  }

  aliveCount(): number {
    return this.states.reduce((count, brick) => count + (brick.alive ? 1 : 0), 0);
  }

  /**
   * Applies one hit. Armoured bricks soak hits (flash + darken); a
   * destroyed EXPLOSIVE reports its chain victims.
   */
  hit(brick: BrickState): BrickHitResult {
    brick.health -= 1;
    if (brick.health > 0) {
      this.damageFlashes.push({ brick, t: 0 });
      return { destroyed: false, neighbors: [] };
    }
    brick.alive = false;
    let neighbors: BrickState[] = [];
    if (brick.type === 'EXPLOSIVE') {
      neighbors = this.states.filter(
        (other) => other.alive && Math.hypot(other.x - brick.x, other.z - brick.z) < 1.75
      );
    }
    return { destroyed: true, neighbors };
  }

  /** Per-frame behaviours. `dt` is gameplay time (freezes in hitstop). */
  update(dt: number): void {
    this.time += dt;

    // Explosive cores pulse in unison — danger you can read at a glance.
    if (this.explosiveMaterial) {
      this.explosiveMaterial.emissiveIntensity = 0.6 + (Math.sin(this.time * 5) * 0.5 + 0.5) * 0.9;
    }

    // Ghosts phase: visible ↔ faint; intangible while faint.
    if (this.ghostMaterial) {
      const phase = Math.sin(this.time * 1.5) * 0.5 + 0.5;
      this.ghostMaterial.opacity = 0.12 + phase * 0.78;
      const tangible = this.ghostMaterial.opacity > 0.4;
      for (const brick of this.states) {
        if (brick.type === 'GHOST') brick.intangible = !tangible;
      }
    }

    // Moving rows oscillate on X (clamped by their own amplitude choice).
    const movingMesh = this.meshes.get('MOVING');
    if (movingMesh) {
      let dirty = false;
      for (const brick of this.states) {
        if (brick.type !== 'MOVING' || !brick.alive) continue;
        brick.x = brick.baseX + Math.sin(this.time * 0.9 + brick.row * 1.7) * 1.1;
        this.dummy.position.set(brick.x, 0.01, brick.z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        movingMesh.setMatrixAt(brick.meshIndex, this.dummy.matrix);
        dirty = true;
      }
      if (dirty) movingMesh.instanceMatrix.needsUpdate = true;
    }

    // Boss presence: slow menacing scale pulse.
    const bossMesh = this.meshes.get('BOSS');
    if (bossMesh) {
      for (const brick of this.states) {
        if (brick.type !== 'BOSS' || !brick.alive) continue;
        const pulse = 1 + Math.sin(this.time * 2.6) * 0.04;
        this.dummy.position.set(brick.x, 0.01, brick.z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(BOSS_SCALE.x * pulse, BOSS_SCALE.y * pulse, BOSS_SCALE.z * pulse);
        this.dummy.updateMatrix();
        bossMesh.setMatrixAt(brick.meshIndex, this.dummy.matrix);
        bossMesh.instanceMatrix.needsUpdate = true;
      }
    }

    // Armour damage flashes: white spike settling to a darkened tint.
    for (const flash of [...this.damageFlashes]) {
      flash.t += dt;
      const progress = Math.min(1, flash.t / 0.25);
      const damageTint = 0.45 + 0.55 * (flash.brick.health / flash.brick.maxHealth);
      const spike = Math.max(0, 1 - progress / 0.4);
      const value = damageTint + (2.2 - damageTint) * spike;
      this.color.setRGB(value, value, value);
      const mesh = this.meshes.get(flash.brick.type);
      if (mesh) {
        mesh.setColorAt(flash.brick.meshIndex, this.color);
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      if (progress >= 1) this.damageFlashes.splice(this.damageFlashes.indexOf(flash), 1);
    }
  }
}
