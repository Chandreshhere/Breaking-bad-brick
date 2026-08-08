import * as THREE from 'three';

/** Small GLSL value-noise kit shared by the procedural materials. */
export const NOISE_GLSL = /* glsl */ `
float acbHash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float acbNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = acbHash21(i);
  float b = acbHash21(i + vec2(1.0, 0.0));
  float c = acbHash21(i + vec2(0.0, 1.0));
  float d = acbHash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

export interface ShaderLike {
  vertexShader: string;
  fragmentShader: string;
}

/**
 * Adds a `vAcbWorldPos` varying plus the noise kit to a built-in material's
 * shader. World-space position drives all procedural surface variation so
 * the pattern is stable regardless of UVs.
 */
export function injectWorldPos(shader: ShaderLike): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vAcbWorldPos;')
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvAcbWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;'
    );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    '#include <common>\nvarying vec3 vAcbWorldPos;\n' + NOISE_GLSL
  );
}

/**
 * Darkens a material toward its base — fakes the soft occlusion visible at
 * the bottom of the reference's walls and stands.
 */
export function applyHeightShade(
  mat: THREE.MeshStandardMaterial,
  yLow: number,
  yHigh: number,
  darkFactor: number
): void {
  mat.onBeforeCompile = (shader) => {
    injectWorldPos(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
{
  float hf = clamp((vAcbWorldPos.y - ${yLow.toFixed(3)}) / ${(yHigh - yLow).toFixed(3)}, 0.0, 1.0);
  diffuseColor.rgb *= mix(${darkFactor.toFixed(3)}, 1.0, hf);
}`
    );
  };
  mat.customProgramCacheKey = () => `acb-heightshade-${yLow}-${yHigh}-${darkFactor}`;
}

/** Deterministic PRNG so instanced scatter (seats etc.) is screenshot-stable. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Disposes every geometry/material/texture under a subtree. */
export function disposeSubtree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    // InstancedMesh owns its instanceMatrix/instanceColor GPU buffers — the
    // renderer only frees them via the mesh's own dispose event.
    if ((obj as THREE.InstancedMesh).isInstancedMesh) {
      (obj as THREE.InstancedMesh).dispose();
    }
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (!mat) continue;
      for (const value of Object.values(mat)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      mat.dispose();
    }
  });
}
