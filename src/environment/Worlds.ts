import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';

/**
 * World set-dressing for the non-stadium arenas (Phases 30–32). These
 * replace the tennis stands/seats/rear entirely — different geometry,
 * different mood — while the court/walls gameplay space stays constant.
 * Everything is procedural: shapes, canvas textures, emissive geometry.
 */

function pixelTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 128, h = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter; // chunky pixels
  return texture;
}

// ── LOTUS//OS — holographic operating-system court ─────────────────────

export function buildLotusWorld(_cfg: VisualConfig): THREE.Group {
  const group = new THREE.Group();

  // Procedural geometric lotus, projected flat onto centre court.
  const lotus = new THREE.Group();
  const petalMaterial = new THREE.MeshBasicMaterial({
    color: '#35e0ff',
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const [count, radius, size] of [
    [8, 2.6, 1.6],
    [6, 1.5, 1.2],
  ] as Array<[number, number, number]>) {
    for (let i = 0; i < count; i++) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo(size * 0.5, size * 0.35, size * 0.5, size * 0.9, 0, size * 1.25);
      shape.bezierCurveTo(-size * 0.5, size * 0.9, -size * 0.5, size * 0.35, 0, 0);
      const geometry = new THREE.ShapeGeometry(shape);
      const petal = new THREE.Mesh(geometry, petalMaterial);
      const angle = (i / count) * Math.PI * 2;
      petal.rotation.x = -Math.PI / 2;
      petal.rotation.z = angle;
      petal.position.set(Math.sin(angle) * radius * 0.3, 0.02, -1 - Math.cos(angle) * radius * 0.3);
      lotus.add(petal);
    }
  }
  group.add(lotus);

  // Floating data panels flanking the court.
  const panelMaterial = new THREE.MeshBasicMaterial({ color: '#0a2a3a' });
  const panelEdge = new THREE.MeshBasicMaterial({
    color: '#35e0ff',
    transparent: true,
    opacity: 0.8,
  });
  for (let i = 0; i < 14; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const w = 1.4 + Math.random() * 2;
    const h = 0.8 + Math.random() * 1.4;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), panelMaterial);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.06), panelEdge);
    panel.position.set(side * (10 + Math.random() * 4), 2 + Math.random() * 5, -8 + Math.random() * 14);
    panel.rotation.y = -side * (Math.PI / 2 - 0.3);
    glow.position.copy(panel.position);
    glow.position.y += h / 2 + 0.06;
    glow.rotation.copy(panel.rotation);
    group.add(panel, glow);
  }

  // Distant grid wall behind everything.
  const gridMaterial = new THREE.MeshBasicMaterial({
    color: '#123a4a',
    transparent: true,
    opacity: 0.7,
  });
  for (let x = -16; x <= 16; x += 2) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 12, 0.04), gridMaterial);
    bar.position.set(x, 6, -15);
    group.add(bar);
  }
  for (let y = 0; y <= 12; y += 2) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(32, 0.04, 0.04), gridMaterial);
    bar.position.set(0, y, -15);
    group.add(bar);
  }
  return group;
}

// ── NEON ARCADE — dark arcade hall ─────────────────────────────────────

