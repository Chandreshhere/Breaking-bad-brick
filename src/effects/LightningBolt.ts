import * as THREE from 'three';

/** Recursive midpoint displacement — the classic jagged bolt. */
function subdivide(
  a: THREE.Vector3,
  b: THREE.Vector3,
  displacement: number,
  depth: number
): THREE.Vector3[] {
  if (depth === 0) return [a, b];
  const mid = a
    .clone()
    .add(b)
    .multiplyScalar(0.5)
    .add(
      new THREE.Vector3(
        (Math.random() - 0.5) * displacement,
        (Math.random() - 0.5) * displacement * 0.4,
        (Math.random() - 0.5) * displacement * 0.6
      )
    );
  const left = subdivide(a, mid, displacement / 2, depth - 1);
  const right = subdivide(mid, b, displacement / 2, depth - 1);
  return [...left.slice(0, -1), ...right];
}

/**
 * One rendered strike: a recursively subdivided main bolt with
 * probabilistic side branches, drawn in two layers — a thin near-white
 * core and a wider blue-violet glow (both additive, bloom feeds on the
 * core). Lifetime is an irregular flicker: flash → off → re-flash →
 * decay. Geometry is unique per strike and disposed when done.
 */
export class LightningBolt {
  readonly group = new THREE.Group();
  alive = true;
  private life = 0;
  private readonly materials: THREE.MeshBasicMaterial[] = [];

  constructor(target: THREE.Vector3) {
    const start = new THREE.Vector3(
      target.x + (Math.random() - 0.5) * 4,
      13.5 + Math.random() * 2.5,
      target.z - 1.5 + (Math.random() - 0.5) * 2
    );
    const main = subdivide(start, target.clone(), 2.6, 5);
    // Thick triple layer — the bolt must read instantly even mid-rally:
    // hot white core, inner violet sheath, wide soft glow for bloom.
    this.addPolyline(main, 0.09, '#ffffff', 1.0);
    this.addPolyline(main, 0.22, '#b0a4ff', 0.45);
    this.addPolyline(main, 0.45, '#7a66ff', 0.16);

    // Side branches peel off downward-outward.
    for (let i = 2; i < main.length - 3; i++) {
      if (Math.random() > 0.2) continue;
      const branchStart = main[i];
      const branchEnd = branchStart
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 3.5,
            -1.5 - Math.random() * 2.5,
            (Math.random() - 0.5) * 2
          )
        );
      const branch = subdivide(branchStart, branchEnd, 1.0, 3);
      this.addPolyline(branch, 0.022, '#ffffff', 0.7);
      this.addPolyline(branch, 0.08, '#8a78ff', 0.22);
    }
  }

  private addPolyline(
    points: THREE.Vector3[],
    radius: number,
    color: string,
    opacity: number
  ): void {
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, points.length * 2, radius, 5, false);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    material.userData['baseOpacity'] = opacity;
    this.materials.push(material);
    this.group.add(new THREE.Mesh(geometry, material));
  }

  update(dt: number): void {
    this.life += dt;
    // Irregular flicker, never one long continuous bolt — but held long
    // enough to actually be SEEN (the old 0.34s vanished between glances).
    let flicker = 0;
    if (this.life < 0.09) flicker = 1;
    else if (this.life < 0.13) flicker = 0.15;
    else if (this.life < 0.24) flicker = 0.9;
    else if (this.life < 0.3) flicker = 0.35;
    else if (this.life < 0.55) flicker = Math.max(0, 0.8 - (this.life - 0.3) / 0.31);
    else this.alive = false;

    this.group.visible = flicker > 0.02;
    for (const material of this.materials) {
      material.opacity = (material.userData['baseOpacity'] as number) * flicker;
    }
  }

  dispose(): void {
    for (const child of this.group.children) {
      (child as THREE.Mesh).geometry.dispose();
    }
    for (const material of this.materials) material.dispose();
    this.group.clear();
  }
}
