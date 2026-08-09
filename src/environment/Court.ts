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

  // The surround used to be near-black, which vanishes in landscape but
  // reads as a hole along the bottom of a portrait screen. It now takes the
  // world's own dark wall colour, so it reads as arena floor.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: cfg.rear.backWallColor, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.16;
  ground.receiveShadow = true;
  group.add(ground);

  return group;
}