export function buildArcadeWorld(cfg: VisualConfig): THREE.Group {
  const group = new THREE.Group();
  const cabinetMaterial = new THREE.MeshStandardMaterial({ color: '#0a0a14', roughness: 0.6 });
  const screenColors = ['#ff3ad8', '#35e0ff', '#ffd21e', '#7dff6a'];

  for (let i = 0; i < 6; i++) {
    for (const side of [-1, 1]) {
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3, 1.3), cabinetMaterial);
      cabinet.position.set(side * (9.8 + (i % 2) * 1.4), 1.5, -9 + i * 3.4);
      group.add(cabinet);

      // Pixel screen on the inner face.
      const texture = pixelTexture((ctx, w, h) => {
        ctx.fillStyle = '#05050a';
        ctx.fillRect(0, 0, w, h);
        for (let n = 0; n < 26; n++) {
          ctx.fillStyle = screenColors[Math.floor(Math.random() * screenColors.length)];
          ctx.fillRect(
            Math.floor(Math.random() * 14) * 9,
            Math.floor(Math.random() * 7) * 9,
            8,
            8
          );
        }
      });
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 1.0),
        new THREE.MeshBasicMaterial({ map: texture })
      );
      screen.position.set(cabinet.position.x - side * 0.82, 2.1, cabinet.position.z);
      screen.rotation.y = -side * (Math.PI / 2);
      group.add(screen);
    }
  }

  // Overhead neon strips.
  ['#ff3ad8', '#35e0ff', '#ffd21e'].forEach((color, i) => {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(22, 0.08, 0.08),
      new THREE.MeshStandardMaterial({
        color,
        emissive: new THREE.Color(color),
        emissiveIntensity: 2,
      })
    );
    strip.position.set(0, 8.5 - i * 0.5, -10 + i * 3);
    group.add(strip);
  });

  // Big marquee behind the far wall.
  const marquee = pixelTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#05050a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffd21e';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('HI-SCORE', w / 2, 24);
      ctx.fillStyle = '#ff3ad8';
      ctx.fillText('INSERT BALL', w / 2, 48);
    },
    160,
    64
  );
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 4),
    new THREE.MeshBasicMaterial({ map: marquee })
  );
  sign.position.set(0, 5.5, -13.5);
  group.add(sign);
  void cfg;
  return group;
}

// ── COMIC IMPACT — 3D manga pop-art world ──────────────────────────────

export function buildComicWorld(cfg: VisualConfig): THREE.Group {
  const group = new THREE.Group();
  const palette = ['#ff3ad8', '#ffd21e', '#3a7dff'];

  // Giant tilted comic panels with halftone fills.
  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const color = palette[i % palette.length];
    const texture = pixelTexture(
      (ctx, w, h) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = color;
        // halftone dot grid
        for (let y = 8; y < h - 8; y += 10) {
          for (let x = 8; x < w - 8; x += 10) {
            ctx.beginPath();
            ctx.arc(x, y, 2.6 + ((x + y) % 3), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.strokeStyle = '#101020';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);
      },
      128,
      96
    );
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 3.3),
      new THREE.MeshBasicMaterial({ map: texture })
    );
    panel.position.set(side * (10 + (i % 3) * 1.6), 2.5 + (i % 3) * 1.8, -9 + i * 2.4);
    panel.rotation.set((Math.random() - 0.5) * 0.3, -side * 1.1, (Math.random() - 0.5) * 0.25);
    group.add(panel);
  }

  // Floating stars.
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? 0.5 : 0.22;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) starShape.moveTo(x, y);
    else starShape.lineTo(x, y);
  }
  starShape.closePath();
  const starGeometry = new THREE.ExtrudeGeometry(starShape, {
    depth: 0.12,
    bevelEnabled: false,
  });
  const starMaterial = new THREE.MeshStandardMaterial({
    color: '#ffd21e',
    emissive: new THREE.Color('#ffb400'),
    emissiveIntensity: 0.8,
  });
  for (let i = 0; i < 7; i++) {
    const star = new THREE.Mesh(starGeometry, starMaterial);
    star.position.set((Math.random() - 0.5) * 22, 3 + Math.random() * 5, -12 + Math.random() * 8);
    star.rotation.z = Math.random() * Math.PI;
    star.scale.setScalar(0.7 + Math.random() * 0.9);
    group.add(star);
  }

  // Radial ray backdrop.
  const rays = pixelTexture(
    (ctx, w, h) => {
      ctx.fillStyle = '#141a3a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ff3ad8';
      const cx = w / 2;
      const cy = h * 0.7;
      for (let i = 0; i < 24; i++) {
        const a0 = (i / 24) * Math.PI * 2;
        const a1 = a0 + 0.07;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a0) * w, cy + Math.sin(a0) * w);
        ctx.lineTo(cx + Math.cos(a1) * w, cy + Math.sin(a1) * w);
        ctx.fill();
      }
    },
    256,
    128
  );
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 22),
    new THREE.MeshBasicMaterial({ map: rays })
  );
  backdrop.position.set(0, 8, -17);
  group.add(backdrop);
  void cfg;
  return group;
}
