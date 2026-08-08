import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';

/** X where the stepped stand structure starts (just past the wall's outer edge). */
export function standStartX(cfg: VisualConfig): number {
  return cfg.walls.innerX + cfg.walls.lean + cfg.walls.topWidth + cfg.stands.offset;
}

/**
 * Stepped stadium stands: one solid riser box per row rising away from the
 * court, mirrored to both sides, capped by a dark upper wall. Rows blend
 * from clay-orange toward dark green as they climb into the shadows.
 */
export function buildStands(cfg: VisualConfig): THREE.Group {
  const group = new THREE.Group();
  const s = cfg.stands;
  const startX = standStartX(cfg);

  const riserBase = new THREE.Color(s.riserColor);
  const upperColor = new THREE.Color(s.upperWallColor);

  // Shared per-row materials (mirrored across both sides).
  const rowMaterials = Array.from({ length: s.rows }, (_, i) => {
    const t = Math.pow(i / Math.max(1, s.rows - 1), 1.4) * 0.55;
    return new THREE.MeshStandardMaterial({
      color: riserBase.clone().lerp(upperColor, t),
      roughness: 0.95,
      metalness: 0,
    });
  });

  const lastRowTop = s.firstRowTop + (s.rows - 1) * s.rowRise;

  for (const side of [1, -1] as const) {
    for (let i = 0; i < s.rows; i++) {
      const top = s.firstRowTop + i * s.rowRise;
      const riser = new THREE.Mesh(
        new THREE.BoxGeometry(s.rowDepth, top, s.length),
        rowMaterials[i]
      );
      riser.position.set(side * (startX + i * s.rowDepth + s.rowDepth / 2), top / 2, 0);
      riser.receiveShadow = true;
      group.add(riser);
    }

    // Dark upper wall behind the last row.
    const upperHeight = lastRowTop + s.upperWallHeight;
    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, upperHeight, s.length),
      new THREE.MeshStandardMaterial({ color: s.upperWallColor, roughness: 1 })
    );
    upper.position.set(side * (startX + s.rows * s.rowDepth + 0.45), upperHeight / 2, 0);
    group.add(upper);
  }

  return group;
}
