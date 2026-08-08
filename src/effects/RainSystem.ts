import * as THREE from 'three';

export type RainQuality = 'LOW' | 'MEDIUM' | 'HIGH';

const MAX_STREAKS = 900;
const QUALITY_COUNTS: Record<RainQuality, number> = { LOW: 280, MEDIUM: 550, HIGH: 900 };
const SPAWN_HEIGHT = 13;

/**
 * GPU rain: elongated streaks (never circular sprites) as one instanced
 * draw call. Each streak carries a seed driving its length, speed, and
 * opacity variation; three depth layers (near = longer/brighter/faster,
 * far = smaller/dimmer); wind slants the fall direction and the streak
 * geometry together, smoothly. All motion lives in the vertex shader —
 * zero per-frame CPU work beyond four uniforms.
 */
export class RainSystem {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private enabled = false;
  private time = 0;
  private readonly wind = new THREE.Vector2(0.06, 0.01);
  private readonly windTarget = new THREE.Vector2(0.06, 0.01);
  private intensity = 0;

  constructor() {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = base.index;
    this.geometry.setAttribute('position', base.getAttribute('position'));
    this.geometry.setAttribute('uv', base.getAttribute('uv'));

    const offsets = new Float32Array(MAX_STREAKS * 3);
    const seeds = new Float32Array(MAX_STREAKS);
    const layers = new Float32Array(MAX_STREAKS);
    for (let i = 0; i < MAX_STREAKS; i++) {
      offsets[i * 3] = (Math.random() - 0.5) * 28;
      offsets[i * 3 + 1] = 0;
      offsets[i * 3 + 2] = (Math.random() - 0.5) * 32;
      seeds[i] = Math.random();
      layers[i] = i % 3; // near / mid / far interleaved
    }
    this.geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    this.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    this.geometry.setAttribute('aLayer', new THREE.InstancedBufferAttribute(layers, 1));
    this.geometry.instanceCount = QUALITY_COUNTS.HIGH;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        // NOTE: a separate Vector2 — never the smoothed wind state itself,
        // or the per-frame gust multiply would compound into it.
        uWind: { value: new THREE.Vector2(0.06, 0.01) },
        uDensity: { value: 0 },
        uOpacity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aOffset;
        attribute float aSeed;
        attribute float aLayer;
        uniform float uTime;
        uniform vec2 uWind;
        uniform float uDensity;
        varying vec2 vUv;
        varying float vAlpha;

        void main() {
          vUv = uv;
          float layerT = aLayer / 2.0;
          float vary = 0.7 + 0.6 * fract(aSeed * 7.77);
          float len = mix(1.3, 0.4, layerT) * vary;
          float width = mix(0.09, 0.032, layerT);
          float speed = mix(20.0, 12.0, layerT) * (0.85 + 0.3 * fract(aSeed * 3.31));

          // Density gating with natural variation — not a uniform curtain.
          float visible = step(fract(aSeed * 13.37), uDensity);

          float phase = fract(aSeed + uTime * speed / ${SPAWN_HEIGHT.toFixed(1)});
          float y = ${SPAWN_HEIGHT.toFixed(1)} * (1.0 - phase);

          vec3 base = vec3(aOffset.x, y, aOffset.z);
          base.xz += uWind * (${SPAWN_HEIGHT.toFixed(1)} - y); // wind drift over the fall

          // Streak oriented along the fall direction, facing the camera.
          // NaN-guarded: streaks can pass arbitrarily close to the camera,
          // and one NaN fragment would poison the whole bloom chain.
          vec3 dir = normalize(vec3(uWind.x, -1.0, uWind.y));
          vec3 toCamRaw = cameraPosition - base;
          vec3 toCam = toCamRaw / max(length(toCamRaw), 0.5);
          vec3 sideRaw = cross(dir, toCam);
          vec3 side = sideRaw / max(length(sideRaw), 0.05);
          vec3 pos = base + dir * (uv.y - 0.5) * len + side * (uv.x - 0.5) * width;

          vAlpha = visible * mix(1.0, 0.45, layerT) * (0.65 + 0.35 * fract(aSeed * 5.13));
          gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          // Bright narrow core, transparent edges, faded streak ends.
          float core = pow(max(0.0, 1.0 - abs(vUv.x - 0.5) * 2.0), 1.7);
          float ends = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.72, vUv.y);
          vec3 col = mix(vec3(0.55, 0.68, 0.9), vec3(1.0, 1.0, 1.0), core);
          gl_FragColor = vec4(col, core * ends * vAlpha * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  setQuality(quality: RainQuality): void {
    this.geometry.instanceCount = QUALITY_COUNTS[quality];
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Wind slant (drift per unit of fall). Transitions are smoothed. */
  setWindTarget(x: number, z: number): void {
    this.windTarget.set(x, z);
  }

  setIntensity(value: number): void {
    this.intensity = THREE.MathUtils.clamp(value, 0, 1);
  }

  update(dt: number): void {
    this.time += dt;
    // Smooth wind — never rotate all rain abruptly.
    const k = 1 - Math.exp(-0.9 * dt);
    this.wind.lerp(this.windTarget, k);
    // Gentle gusting on top of the target.
    const gust = 1 + Math.sin(this.time * 0.31) * 0.25 + Math.sin(this.time * 0.073) * 0.15;

    const active = this.enabled && this.intensity > 0.01;
    this.mesh.visible = active;
    if (!active) return;
    this.material.uniforms['uTime']!.value = this.time;
    (this.material.uniforms['uWind']!.value as THREE.Vector2)
      .copy(this.wind)
      .multiplyScalar(gust);
    this.material.uniforms['uDensity']!.value = 0.3 + this.intensity * 0.7;
    this.material.uniforms['uOpacity']!.value = 0.7 + this.intensity * 0.55;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
