import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';

/**
 * Court markings as thin white boxes floating just above the clay so they
 * catch light (and later bloom) naturally instead of being painted texture.
 */
export function buildCourtLines(cfg: VisualConfig): THREE.Group {
  const group = new THREE.Group();
  const c = cfg.court;
  const halfW = c.playWidth / 2;
  const halfL = c.playLength / 2;
  const singlesX = halfW - c.singlesInset;
  const y = 0.012;
  const h = 0.02;

  const material = new THREE.MeshStandardMaterial({
    color: c.lineColor,
    roughness: 0.6,
    emissive: new THREE.Color(c.lineColor),
    // High enough that the court boundary reads even in the darkest biome.
    emissiveIntensity: 0.3,
  });

  const line = (x: number, z: number, w: number, l: number): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  // Baselines
  line(0, -halfL, c.playWidth + c.lineWidth, c.lineWidth);
  line(0, halfL, c.playWidth + c.lineWidth, c.lineWidth);
  // Doubles sidelines
  line(-halfW, 0, c.lineWidth, c.playLength);
  line(halfW, 0, c.lineWidth, c.playLength);
  // Singles sidelines
  line(-singlesX, 0, c.lineWidth, c.playLength);
  line(singlesX, 0, c.lineWidth, c.playLength);
  // Service lines
  line(0, -c.serviceLineZ, singlesX * 2, c.lineWidth);
  line(0, c.serviceLineZ, singlesX * 2, c.lineWidth);
  // Centre service line
  line(0, 0, c.lineWidth, c.serviceLineZ * 2);
  // Centre marks on baselines
  line(0, -(halfL - c.centerMarkLength / 2), c.lineWidth, c.centerMarkLength);
  line(0, halfL - c.centerMarkLength / 2, c.lineWidth, c.centerMarkLength);

  return group;
}
