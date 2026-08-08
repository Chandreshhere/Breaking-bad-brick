import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';

function roundedRectShape(width: number, depth: number, radius: number): THREE.Shape {
  const hw = width / 2;
  const hd = depth / 2;
  const r = Math.min(radius, hd, hw);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(hw, hd - r);
  shape.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-hw + r, hd);
  shape.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-hw, -hd + r);
  shape.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}

export const PADDLE_BEVEL = 0.06;

/** Y of the paddle's top surface (base sits just above the clay). */
export function paddleTopY(cfg: VisualConfig): number {
  return 0.08 + cfg.game.paddle.height + PADDLE_BEVEL;
}

/**
 * Rounded, bevelled paddle from Shape + ExtrudeGeometry — dark green lid,
 * brighter rim with a subtle emissive response so the under-glow reads.
 * RACKET XL later scales this on X; no model swapping.
 */
export function buildPaddle(cfg: VisualConfig): THREE.Mesh {
  const p = cfg.game.paddle;
  const shape = roundedRectShape(p.width, p.depth, p.depth * 0.48);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: p.height,
    steps: 1,
    curveSegments: 16,
    bevelEnabled: true,
    bevelThickness: PADDLE_BEVEL,
    bevelSize: PADDLE_BEVEL,
    bevelSegments: 3,
  });
  geometry.rotateX(-Math.PI / 2); // extrusion axis becomes +Y (height)

  const lidMaterial = new THREE.MeshStandardMaterial({
    color: p.bodyColor,
    roughness: 0.5,
    metalness: 0,
  });
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: p.rimColor,
    roughness: 0.45,
    metalness: 0,
    emissive: new THREE.Color(p.rimEmissive),
    emissiveIntensity: p.rimEmissiveIntensity,
  });

  const mesh = new THREE.Mesh(geometry, [lidMaterial, rimMaterial]);
  mesh.position.set(0, 0.08 + PADDLE_BEVEL, p.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
