/**
 * Brick type definitions — behaviour lives in BrickField/Game, but each
 * type's identity (health, scoring, look) is data here. Visuals must make
 * behaviour readable: armour looks metallic, explosives pulse orange,
 * ghosts are translucent, multipliers are gold, powerup bricks glow teal.
 *
 * The name union already reserves future types (SHIELDED, MAGNETIC,
 * TELEPORT, CHAIN, REGENERATOR, LASER, BOSS) for later phases.
 */

export type BrickTypeName =
  | 'NORMAL'
  | 'ARMORED'
  | 'EXPLOSIVE'
  | 'MOVING'
  | 'GHOST'
  | 'MULTIPLIER'
  | 'POWERUP'
  | 'BOSS';

/** World-scale applied to the BOSS instance (and its collision box). */
export const BOSS_SCALE = { x: 2.6, y: 1.9, z: 1.7 };

export interface BrickTypeDef {
  health: number;
  scoreMult: number;
  color: string;
  emissive: string;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
  transparent?: boolean;
}

export const BRICK_TYPES: Record<BrickTypeName, BrickTypeDef> = {
  NORMAL: {
    health: 1,
    scoreMult: 1,
    color: '#1d5e34',
    emissive: '#0d3a1f', // faint inherent readability — never glowing
    emissiveIntensity: 0.07,
    metalness: 0,
    roughness: 0.5,
  },
  ARMORED: {
    health: 3,
    scoreMult: 2,
    color: '#9aa8a0',
    emissive: '#232a26',
    emissiveIntensity: 0.35,
    metalness: 0.45, // full metal reads black without an env map
    roughness: 0.38,
  },
  EXPLOSIVE: {
    health: 1,
    scoreMult: 1.5,
    color: '#4a3d12',
    emissive: '#ff7a1a',
    emissiveIntensity: 0.9, // pulsed live in BrickField.update
    metalness: 0,
    roughness: 0.5,
  },
  MOVING: {
    health: 1,
    scoreMult: 1.5,
    color: '#1a5560',
    emissive: '#0d3d46',
    emissiveIntensity: 0.25,
    metalness: 0,
    roughness: 0.45,
  },
  GHOST: {
    health: 1,
    scoreMult: 2,
    color: '#7fd0c9',
    emissive: '#69d8cf',
    emissiveIntensity: 0.5,
    metalness: 0,
    roughness: 0.3,
    transparent: true, // opacity oscillates; intangible while faded
  },
  MULTIPLIER: {
    health: 1,
    scoreMult: 3,
    color: '#8a6a1a',
    emissive: '#ffce3a',
    emissiveIntensity: 0.7,
    metalness: 0.4,
    roughness: 0.35,
  },
  POWERUP: {
    health: 1,
    scoreMult: 1,
    color: '#20514b',
    emissive: '#39d7a8',
    emissiveIntensity: 0.6,
    metalness: 0,
    roughness: 0.45,
  },
  BOSS: {
    health: 24,
    scoreMult: 10,
    color: '#4a1440',
    emissive: '#c04af0',
    emissiveIntensity: 0.6,
    metalness: 0.25,
    roughness: 0.4,
  },
};
