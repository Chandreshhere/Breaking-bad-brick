import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';
import { applyHeightShade } from './materials';

/**
 * Converging dark-green side walls built from a 2D profile extruded down the
 * court length (Shape + ExtrudeGeometry — no imported models). The inner
 * face leans outward so the high camera sees it as an angled banner surface.
 */
export function buildSideWalls(cfg: VisualConfig): THREE.Group {
  const group = new THREE.Group();
  const w = cfg.walls;

  // Cross-section in the XY plane; +X points away from the court.
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(w.lean, w.height);
  shape.lineTo(w.lean + w.topWidth, w.height);
  shape.lineTo(w.lean + w.topWidth, 0);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: w.length,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  geometry.translate(0, 0, -w.length / 2);

  const material = new THREE.MeshStandardMaterial({
    color: w.color,
    // Faint self-light so the wall face never fully swallows into a dark
    // biome's background — readability floor for the play boundary.
    emissive: new THREE.Color(w.color),
    emissiveIntensity: 0.22,
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide, // the left wall is a mirrored (negative-scale) instance
  });
  applyHeightShade(material, 0, w.height, 0.9);

  const right = new THREE.Mesh(geometry, material);
  right.position.x = w.innerX;
  right.castShadow = true;
  right.receiveShadow = true;

  const left = new THREE.Mesh(geometry, material);
  left.scale.x = -1;
  left.position.x = -w.innerX;
  left.castShadow = true;
  left.receiveShadow = true;

  // Emissive edge strip along each wall's top inner lip, in the biome's
  // rail accent colour — the court border stays visible in every world,
  // storm or dark biome alike (bloom picks it up).
  const stripGeometry = new THREE.BoxGeometry(0.07, 0.07, w.length);
  const stripMaterial = new THREE.MeshBasicMaterial({ color: cfg.rails.emissive });
  const rightStrip = new THREE.Mesh(stripGeometry, stripMaterial);
  rightStrip.position.set(w.innerX + w.lean, w.height + 0.03, 0);
  const leftStrip = new THREE.Mesh(stripGeometry, stripMaterial);
  leftStrip.position.set(-(w.innerX + w.lean), w.height + 0.03, 0);

  group.add(right, left, rightStrip, leftStrip);
  return group;
}
