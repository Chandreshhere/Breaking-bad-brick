import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import type { VisualConfig } from '../config/visual.config';

/**
 * One cheap LDR pass for impulse grading: red screen-edge vignette,
 * desaturation, and chromatic aberration. All neutral at rest — these are
 * short pulses driven by game events (life lost, later heavy impacts).
 */
const GradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRedEdge: { value: 0 },
    uSaturation: { value: 1 },
    uAberration: { value: 0 },
    uFlash: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uRedEdge;
    uniform float uSaturation;
    uniform float uAberration;
    uniform float uFlash;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      float dist = length(dir);
      float amt = uAberration * 0.012 * dist;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - dir * amt).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + dir * amt).b;
      float grey = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(grey), col, uSaturation);
      float edge = smoothstep(0.5, 1.0, dist * 1.4142);
      col = mix(col, vec3(0.55, 0.03, 0.02), edge * uRedEdge * 0.85);
      col = mix(col, vec3(1.0), uFlash * 0.85);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/**
 * Scene → RenderPass → bloom → vignette → OutputPass (tone mapping +
 * colour-space conversion). The composer target uses MSAA so geometry stays
 * crisp through the post chain.
 */
export class PostProcessing {
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private vignettePass: ShaderPass;
  private gradingPass: ShaderPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    cfg: VisualConfig
  ) {
    // Size the custom target in device pixels — EffectComposer adopts a custom
    // target's dimensions verbatim, so CSS-pixel sizing would render the whole
    // chain at half resolution on HiDPI until the first window resize.
    const size = renderer.getSize(new THREE.Vector2());
    const dpr = renderer.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(
      Math.floor(size.x * dpr),
      Math.floor(size.y * dpr),
      {
        samples: 4,
        type: THREE.HalfFloatType,
      }
    );
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      cfg.bloom.strength,
      cfg.bloom.radius,
      cfg.bloom.threshold
    );
    this.composer.addPass(this.bloomPass);

    this.composer.addPass(new OutputPass());

    // LDR grading impulses (red edge / desaturation / aberration).
    this.gradingPass = new ShaderPass(GradingShader);
    this.composer.addPass(this.gradingPass);

    // Vignette runs after tone mapping/colour conversion — running it before
    // ACES can push RGB negative and produce cyan corner artefacts.
    this.vignettePass = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignettePass);
    this.applyConfig(cfg);
  }

  applyConfig(cfg: VisualConfig): void {
    this.bloomPass.strength = cfg.bloom.strength;
    this.bloomPass.radius = cfg.bloom.radius;
    this.bloomPass.threshold = cfg.bloom.threshold;
    this.vignettePass.uniforms['offset']!.value = cfg.vignette.offset;
    this.vignettePass.uniforms['darkness']!.value = cfg.vignette.darkness;
  }

  /**
   * Per-frame impulse application — the GameFeelManager is the only caller.
   * Base bloom/vignette come from config so GUI tuning stays live.
   */
  applyImpulses(
    imp: {
      flash: number;
      redEdge: number;
      saturation: number;
      aberration: number;
      bloomPulse: number;
      vignettePulse: number;
    },
    cfg: VisualConfig
  ): void {
    this.gradingPass.uniforms['uRedEdge']!.value = imp.redEdge;
    this.gradingPass.uniforms['uSaturation']!.value = imp.saturation;
    this.gradingPass.uniforms['uAberration']!.value = imp.aberration;
    this.gradingPass.uniforms['uFlash']!.value = imp.flash;
    this.bloomPass.strength = cfg.bloom.strength * (1 + imp.bloomPulse);
    this.vignettePass.uniforms['darkness']!.value =
      cfg.vignette.darkness + imp.vignettePulse * 0.5;
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose(); // frees both render targets and every pass
  }
}
