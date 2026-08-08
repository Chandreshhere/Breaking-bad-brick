import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';
import { createClayMaterial } from './ClayMaterial';

/** Clay court slab (real geometry, top surface at Y = 0) plus a dark ground apron. */
export function buildCourt(cfg: VisualConfig): THREE.Group {
  const group = new THREE.Group();
  const { width, length, thickness } = cfg.court;

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(width, thickness, length),
    createClayMaterial(cfg.court)
  );
  slab.position.y = -thickness / 2;
  slab.receiveShadow = true;
  group.add(slab);

  // Everything outside the slab reads near-black so the arena edges vanish.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: '#050f08', roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.16;
  ground.receiveShadow = true;
  group.add(ground);

  return group;
}
