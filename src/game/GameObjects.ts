import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';
import { BallTrail } from '../effects/BallTrail';
import { disposeSubtree } from '../environment/materials';
import { BallVisual, createGlowTexture } from './Ball';
import { BrickField, type BrickState } from './Bricks';
import type { LevelDirector } from './LevelDirector';
import { buildPaddle, paddleTopY } from './Paddle';

/**
 * Phase 4: the visual game objects, statically posed like the reference's
 * countdown state (ball resting on the paddle, opening brick formation).
 * Phase 5 adds physics/state on top of these same objects.
 */
export class GameObjects {
  private group: THREE.Group | null = null;
  paddle: THREE.Mesh | null = null;
  ball: THREE.Group | null = null;
  ballVisual: BallVisual | null = null;
  trail: BallTrail | null = null;
  brickField: BrickField | null = null;
  private extraBalls: { visual: BallVisual; trail: BallTrail; inUse: boolean }[] = [];

  constructor(
    private scene: THREE.Scene,
    private cfg: VisualConfig,
    private levels: LevelDirector
  ) {}

  get brickStates(): BrickState[] {
    return this.brickField?.states ?? [];
  }

  build(): void {
    this.dispose();
    const group = new THREE.Group();

    this.paddle = buildPaddle(this.cfg);
    group.add(this.paddle);

    this.ballVisual = new BallVisual(this.cfg);
    this.ball = this.ballVisual.root;
    this.ball.position.set(
      0,
      paddleTopY(this.cfg) + this.cfg.game.ball.radius * 0.9,
      this.cfg.game.paddle.z - 0.05
    );
    group.add(this.ball);

    this.trail = new BallTrail(this.cfg, createGlowTexture());
    group.add(this.trail.group);

    // Every extra ball is built here, once, and parked. Spawning them on
    // demand changed the scene's light count mid-rally, which recompiles
    // every material in the stadium — the multiball freeze.
    this.extraBalls = [];
    for (let i = 0; i < this.cfg.game.powerups.maxExtraBalls; i++) {
      const visual = new BallVisual(this.cfg);
      const trail = new BallTrail(this.cfg, createGlowTexture());
      visual.setActive(false);
      trail.reset();
      trail.group.visible = false;
      group.add(visual.root, trail.group);
      this.extraBalls.push({ visual, trail, inUse: false });
    }

    this.brickField = new BrickField(this.cfg, this.levels.getBrickSpecs());
    group.add(this.brickField.group);

    this.scene.add(group);
    this.group = group;
  }

  /** Replaces just the brick field (mid-level reinforcement waves). */
  rebuildBricks(): void {
    if (!this.group) return;
    if (this.brickField) {
      disposeSubtree(this.brickField.group);
      this.group.remove(this.brickField.group);
    }
    this.brickField = new BrickField(this.cfg, this.levels.getBrickSpecs());
    this.group.add(this.brickField.group);
  }

  /**
   * Claims a parked extra ball (multiball). Returns null once the pool is
   * exhausted, which doubles as the hard cap on concurrent balls — stacked
   * MULTIBALL pickups used to grow the ball count without limit.
   */
  createExtraBall(): { visual: BallVisual; trail: BallTrail } | null {
    if (!this.group) return null;
    const slot = this.extraBalls.find((s) => !s.inUse);
    if (!slot) return null;
    slot.inUse = true;
    slot.visual.setActive(true);
    slot.trail.reset();
    slot.trail.group.visible = true;
    return { visual: slot.visual, trail: slot.trail };
  }

  /** Parks an extra ball. Never detaches it — see BallVisual.setActive. */
  removeExtraBall(visual: BallVisual, _trail: BallTrail | null): void {
    const slot = this.extraBalls.find((s) => s.visual === visual);
    if (!slot) return;
    slot.inUse = false;
    slot.visual.setActive(false);
    slot.trail.reset();
    slot.trail.group.visible = false;
  }

  dispose(): void {
    if (!this.group) return;
    disposeSubtree(this.group);
    this.scene.remove(this.group);
    this.group = null;
    this.paddle = null;
    this.ball = null;
    this.ballVisual = null;
    this.trail = null;
    this.brickField = null;
  }
}
