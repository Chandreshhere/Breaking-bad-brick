import * as THREE from 'three';

export interface BurstOptions {
  count: number;
  speed: number;
  size: number;
  life: number;
  colorA: THREE.Color; // birth colour
  colorB: THREE.Color; // death colour
  gravity: number;
  upwardBias: number; // 0..1, how much velocities favour +Y
}

const MAX_PARTICLES = 256;

/**
 * Fixed-size GPU particle pool: one THREE.Points draw call, per-particle
 * size/alpha/colour via attributes, all buffers preallocated. `burst` only
 * pops indices off a free stack — no allocation on the hit path.
 */
export class ParticlePool {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly alphas: Float32Array;
  private readonly sizes: Float32Array;
  private readonly velocities: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly gravity: Float32Array;
  private readonly birthColors = new Float32Array(MAX_PARTICLES * 3);
  private readonly deathColors = new Float32Array(MAX_PARTICLES * 3);
  private readonly free: number[] = [];
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  constructor(texture: THREE.Texture) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.alphas = new Float32Array(MAX_PARTICLES);
    this.sizes = new Float32Array(MAX_PARTICLES);
    this.velocities = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.baseSize = new Float32Array(MAX_PARTICLES);
    this.gravity = new Float32Array(MAX_PARTICLES);
    for (let i = MAX_PARTICLES - 1; i >= 0; i--) this.free.push(i);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uScale: { value: 600 }, // pixels per world unit at depth 1; set per frame
      },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aAlpha;
        attribute float aSize;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uScale;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor, vAlpha) * tex;
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  setPixelScale(scale: number): void {
    this.material.uniforms['uScale']!.value = scale;
  }

  burst(origin: THREE.Vector3, opts: BurstOptions): void {
    for (let n = 0; n < opts.count; n++) {
      const i = this.free.pop();
      if (i === undefined) return; // pool exhausted — drop, never allocate
      const i3 = i * 3;

      this.positions[i3] = origin.x;
      this.positions[i3 + 1] = origin.y;
      this.positions[i3 + 2] = origin.z;

      const theta = Math.random() * Math.PI * 2;
      const up = Math.random() * opts.upwardBias + 0.1;
      const planar = Math.sqrt(Math.max(0.05, 1 - up * up));
      const speed = opts.speed * (0.4 + Math.random() * 0.6);
      this.velocities[i3] = Math.cos(theta) * planar * speed;
      this.velocities[i3 + 1] = up * speed;
      this.velocities[i3 + 2] = Math.sin(theta) * planar * speed;

      const lifetime = opts.life * (0.6 + Math.random() * 0.4);
      this.life[i] = lifetime;
      this.maxLife[i] = lifetime;
      this.baseSize[i] = opts.size * (0.7 + Math.random() * 0.6);
      this.gravity[i] = opts.gravity;

      this.colors[i3] = opts.colorA.r;
      this.colors[i3 + 1] = opts.colorA.g;
      this.colors[i3 + 2] = opts.colorA.b;
      this.alphas[i] = 1;
      this.sizes[i] = this.baseSize[i];
      // Death colour is blended in update using the life ratio.
      this.deathColors[i3] = opts.colorB.r;
      this.deathColors[i3 + 1] = opts.colorB.g;
      this.deathColors[i3 + 2] = opts.colorB.b;
      this.birthColors[i3] = opts.colorA.r;
      this.birthColors[i3 + 1] = opts.colorA.g;
      this.birthColors[i3 + 2] = opts.colorA.b;
    }
  }

  update(dt: number): void {
    const drag = Math.pow(0.88, dt * 60);
    let any = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        this.free.push(i);
        continue;
      }
      const i3 = i * 3;
      this.velocities[i3] *= drag;
      this.velocities[i3 + 1] = this.velocities[i3 + 1] * drag - this.gravity[i] * dt;
      this.velocities[i3 + 2] *= drag;
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;

      const ratio = this.life[i] / this.maxLife[i];
      this.alphas[i] = Math.pow(ratio, 1.4);
      this.sizes[i] = this.baseSize[i] * (0.45 + 0.55 * ratio);
      const t = 1 - ratio;
      this.colors[i3] = this.birthColors[i3] + (this.deathColors[i3] - this.birthColors[i3]) * t;
      this.colors[i3 + 1] =
        this.birthColors[i3 + 1] + (this.deathColors[i3 + 1] - this.birthColors[i3 + 1]) * t;
      this.colors[i3 + 2] =
        this.birthColors[i3 + 2] + (this.deathColors[i3 + 2] - this.birthColors[i3 + 2]) * t;
    }
    if (any) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.aColor.needsUpdate = true;
      this.geometry.attributes.aAlpha.needsUpdate = true;
      this.geometry.attributes.aSize.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
