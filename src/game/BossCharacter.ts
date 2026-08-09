import * as THREE from 'three';
import type { BiomeName } from '../environment/EnvironmentDirector';

/**
 * The boss, as a giant rival player rather than a purple block.
 *
 * Gameplay is untouched — the BOSS brick is still the collision box, the HP
 * and the phase source. This is purely the body that stands in its place, so
 * nothing here may affect physics. It reads the boss's state each frame and
 * performs it: stalking the ball, winding up, swinging on the smash,
 * recoiling on damage, escalating per phase, collapsing on defeat.
 *
 * Deliberately stylised and faceted. A procedural humanoid that reaches for
 * realism lands as a mannequin; a chunky, glowing, low-poly athlete reads as
 * a character on purpose.
 *
 * Every world fields its own rival. The skeleton and animation are shared —
 * only the palette, the glow and one signature accessory change — and every
 * accessory is built up front and toggled by visibility, never added or
 * removed at runtime.
 */

export interface BossLook {
  name: string;
  kit: string;
  trim: string;
  limb: string;
  /** Emissive strength on the kit itself. High = the body glows. */
  kitGlow: number;
  trimGlow: number;
  eye: string;
  aura: string;
  /** Hair colour; '' for the helmeted/synthetic rivals. */
  hair: string;
  /** Shorts, so the kit isn't one flat colour. */
  shorts: string;
  /**
   * Master on the aura and eye glare. 0 = a real athlete under stadium
   * lights with no rim glow at all; 1 = the neon worlds' full halo.
   */
  glow: number;
  /** Which signature part this rival wears. */
  crest: 'none' | 'pads' | 'rings' | 'pixels' | 'cape';
  /** Extra bulk on the torso — heavier rivals read as heavier fights. */
  bulk: number;
}

export const BOSS_LOOKS: Record<BiomeName, BossLook> = {
  CLAY: {
    name: 'THE CHAMPION',
    kit: '#f4f2ea',
    trim: '#2f6b45',
    limb: '#c98d5e',
    kitGlow: 0,
    trimGlow: 0.05,
    eye: '#20303a',
    aura: '#ffffff',
    hair: '#2b2118',
    shorts: '#e9e6dc',
    glow: 0,
    crest: 'none',
    bulk: 1,
  },
  NEON: {
    name: 'THE CIRCUIT',
    kit: '#0d1420',
    trim: '#4fc3ff',
    limb: '#16283a',
    kitGlow: 0.05,
    trimGlow: 2.4,
    eye: '#8ef0ff',
    aura: '#4fc3ff',
    hair: '',
    shorts: '#0a1018',
    glow: 0.9,
    crest: 'none',
    bulk: 0.95,
  },
  HELL: {
    name: 'THE CINDER',
    kit: '#2a1410',
    trim: '#ff5a1a',
    limb: '#3d1a12',
    kitGlow: 0.35,
    trimGlow: 2.6,
    eye: '#ffd08a',
    aura: '#ff3a12',
    hair: '',
    shorts: '#1d0d0a',
    glow: 1,
    crest: 'pads',
    bulk: 1.2,
  },
  LOTUS_OS: {
    name: 'THE CONSTRUCT',
    kit: '#0f3a44',
    trim: '#35e0ff',
    limb: '#12525e',
    kitGlow: 0.5,
    trimGlow: 2.2,
    eye: '#ffffff',
    aura: '#35e0ff',
    hair: '',
    shorts: '#0b2c34',
    glow: 1,
    crest: 'rings',
    bulk: 0.9,
  },
  NEON_ARCADE: {
    name: 'PLAYER TWO',
    kit: '#1b1636',
    trim: '#ffd21e',
    limb: '#ff3ad8',
    kitGlow: 0.2,
    trimGlow: 2.5,
    eye: '#ff3ad8',
    aura: '#ffd21e',
    hair: '',
    shorts: '#120f26',
    glow: 0.85,
    crest: 'pixels',
    bulk: 1,
  },
  COMIC_IMPACT: {
    name: 'THE MENACE',
    kit: '#1a0f22',
    trim: '#ff3ad8',
    limb: '#e8d9c4',
    kitGlow: 0.1,
    trimGlow: 2.0,
    eye: '#ff3ad8',
    aura: '#ff3ad8',
    hair: '#141018',
    shorts: '#120a18',
    glow: 0.7,
    crest: 'cape',
    bulk: 1.1,
  },
};

