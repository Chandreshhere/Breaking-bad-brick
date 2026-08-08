import * as THREE from 'three';
import type { AudioFx } from '../audio/AudioFx';
import type { VisualConfig } from '../config/visual.config';
import type { BrickState } from '../game/Bricks';
import type { GameFeelManager } from './GameFeel';
import { LightningBolt } from './LightningBolt';

export interface LightningHooks {
  /** Valid strike targets right now (empty outside active play). */
  getTargets: () => BrickState[];
  /** Fired every ~70 ms during a telegraph — spark/flicker the target. */
  telegraphTick: (brick: BrickState) => void;
  /** The strike lands — apply damage and impact effects. */
  strike: (brick: BrickState) => void;
}

interface Telegraph {
  brick: BrickState;
  t: number;
  duration: number;
  tickTimer: number;
}

/**
 * Decides what lightning IS: some strikes stay scenery behind the arena,
 * some telegraph onto a live brick (300–700 ms of sparks + rising charge)
 * and then hit it for real damage. Owns bolt lifetimes; damage rules live
 * in Game via hooks.
 */
export class LightningDirector {
  readonly group = new THREE.Group();
  hooks: LightningHooks | null = null;
  private readonly bolts: LightningBolt[] = [];
  private telegraph: Telegraph | null = null;
  private readonly target = new THREE.Vector3();

  constructor(
    private cfg: VisualConfig,
    private feel: GameFeelManager,
    private audio: AudioFx
  ) {}

  /** Storm cadence / overdrive calls this. `forceGameplay` guarantees a brick hit. */
  requestStrike(forceGameplay = false): void {
    if (this.telegraph) return;
    const targets = this.hooks?.getTargets() ?? [];
    const gameplay =
      targets.length > 0 &&
      (forceGameplay || Math.random() < this.cfg.game.lightning.gameplayChance);

    if (!gameplay) {
      this.backgroundStrike();
      return;
    }
    const brick = targets[Math.floor(Math.random() * targets.length)];
    this.telegraph = {
      brick,
      t: 0,
      duration: 0.3 + Math.random() * 0.4,
      tickTimer: 0,
    };
    this.audio.chargeUp(this.telegraph.duration);
  }

  /** Scenery strike behind/around the arena — no gameplay contact. */
  private backgroundStrike(): void {
    this.target.set((Math.random() - 0.5) * 24, 0, -13 - Math.random() * 6);
    this.spawnBolt(this.target);
    this.feel.flashPulse(0.45);
    // Distance-scaled: further bolts arrive later and softer.
    const distance = 0.5 + Math.random() * 0.7;
    this.audio.thunder(distance, 0.38 - distance * 0.1);
  }

  private fire(brick: BrickState): void {
    this.target.set(brick.x, 0.35, brick.z);
    this.spawnBolt(this.target);
    this.feel.flashPulse(0.7);
    this.audio.thunder(0.05, 0.6); // it hit the COURT — crack is immediate
    this.hooks?.strike(brick);
  }

  private spawnBolt(target: THREE.Vector3): void {
    const bolt = new LightningBolt(target);
    this.bolts.push(bolt);
    this.group.add(bolt.group);
  }

  update(dt: number): void {
    if (this.telegraph) {
      const tg = this.telegraph;
      tg.t += dt;
      tg.tickTimer -= dt;
      if (!tg.brick.alive) {
        this.telegraph = null; // target died mid-charge — the sky lets it go
      } else if (tg.tickTimer <= 0) {
        tg.tickTimer = 0.07;
        this.hooks?.telegraphTick(tg.brick);
      }
      if (this.telegraph && tg.t >= tg.duration) {
        this.telegraph = null;
        this.fire(tg.brick);
      }
    }

    for (const bolt of [...this.bolts]) {
      bolt.update(dt);
      if (!bolt.alive) {
        this.group.remove(bolt.group);
        bolt.dispose();
        this.bolts.splice(this.bolts.indexOf(bolt), 1);
      }
    }
  }
}
