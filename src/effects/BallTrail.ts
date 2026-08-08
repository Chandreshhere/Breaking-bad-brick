import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';

/**
 * Subtle warm trail behind the ball: a fixed pool of additive sprites laid
 * along a sampled position history, fading and shrinking with age. Opacity
 * scales with ball speed; nothing is allocated per frame.
 */
export class BallTrail {
  readonly group = new THREE.Group();
  private readonly sprites: THREE.Sprite[] = [];
  private readonly history: THREE.Vector3[] = [];
  private sampleTimer = 0;

  constructor(
    private cfg: VisualConfig,
    texture: THREE.Texture
  ) {
    const t = cfg.game.ball.trail;
    for (let i = 0; i < t.count; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          color: '#ffd97a',
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      sprite.visible = false;
      this.sprites.push(sprite);
      this.group.add(sprite);
    }
  }

  update(dt: number, head: THREE.Vector3, speedRatio: number, active: boolean): void {
    const t = this.cfg.game.ball.trail;
    if (!active) {
      if (this.history.length > 0) {
        this.history.length = 0;
        this.sampleTimer = 0;
        for (const sprite of this.sprites) sprite.visible = false;
      }
      return;
    }

    this.sampleTimer += dt;
    while (this.sampleTimer >= t.spacing) {
      this.sampleTimer -= t.spacing;
      const v = this.history.length >= t.count ? this.history.pop()! : new THREE.Vector3();
      v.copy(head);
      this.history.unshift(v);
    }

    const radius = this.cfg.game.ball.radius;
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      const point = this.history[i];
      if (!point) {
        sprite.visible = false;
        continue;
      }
      sprite.visible = true;
      sprite.position.copy(point);
      const age = 1 - i / t.count; // 1 = freshest
      sprite.scale.setScalar(radius * THREE.MathUtils.lerp(t.endScale, t.startScale, age));
      (sprite.material as THREE.SpriteMaterial).opacity = t.maxOpacity * age * age * speedRatio;
    }
  }
}
