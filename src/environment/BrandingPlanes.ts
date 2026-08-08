import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';

/**
 * Generates a wordmark texture on a canvas — replacement branding, since the
 * reference's proprietary marks aren't ours to reproduce.
 */
export function createWordmarkTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.25em';
    ctx.font = 'italic 600 170px Georgia, "Times New Roman", serif';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 10);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Wordmark planes laid flush onto the leaning inner faces of the side walls,
 * matching the reference's angled sponsor banners.
 */
export function buildBrandingPlanes(cfg: VisualConfig): THREE.Group {
  const group = new THREE.Group();
  const w = cfg.walls;
  const phi = Math.atan2(w.lean, w.height); // inner-face lean angle from vertical

  const texture = createWordmarkTexture(cfg.branding.text, cfg.branding.color);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: 0.65,
  });
  const planeGeometry = new THREE.PlaneGeometry(5.2, 0.65);

  const yAxis = new THREE.Vector3(0, 1, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);

  for (const side of [1, -1] as const) {
    // Face the court (yaw), then lean back with the wall (tilt).
    const qYaw = new THREE.Quaternion().setFromAxisAngle(yAxis, (-side * Math.PI) / 2);
    const qTilt = new THREE.Quaternion().setFromAxisAngle(zAxis, -side * phi);
    const q = qTilt.multiply(qYaw);
    // Inner-face normal, pointing at the court and slightly upward.
    const n = new THREE.Vector3(-side * Math.cos(phi), Math.sin(phi), 0);

    for (const z of [-5.2, 4.2]) {
      const mesh = new THREE.Mesh(planeGeometry, material);
      mesh.quaternion.copy(q);
      const t = 0.55; // fraction up the wall face
      mesh.position.set(
        side * (w.innerX + w.lean * t) + n.x * 0.04,
        w.height * t + n.y * 0.04,
        z
      );
      mesh.renderOrder = 1;
      group.add(mesh);
    }
  }

  return group;
}
