import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';

/**
 * Everything past the far baseline: a row of dark-green blocks at the back
 * of the court, then the stadium treatment simply continues — a low green
 * wall and raked tiers climbing into the fog. No voids, no billboards; the
 * gameplay camera should read one continuous arena.
 */
export function buildRearStructure(cfg: VisualConfig): THREE.Group {
  const group = new THREE.Group();
  const r = cfg.rear;
  const farZ = -cfg.court.length / 2;

  // Block wall sitting on the back of the court.
  const blockGeometry = new THREE.BoxGeometry(r.blockW, r.blockH, r.blockD);
  const blockMaterial = new THREE.MeshStandardMaterial({
    color: r.blockColor,
    roughness: 0.7,
    metalness: 0,
  });
  const span = cfg.court.width + 4.0;
  const step = r.blockW + r.blockGap;
  const blockCount = Math.floor(span / step);
  const start = -((blockCount - 1) * step) / 2;
  for (let i = 0; i < blockCount; i++) {
    const block = new THREE.Mesh(blockGeometry, blockMaterial);
    block.position.set(start + i * step, r.blockH / 2, farZ + r.blockD / 2 + 0.15);
    block.castShadow = true;
    block.receiveShadow = true;
    group.add(block);
  }

  // Low green wall directly behind the blocks — no gap, no void.
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(40, 2.2, 0.6),
    new THREE.MeshStandardMaterial({ color: r.backWallColor, roughness: 1 })
  );
  backWall.position.set(0, 1.1, farZ - 0.85);
  group.add(backWall);

  // Raked rear tiers starting right above the wall so the stadium treatment
  // continues seamlessly toward the far end.
  const standMaterial = new THREE.MeshStandardMaterial({ color: r.standColor, roughness: 1 });
  for (let j = 0; j < 11; j++) {
    const tier = new THREE.Mesh(new THREE.BoxGeometry(44, 0.8, 1.0), standMaterial);
    tier.position.set(0, 2.4 + j * 0.65, farZ - 1.35 - j * 0.95);
    tier.receiveShadow = true;
    group.add(tier);
  }

  return group;
}
