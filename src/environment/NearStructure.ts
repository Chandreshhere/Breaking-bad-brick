import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';

/**
 * The stadium on the player's side of the court.
 *
 * The far end has always had blocks, a wall and raked tiers, so the top of
 * the frame reads as an arena. The near end had nothing — just the near-black
 * ground plane — which is invisible in landscape but becomes a large dead
 * band along the bottom of a portrait screen.
 *
 * Everything here lives between the loss line and the camera, so it can never
 * interfere with play: the ball is already gone by the time it reaches this
 * geometry. Heights stay low so the tiers fill the bottom of the frame
 * without rising into the court.
 */
export function buildNearStructure(cfg: VisualConfig): THREE.Group {
  const group = new THREE.Group();
  const r = cfg.rear;

  // Start clear of the loss line — a visible gap of clay reads as "out",
  // so the wall never looks like something the ball should have bounced off.
  const nearZ = cfg.game.physics.lossZ + 0.25;

  const blockMaterial = new THREE.MeshStandardMaterial({
    color: r.blockColor,
    roughness: 0.7,
  });
  const standMaterial = new THREE.MeshStandardMaterial({ color: r.standColor, roughness: 1 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: r.standColor, roughness: 1 });

  // Block course along the near baseline, matching the far end's language.
  const blockGeometry = new THREE.BoxGeometry(r.blockW, r.blockH * 0.8, r.blockD);
  const span = cfg.court.width + 4.0;
  const step = r.blockW + r.blockGap;
  const count = Math.floor(span / step);
  const start = -((count - 1) * step) / 2;
  for (let i = 0; i < count; i++) {
    const block = new THREE.Mesh(blockGeometry, blockMaterial);
    block.position.set(start + i * step, (r.blockH * 0.8) / 2, nearZ);
    block.receiveShadow = true;
    group.add(block);
  }

  // Low wall behind the blocks so there is no seam of empty ground.
  const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 1.6, 0.6), wallMaterial);
  wall.position.set(0, 0.8, nearZ + 0.85);
  group.add(wall);

  // Two shallow tiers rising toward the camera, with seats — the same
  // treatment as the side stands, so the near end belongs to the same arena.
  const seatGeometry = new THREE.BoxGeometry(0.34, 0.26, 0.3);
  const seatMaterial = new THREE.MeshStandardMaterial({
    color: cfg.seats.color,
    roughness: 0.85,
  });
  const seatSpacing = cfg.seats.spacing;
  const seatCols = Math.floor((cfg.court.width + 6) / seatSpacing);
  const seats = new THREE.InstancedMesh(seatGeometry, seatMaterial, seatCols * 2);
  const dummy = new THREE.Object3D();
  let n = 0;

  for (let tierIndex = 0; tierIndex < 2; tierIndex++) {
    const y = 1.25 + tierIndex * 0.8;
    const z = nearZ + 1.35 + tierIndex * 1.05;
    const tier = new THREE.Mesh(new THREE.BoxGeometry(44, 0.7, 1.1), standMaterial);
    tier.position.set(0, y, z);
    tier.receiveShadow = true;
    group.add(tier);

    for (let c = 0; c < seatCols; c++) {
      const x = -((seatCols - 1) * seatSpacing) / 2 + c * seatSpacing;
      dummy.position.set(x, y + 0.48, z - 0.1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      seats.setMatrixAt(n++, dummy.matrix);
    }
  }
  seats.count = n;
  seats.instanceMatrix.needsUpdate = true;
  group.add(seats);

  return group;
}
