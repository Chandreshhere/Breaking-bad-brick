import type { RunClaim } from '../runs/validate';

/**
 * Mission definitions.
 *
 * Progress is evaluated **server-side from a validated run**, never asserted
 * by the client. A client that can say "mission complete" can say it a
 * hundred times, and the reward is currency.
 */
export interface MissionDef {
  id: string;
  text: string;
  metric: 'SCORE' | 'LEVEL' | 'COMBO' | 'BRICKS';
  target: number;
  reward: number;
}

export const MISSIONS: MissionDef[] = [
  { id: 'score_5k', text: 'Score 5,000 in one run', metric: 'SCORE', target: 5000, reward: 100 },
  { id: 'combo_25', text: 'Reach a 25 hit combo', metric: 'COMBO', target: 25, reward: 150 },
  { id: 'level_5', text: 'Reach level 5', metric: 'LEVEL', target: 5, reward: 120 },
  { id: 'bricks_200', text: 'Break 200 bricks in a run', metric: 'BRICKS', target: 200, reward: 130 },
];

/** Value a finished run contributes to a mission's metric. */
export function runValueFor(def: MissionDef, run: RunClaim): number {
  switch (def.metric) {
    case 'SCORE':
      return run.score;
    case 'LEVEL':
      return run.levelReached;
    case 'COMBO':
      return run.bestCombo;
    case 'BRICKS':
      return run.bricksDestroyed;
  }
}

/** Worlds unlock by reaching the level that would rotate them in. */
export const WORLD_UNLOCKS: Array<{ world: string; atLevel: number }> = [
  { world: 'CLAY', atLevel: 1 },
  { world: 'NEON', atLevel: 4 },
  { world: 'HELL', atLevel: 7 },
  { world: 'LOTUS_OS', atLevel: 10 },
  { world: 'NEON_ARCADE', atLevel: 13 },
  { world: 'COMIC_IMPACT', atLevel: 16 },
];

export function worldsUnlockedAt(bestLevel: number): string[] {
  return WORLD_UNLOCKS.filter((w) => bestLevel >= w.atLevel).map((w) => w.world);
}
