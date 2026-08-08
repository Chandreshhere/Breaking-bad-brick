import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';

/**
 * Illuminated trim running along the top of both side walls — the bright
 * converging lines that sell the premium arena look. One hot rail on the
 * inner top edge plus a run of parallel rails across the ledge; all emissive
 * so the bloom pass picks them up.
 */
export function buildLightRails(cfg: VisualConfig): THREE.Group {
  const group = new THREE.Group();
  const w = cfg.walls;
  const r = cfg.rails;
  const y = w.height + 0.04;

  const makeMaterial = (intensity: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({
      color: r.color,
      emissive: new THREE.Color(r.emissive),
      emissiveIntensity: intensity,
      roughness: 0.4,
    });

  // Shared per-rail materials (mirrored across both sides).
  const edgeMaterial = makeMaterial(r.intensity * 1.15);
  const ledgeMaterials = Array.from({ length: r.count }, (_, i) =>
    makeMaterial(r.intensity * (1 - i * 0.22))
  );

  const geometry = new THREE.BoxGeometry(r.thickness, r.thickness, w.length);

  // Distribute the ledge rails across the physical ledge (lean → lean +
  // topWidth) so retuning wall or rail counts never leaves rails floating.
  const margin = 0.12;
  const ledgeStart = w.lean + margin;
  const ledgeSpan = Math.max(0.01, w.topWidth - 2 * margin);
  const ledgeStep = r.count > 1 ? Math.min(r.spacing, ledgeSpan / (r.count - 1)) : 0;

  for (const side of [1, -1] as const) {
    const edge = new THREE.Mesh(geometry, edgeMaterial);
    edge.position.set(side * (w.innerX + w.lean - 0.05), y, 0);
    group.add(edge);

    for (let i = 0; i < r.count; i++) {
      const rail = new THREE.Mesh(geometry, ledgeMaterials[i]);
      rail.position.set(side * (w.innerX + ledgeStart + i * ledgeStep), y, 0);
      group.add(rail);
    }
  }

  return group;
}
