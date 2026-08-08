import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import type { VisualConfig } from '../config/visual.config';
import { mulberry32 } from './materials';
import { standStartX } from './Stands';

/**
 * Hundreds of burnt-orange seats from a single low-poly seat geometry
 * rendered with one InstancedMesh per side. Per-instance colour jitter and
 * row darkening keep the mass from reading as a flat repeat.
 */
export function buildSeats(cfg: VisualConfig): THREE.Group {
  const group = new THREE.Group();
  const s = cfg.stands;
  const seatCfg = cfg.seats;
  const startX = standStartX(cfg);

  // One seat: base pad + slightly tilted back rest, back on the outward (+X) side.
  const base = new THREE.BoxGeometry(0.26, 0.05, 0.3);
  base.translate(0, 0.025, 0);
  const back = new THREE.BoxGeometry(0.05, 0.24, 0.3);
  back.rotateZ(-0.18);
  back.translate(0.12, 0.15, 0);
  const seatGeometry = BufferGeometryUtils.mergeGeometries([base, back]);
  base.dispose();
  back.dispose();

  const cols = Math.floor((s.length - 1) / seatCfg.spacing);
  const count = s.rows * cols;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });

  const dummy = new THREE.Object3D();
  const baseColor = new THREE.Color(seatCfg.color);
  const color = new THREE.Color();

  for (const side of [1, -1] as const) {
    const rng = mulberry32(side === 1 ? 1337 : 7331);
    const mesh = new THREE.InstancedMesh(seatGeometry, material, count);

    let index = 0;
    for (let row = 0; row < s.rows; row++) {
      const rowTop = s.firstRowTop + row * s.rowRise;
      const x = startX + row * s.rowDepth + s.rowDepth * 0.45;
      for (let col = 0; col < cols; col++) {
        const z = -((s.length - 1) / 2) + (col + 0.5) * seatCfg.spacing;
        dummy.position.set(side * x, rowTop, z);
        dummy.rotation.set(0, side === 1 ? 0 : Math.PI, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);

        const rowT = Math.pow(row / Math.max(1, s.rows - 1), 1.2);
        color
          .copy(baseColor)
          .offsetHSL(
            (rng() - 0.5) * 0.015,
            (rng() - 0.5) * 0.08,
            (rng() - 0.5) * seatCfg.colorJitter
          )
          .multiplyScalar(THREE.MathUtils.lerp(1, seatCfg.topDarken, rowT));
        mesh.setColorAt(index, color);
        index++;
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  return group;
}