export interface BossCharacterState {
  /** World position of the boss's collision box. */
  x: number;
  z: number;
  /** 1, 2 or 3 — drives stance, glow and aura. */
  phase: number;
  /** 1 at full health, 0 at death. */
  health01: number;
  /** Ball to stalk. */
  ballX: number;
  ballZ: number;
  /** True while the smash is telegraphing (wind-up). */
  windingUp: boolean;
}

export class BossCharacter {
  readonly group = new THREE.Group();

  private readonly body = new THREE.Group();
  private readonly torso: THREE.Mesh;
  private readonly head = new THREE.Group();
  private readonly rightArm: THREE.Group;
  private readonly leftArm: THREE.Group;
  private readonly legs: THREE.Group[] = [];
  private readonly racket = new THREE.Group();
  private readonly aura: THREE.Mesh;
  private readonly eyes: THREE.Mesh;
  /** Signature parts, all built once and toggled by look. */
  private readonly crests: Record<string, THREE.Object3D> = {};

  private readonly kitMat: THREE.MeshStandardMaterial;
  private readonly trimMat: THREE.MeshStandardMaterial;
  private readonly limbMat: THREE.MeshStandardMaterial;
  private readonly shortsMat: THREE.MeshStandardMaterial;
  private readonly hairMat: THREE.MeshStandardMaterial;
  private readonly hair: THREE.Mesh;
  private readonly eyeMat: THREE.MeshBasicMaterial;
  private readonly auraMat: THREE.MeshBasicMaterial;

  private look: BossLook = BOSS_LOOKS.CLAY;
  private time = 0;
  private swing = 0;
  private swinging = false;
  private windup = 0;
  private flinch = 0;
  private defeated = 0;
  private facing = 0;

