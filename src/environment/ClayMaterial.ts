import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';
import { injectWorldPos } from './materials';

/**
 * Procedural clay: burnt-orange base with layered value noise (broad tonal
 * drift, mid grain, fine grain), sparse darker speckles, subtle streaking
 * along the play direction, and roughness variation. No textures.
 */
export function createClayMaterial(court: VisualConfig['court']): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(court.clayBase),
    roughness: court.roughness,
    metalness: 0,
  });
  mat.name = 'clay-material'; // WetSurfaceController finds it by name

  mat.onBeforeCompile = (shader) => {
    injectWorldPos(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec2 wp = vAcbWorldPos.xz;
  float n1 = acbNoise(wp * 0.55);
  float n2 = acbNoise(wp * 6.5);
  float n3 = acbNoise(wp * 34.0);
  float streak = acbNoise(vec2(wp.x * 5.0, wp.y * 0.3));
  vec3 c = diffuseColor.rgb;
  c *= 0.92 + 0.12 * n1 + 0.06 * (n2 - 0.5);
  c += (n3 - 0.5) * 0.045;
  c *= mix(0.965, 1.035, streak);
  float speck = step(0.968, acbNoise(wp * 52.0 + 13.7));
  c = mix(c, c * 0.7, speck * 0.85);
  diffuseColor.rgb = c;
}`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + (acbNoise(vAcbWorldPos.xz * 8.0) - 0.5) * 0.12, 0.05, 1.0);`
      );
  };
  mat.customProgramCacheKey = () => 'acb-clay';
  return mat;
}
