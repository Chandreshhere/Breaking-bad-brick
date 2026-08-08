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

  /** Runtime extra ball (multiball). Lives inside the group, so rebuilds clean it up too. */
  createExtraBall(): { visual: BallVisual; trail: BallTrail } | null {
    if (!this.group) return null;
    const visual = new BallVisual(this.cfg);
    const trail = new BallTrail(this.cfg, createGlowTexture());
    this.group.add(visual.root, trail.group);
    return { visual, trail };
  }

  removeExtraBall(visual: BallVisual, trail: BallTrail | null): void {
    if (!this.group) return;
    disposeSubtree(visual.root);
    this.group.remove(visual.root);
    if (trail) {
      disposeSubtree(trail.group);
      this.group.remove(trail.group);
    }
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