  constructor() {
    const L = this.look;
    this.kitMat = new THREE.MeshStandardMaterial({ color: L.kit, roughness: 0.6 });
    this.trimMat = new THREE.MeshStandardMaterial({
      color: L.trim,
      emissive: new THREE.Color(L.trim),
      emissiveIntensity: L.trimGlow,
      roughness: 0.4,
    });
    this.limbMat = new THREE.MeshStandardMaterial({ color: L.limb, roughness: 0.8 });
    this.shortsMat = new THREE.MeshStandardMaterial({ color: L.shorts, roughness: 0.75 });
    this.hairMat = new THREE.MeshStandardMaterial({ color: L.hair || '#1a1a1a', roughness: 0.9 });
    this.kitMat.emissive = new THREE.Color(L.kit);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: L.eye });
    const darkMat = new THREE.MeshStandardMaterial({
      color: '#0b0d10',
      roughness: 0.35,
      metalness: 0.25,
    });

    // ── Torso: a faceted taper, shoulders wider than waist ───────────────
    this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.62, 1.5, 8), this.kitMat);
    this.torso.position.y = 2.25;
    this.torso.castShadow = true;
    this.body.add(this.torso);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.94, 0.94, 0.14, 8), this.trimMat);
    collar.position.y = 2.95;
    this.body.add(collar);

    // A glowing chest stripe — the clearest read of the rival's colour.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.28), this.trimMat);
    stripe.position.set(0, 2.3, -0.72);
    this.body.add(stripe);

    const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.7, 0.5, 8), this.shortsMat);
    hips.position.y = 1.33;
    hips.castShadow = true;
    this.body.add(hips);

    // ── Head ─────────────────────────────────────────────────────────────
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 10), this.limbMat);
    skull.castShadow = true;
    this.head.add(skull);
    this.hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.475, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      this.hairMat
    );
    this.hair.position.y = 0.03;
    this.head.add(this.hair);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.075, 8, 18), this.trimMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.16;
    this.head.add(band);
    // No face — a shaded visor with two burning eyes. Features at this
    // scale look wrong; a glare reads as a threat.
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.12), darkMat);
    visor.position.set(0, 0.0, -0.4);
    this.head.add(visor);
    const eyeGeo = new THREE.BoxGeometry(0.16, 0.07, 0.06);
    this.eyes = new THREE.Mesh(eyeGeo, this.eyeMat);
    this.eyes.position.set(-0.17, 0.01, -0.46);
    const eyeR = new THREE.Mesh(eyeGeo, this.eyeMat);
    eyeR.position.set(0.34, 0, 0);
    this.eyes.add(eyeR);
    this.head.add(this.eyes);
    this.head.position.y = 3.28;
    this.body.add(this.head);

    // ── Arms ─────────────────────────────────────────────────────────────
    const makeArm = (side: number): THREE.Group => {
      const arm = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.62, 4, 8), this.limbMat);
      upper.position.y = -0.42;
      upper.castShadow = true;
      arm.add(upper);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.58, 4, 8), this.limbMat);
      fore.position.y = -1.06;
      fore.castShadow = true;
      arm.add(fore);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 8), this.trimMat);
      cuff.position.y = -1.36;
      arm.add(cuff);
      arm.position.set(side * 0.95, 2.82, 0);
      return arm;
    };
    this.rightArm = makeArm(1);
    this.leftArm = makeArm(-1);
    this.body.add(this.rightArm, this.leftArm);

    // ── Racket ───────────────────────────────────────────────────────────
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.9, 8), darkMat);
    handle.position.y = -0.45;
    this.racket.add(handle);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.075, 8, 22), this.trimMat);
    frame.position.y = -1.5;
    frame.rotation.x = Math.PI / 2;
    this.racket.add(frame);
    const stringMat = new THREE.MeshBasicMaterial({
      color: '#e8e4d4',
      transparent: true,
      opacity: 0.45,
    });
    for (let i = -2; i <= 2; i++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.02, 1.18), stringMat);
      v.position.set(i * 0.22, -1.5, 0);
      this.racket.add(v);
      const h = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.02, 0.022), stringMat);
      h.position.set(0, -1.5, i * 0.22);
      this.racket.add(h);
    }
    this.racket.position.y = -1.42;
    this.rightArm.add(this.racket);

    // ── Legs ─────────────────────────────────────────────────────────────
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.6, 4, 8), this.shortsMat);
      thigh.position.y = -0.4;
      thigh.castShadow = true;
      leg.add(thigh);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 8), this.limbMat);
      shin.position.y = -1.04;
      shin.castShadow = true;
      leg.add(shin);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.62), this.kitMat);
      shoe.position.set(0, -1.44, -0.08);
      leg.add(shoe);
      leg.position.set(side * 0.34, 1.2, 0);
      this.legs.push(leg);
      this.body.add(leg);
    }

    this.buildCrests(darkMat);

    // ── Aura: always lit, brighter with each phase ───────────────────────
    this.auraMat = new THREE.MeshBasicMaterial({
      color: L.aura,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(2.7, 16, 12), this.auraMat);
    this.aura.position.y = 2.2;
    this.body.add(this.aura);
    // A real athlete gets no halo at all; the synthetic rivals keep theirs.
    this.aura.visible = false;

    this.body.rotation.y = Math.PI; // faces down-court at the player
    this.group.scale.setScalar(0.95); // a giant, but never cropped by the top of frame
    this.group.add(this.body);
    this.group.visible = false;
    this.applyLook();
  }

  /** All signature parts exist from the start; `applyLook` picks one. */
  private buildCrests(darkMat: THREE.Material): void {
    // HELL — heavy shoulder pads.
    const pads = new THREE.Group();
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8, 0, Math.PI * 2, 0, 1.1), this.trimMat);
      pad.position.set(side * 1.0, 2.86, 0);
      pads.add(pad);
    }
    this.crests['pads'] = pads;

    // LOTUS//OS — orbiting data rings.
    const rings = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25 + i * 0.22, 0.035, 6, 30), this.trimMat);
      ring.rotation.x = Math.PI / 2 + i * 0.35;
      ring.position.y = 2.2 + i * 0.35;
      rings.add(ring);
    }
    this.crests['rings'] = rings;

    // NEON ARCADE — a blocky pixel crown.
    const pixels = new THREE.Group();
    for (let i = -2; i <= 2; i++) {
      const h = i % 2 === 0 ? 0.42 : 0.24;
      const px = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, 0.2), this.trimMat);
      px.position.set(i * 0.21, 3.78 + h / 2, 0);
      pixels.add(px);
    }
    this.crests['pixels'] = pixels;

    // COMIC — a villain's cape.
    const cape = new THREE.Mesh(new THREE.ConeGeometry(1.15, 2.2, 10, 1, true), darkMat);
    cape.position.set(0, 2.1, 0.55);
    cape.rotation.x = -0.18;
    this.crests['cape'] = cape;

    for (const key of Object.keys(this.crests)) {
      this.crests[key].visible = false;
      this.body.add(this.crests[key]);
    }
  }

  /** Repaints the rival for a world. Colours only — no geometry churn. */
  setLook(biome: BiomeName): void {
    const next = BOSS_LOOKS[biome] ?? BOSS_LOOKS.CLAY;
    if (next === this.look) return;
    this.look = next;
    this.applyLook();
  }

  get lookName(): string {
    return this.look.name;
  }

  private applyLook(): void {
    const L = this.look;
    this.kitMat.color.set(L.kit);
    this.kitMat.emissive.set(L.kit);
    this.kitMat.emissiveIntensity = L.kitGlow;
    this.trimMat.color.set(L.trim);
    this.trimMat.emissive.set(L.trim);
    this.trimMat.emissiveIntensity = L.trimGlow;
    this.limbMat.color.set(L.limb);
    this.eyeMat.color.set(L.eye);
    this.auraMat.color.set(L.aura);
    this.shortsMat.color.set(L.shorts);
    this.hair.visible = L.hair !== '';
    if (L.hair) this.hairMat.color.set(L.hair);
    this.aura.visible = L.glow > 0;
    for (const key of Object.keys(this.crests)) this.crests[key].visible = key === L.crest;
    this.torso.scale.set(L.bulk, 1, L.bulk);
  }

  setVisible(on: boolean): void {
    this.group.visible = on;
    if (!on) {
      this.defeated = 0;
      this.swing = 0;
      this.swinging = false;
      this.flinch = 0;
      this.body.rotation.x = 0;
    }
  }

  /** Called when the rival's smash actually fires. */
  strike(): void {
    this.swinging = true;
    this.swing = 0;
  }

  /** Called when the boss takes damage — a visible recoil. */
  recoil(): void {
    this.flinch = 1;
  }

  /** Begins the collapse. */
  defeat(): void {
    if (this.defeated === 0) this.defeated = 0.0001;
  }

  update(dt: number, s: BossCharacterState): void {
    if (!this.group.visible) return;
    this.time += dt;
    // Stand him behind the brick wall rather than inside it, so the whole
    // body reads instead of a head poking over the bricks.
    this.group.position.set(s.x, 0, s.z - 1.0);

    if (this.defeated > 0) {
      this.defeated = Math.min(1, this.defeated + dt * 0.9);
      const k = this.defeated;
      this.body.rotation.x = -k * 1.25; // falls backwards
      this.body.position.y = -k * 0.9;
      this.auraMat.opacity = (1 - k) * 0.25 * this.look.glow;
      this.eyeMat.color.setScalar(1 - k); // the glare goes out
      for (const leg of this.legs) leg.rotation.x = k * 0.9;
      this.rightArm.rotation.x = -k * 0.6;
      this.leftArm.rotation.x = -k * 0.6;
      return;
    }

    const phase = s.phase;
    // Aggression baked into the stance: always hunched, deeper each phase.
    const crouch = 0.12 + (phase - 1) * 0.18;
    const bob = Math.sin(this.time * (2.6 + phase * 0.8)) * 0.06;
    this.body.position.y = -crouch + bob;

    // Stalk the ball: the body turns a little, the head a lot.
    const dx = s.ballX - s.x;
    const want = THREE.MathUtils.clamp(dx * 0.09, -0.5, 0.5);
    this.facing += (want - this.facing) * (1 - Math.exp(-6 * dt));
    this.body.rotation.y = Math.PI + this.facing;
    this.head.rotation.y = this.facing * 0.7;

    this.windup += ((s.windingUp ? 1 : 0) - this.windup) * (1 - Math.exp(-9 * dt));

    if (this.swinging) {
      this.swing += dt * 3.6;
      if (this.swing >= 1) {
        this.swing = 1;
        this.swinging = false;
      }
    } else if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt * 2.2);
    }

    // Racket arm: back and high during wind-up, whipping down through the
    // swing. easeOutCubic — contact reads fast, follow-through slow.
    const swingEase = 1 - Math.pow(1 - this.swing, 3);
    this.rightArm.rotation.x = -2.1 * this.windup + swingEase * 3.0;
    this.rightArm.rotation.z = -0.25 - this.windup * 0.5 + swingEase * 0.5;
    this.racket.rotation.z = Math.sin(this.time * 3) * 0.06 + swingEase * 0.9;

    this.leftArm.rotation.x =
      Math.sin(this.time * 2.6) * 0.14 - this.windup * 0.7 - swingEase * 0.5;
    this.leftArm.rotation.z = 0.25 + this.windup * 0.35;

    for (let i = 0; i < this.legs.length; i++) {
      const side = i === 0 ? -1 : 1;
      this.legs[i].rotation.x = Math.sin(this.time * 2.8 + i * Math.PI) * 0.12 - this.windup * 0.25;
      this.legs[i].position.x = side * (0.36 + this.windup * 0.12 + (phase - 1) * 0.06);
    }

    if (this.flinch > 0) {
      this.flinch = Math.max(0, this.flinch - dt * 4);
      this.body.position.z = this.flinch * 0.28; // knocked back
      this.torso.rotation.x = -this.flinch * 0.3;
    } else {
      this.body.position.z = 0;
      this.torso.rotation.x = crouch * 0.4;
    }
    this.kitMat.emissiveIntensity = this.look.kitGlow + this.flinch * 0.8;
    this.shortsMat.emissive.setScalar(this.flinch * 0.5);

    // Glow escalates with the fight: trim burns brighter, eyes flare on the
    // wind-up, aura pulses faster and harder every phase.
    const heat = (phase - 1) / 2;
    const glow = this.look.glow;
    this.trimMat.emissiveIntensity =
      this.look.trimGlow * (1 + heat * 0.7 * glow) + this.windup * 0.9 * glow;
    // The realistic rival's eyes stay a flat dark colour — no flare.
    const eyeFlare = 1 + (this.windup * 1.4 + heat * 0.5) * glow;
    this.eyeMat.color.set(this.look.eye).multiplyScalar(eyeFlare);
    if (glow > 0) {
      this.auraMat.opacity =
        (0.05 +
          heat * 0.09 +
          Math.sin(this.time * (5 + phase * 2)) * (0.02 + heat * 0.03) +
          this.windup * 0.12) *
        glow;
      this.aura.scale.setScalar(1 + Math.sin(this.time * (3 + phase)) * 0.035 + this.windup * 0.06);
    }
    void s.health01;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }
}
