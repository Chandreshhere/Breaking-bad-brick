import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';

/**
 * Buyable ball and paddle skins.
 *
 * Applying a skin is just a config write. `BallVisual.update` re-reads
 * `cfg.game.ball` every frame, so a ball skin lands instantly on every live
 * ball including the pooled ones. The paddle keeps its two materials on the
 * mesh, so a paddle skin recolours them in place — neither path rebuilds
 * geometry or disposes a material, so neither can trigger a shader recompile.
 */

export interface BallSkin {
  id: string;
  name: string;
  price: number;
  color: string;
  emissive: string;
  lightColor: string;
}

export interface PaddleSkin {
  id: string;
  name: string;
  price: number;
  bodyColor: string;
  rimColor: string;
  rimEmissive: string;
  rimEmissiveIntensity: number;
}

export const BALL_SKINS: BallSkin[] = [
  {
    id: 'CLASSIC',
    name: 'CLASSIC',
    price: 0,
    color: '#ffe94a',
    emissive: '#ffd52e',
    lightColor: '#ffd44a',
  },
  { id: 'EMBER', name: 'EMBER', price: 150, color: '#ff9a4a', emissive: '#ff5a1a', lightColor: '#ff7a2a' },
  { id: 'ICE', name: 'ICE', price: 150, color: '#bdf0ff', emissive: '#4fc3ff', lightColor: '#7fd8ff' },
  { id: 'TOXIC', name: 'TOXIC', price: 300, color: '#ccff6a', emissive: '#7dff6a', lightColor: '#a8ff3a' },
  { id: 'PLASMA', name: 'PLASMA', price: 300, color: '#ff8ae8', emissive: '#d43ad8', lightColor: '#ff5fd2' },
  { id: 'VOID', name: 'VOID', price: 600, color: '#d3b8ff', emissive: '#7a3aff', lightColor: '#9a6aff' },
  { id: 'SOLAR', name: 'SOLAR', price: 1000, color: '#fffbe0', emissive: '#ffb800', lightColor: '#fff2a0' },
];

export const PADDLE_SKINS: PaddleSkin[] = [
  {
    id: 'CLASSIC',
    name: 'CLASSIC',
    price: 0,
    bodyColor: '#12452a',
    rimColor: '#256b3c',
    rimEmissive: '#86b13e',
    rimEmissiveIntensity: 0.35,
  },
  {
    id: 'CARBON',
    name: 'CARBON',
    price: 150,
    bodyColor: '#1e2226',
    rimColor: '#6e7a82',
    rimEmissive: '#93a3ad',
    rimEmissiveIntensity: 0.3,
  },
  {
    id: 'CIRCUIT',
    name: 'CIRCUIT',
    price: 250,
    bodyColor: '#0d1420',
    rimColor: '#4fc3ff',
    rimEmissive: '#4fc3ff',
    rimEmissiveIntensity: 1.4,
  },
  {
    id: 'INFERNO',
    name: 'INFERNO',
    price: 400,
    bodyColor: '#2a1410',
    rimColor: '#ff5a1a',
    rimEmissive: '#ff5a1a',
    rimEmissiveIntensity: 1.6,
  },
  {
    id: 'ARCADE',
    name: 'ARCADE',
    price: 600,
    bodyColor: '#1b1636',
    rimColor: '#ffd21e',
    rimEmissive: '#ff3ad8',
    rimEmissiveIntensity: 1.5,
  },
  {
    id: 'GOLD',
    name: 'GOLD',
    price: 1200,
    bodyColor: '#5c4710',
    rimColor: '#ffd21e',
    rimEmissive: '#ffd21e',
    rimEmissiveIntensity: 1.2,
  },
];

export function ballSkin(id: string): BallSkin {
  return BALL_SKINS.find((s) => s.id === id) ?? BALL_SKINS[0];
}

export function paddleSkin(id: string): PaddleSkin {
  return PADDLE_SKINS.find((s) => s.id === id) ?? PADDLE_SKINS[0];
}

/** Writes a ball skin into the live config. Every ball picks it up next frame. */
export function applyBallSkin(cfg: VisualConfig, id: string): void {
  const s = ballSkin(id);
  cfg.game.ball.color = s.color;
  cfg.game.ball.emissive = s.emissive;
  cfg.game.ball.lightColor = s.lightColor;
}

/** Recolours the paddle's existing materials in place. */
export function applyPaddleSkin(cfg: VisualConfig, id: string, paddle: THREE.Mesh | null): void {
  const s = paddleSkin(id);
  const p = cfg.game.paddle;
  p.bodyColor = s.bodyColor;
  p.rimColor = s.rimColor;
  p.rimEmissive = s.rimEmissive;
  p.rimEmissiveIntensity = s.rimEmissiveIntensity;
  if (!paddle) return;
  const mats = paddle.material as THREE.MeshStandardMaterial[];
  if (!Array.isArray(mats)) return;
  mats[0]?.color.set(s.bodyColor);
  if (mats[1]) {
    mats[1].color.set(s.rimColor);
    mats[1].emissive.set(s.rimEmissive);
    mats[1].emissiveIntensity = s.rimEmissiveIntensity;
  }
}
