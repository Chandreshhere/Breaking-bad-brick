/**
 * SpectacleDirector — how much SHOW each level carries, independent of
 * gameplay difficulty. Levels inside each 3-level world block stage up
 * (build → pressure → climax), and deeper world cycles raise the floor,
 * but values always keep peaks and valleys — never everything at maximum
 * continuously. The in-level wave (INTRO→…→RELEASE) stays with the
 * DifficultyDirector; these are the per-level baselines it plays against.
 */

export interface SpectacleTargets {
  /** Scales the biome's weather intensity. */
  weather: number;
  /** Raises the adaptive-music floor. */
  music: number;
  /** Feeds particle/glow energy on top of combo heat. */
  visual: number;
}

export class SpectacleDirector {
  targetsForLevel(level: number): SpectacleTargets {
    const positionInBlock = (level - 1) % 3; // 0 build, 1 pressure, 2 climax
    const cycleDepth = Math.min(1, Math.floor((level - 1) / 3) / 5);
    const stagePeak = [0.35, 0.6, 0.85][positionInBlock];
    const base = Math.min(1, stagePeak + cycleDepth * 0.15);
    return {
      weather: base,
      music: 0.2 + base * 0.5,
      visual: base,
    };
  }
}
