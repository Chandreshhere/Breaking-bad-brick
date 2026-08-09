import type { VisualConfig } from '../config/visual.config';
import { mulberry32 } from '../environment/materials';
import type { BrickTypeName } from './BrickType';
import { buildFormation, type FormationName } from './FormationGenerator';

export interface BrickSpec {
  x: number;
  z: number;
  row: number;
  col: number;
  type: BrickTypeName;
}

const FORMATION_ORDER: FormationName[] = [
  'PYRAMID',
  'COLUMNS',
  'DIAMOND',
  'RINGS',
  'CHECKERBOARD',
  'TUNNEL',
  'WINGS',
  'FORTRESS',
  'SNAKE',
  'SPIRAL',
  'RANDOM_CLUSTER',
];

const GRID_COLS = 10;

/**
 * Chooses each level's formation, brick types, and wave count from a
 * deterministic seed — the same level number always produces the same
 * layout, but no two levels repeat. Type variety unlocks progressively so
 * early levels teach one mechanic at a time.
 */
export class LevelDirector {
  level = 1;
  wave = 1;
  /**
   * Overrides the config seed for a daily challenge, so every player in the
   * world gets the identical sequence of levels. Null means the normal
   * endless seed.
   */
  private seedOverride: number | null = null;

  constructor(private cfg: VisualConfig) {}

  setSeedOverride(seed: number | null): void {
    this.seedOverride = seed;
  }

  private get baseSeed(): number {
    return this.seedOverride ?? this.cfg.game.levels.baseSeed;
  }

  setLevel(n: number): void {
    this.level = Math.max(1, n);
    this.wave = 1;
  }

  /** Every 4th level is a boss arena. */
  isBossLevel(): boolean {
    return this.level % 4 === 0;
  }

  waveCount(): number {
    if (this.isBossLevel()) return 1;
    return this.level >= 3 ? 2 : 1;
  }

  /** Advances to the next wave of the current level; false when exhausted. */
  advanceWave(): boolean {
    if (this.wave < this.waveCount()) {
      this.wave += 1;
      return true;
    }
    return false;
  }

  formationName(): FormationName {
    const index = (this.level - 1) * 2 + (this.wave - 1) * 5;
    return FORMATION_ORDER[index % FORMATION_ORDER.length];
  }

  /** Unlock schedule: [type, weight] pairs available at the current level. */
  private typeWeights(): Array<[BrickTypeName, number]> {
    const weights: Array<[BrickTypeName, number]> = [['NORMAL', 10]];
    if (this.level >= 2) {
      weights.push(['ARMORED', 2 + Math.min(3, this.level - 2)]);
      weights.push(['POWERUP', 1.2]);
    }
    if (this.level >= 3) weights.push(['EXPLOSIVE', 1.5]);
    if (this.level >= 4) {
      weights.push(['GHOST', 1.5]);
      weights.push(['MULTIPLIER', 1]);
    }
    return weights;
  }

  /** Boss arena: the giant central brick, an armoured ring, side columns. */
  private bossSpecs(): BrickSpec[] {
    const b = this.cfg.game.bricks;
    const stepX = b.width + b.gapX;
    const stepZ = b.depth + b.gapZ;
    const bossZ = b.topZ + 1.3;
    const specs: BrickSpec[] = [{ x: 0, z: bossZ, row: 0, col: 5, type: 'BOSS' }];
    // Armoured guard ring
    for (const [ox, oz] of [
      [-2.2, 0],
      [2.2, 0],
      [-1.4, 1.9],
      [1.4, 1.9],
      [0, 2.1],
    ] as Array<[number, number]>) {
      specs.push({ x: ox * 1, z: bossZ + oz, row: 1, col: 0, type: 'ARMORED' });
    }
    // Side columns of fodder
    for (let row = 0; row < 4; row++) {
      for (const side of [-1, 1]) {
        specs.push({
          x: side * (stepX * 3.6),
          z: b.topZ + row * stepZ,
          row,
          col: side < 0 ? 1 : 8,
          type: row % 2 === 0 ? 'NORMAL' : 'EXPLOSIVE',
        });
      }
    }
    return specs;
  }

  /** Deterministic brick layout for the current level + wave. */
  getBrickSpecs(): BrickSpec[] {
    if (this.isBossLevel()) return this.bossSpecs();
    const rng = mulberry32(this.baseSeed + this.level * 1009 + this.wave * 97);
    const rows = this.wave === 1 ? 6 : 4; // reinforcement waves are lighter
    const matrix = buildFormation(this.formationName(), rows, GRID_COLS, rng);

    const b = this.cfg.game.bricks;
    const stepX = b.width + b.gapX;
    const stepZ = b.depth + b.gapZ;
    const startX = -((GRID_COLS - 1) * stepX) / 2;

    // One whole row moves when MOVING is unlocked — a full moving row reads
    // far better than scattered individual movers.
    const movingRow =
      this.level >= 3 ? Math.floor(rng() * rows) : -1;

    const caps: Partial<Record<BrickTypeName, number>> = {
      EXPLOSIVE: 3,
      MULTIPLIER: 2,
      POWERUP: 2,
      GHOST: 4,
    };
    const used: Partial<Record<BrickTypeName, number>> = {};
    const weights = this.typeWeights();
    const totalWeight = weights.reduce((sum, [, w]) => sum + w, 0);

    const pickType = (): BrickTypeName => {
      let roll = rng() * totalWeight;
      for (const [type, weight] of weights) {
        roll -= weight;
        if (roll <= 0) {
          const cap = caps[type];
          if (cap !== undefined && (used[type] ?? 0) >= cap) return 'NORMAL';
          used[type] = (used[type] ?? 0) + 1;
          return type;
        }
      }
      return 'NORMAL';
    };

    const specs: BrickSpec[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        if (!matrix[row][col]) continue;
        const type: BrickTypeName = row === movingRow ? 'MOVING' : pickType();
        specs.push({
          x: startX + col * stepX,
          z: b.topZ + row * stepZ,
          row,
          col,
          type,
        });
      }
    }
    return specs;
  }
}
