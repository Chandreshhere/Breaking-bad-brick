/**
 * Tier 1 plausibility validation.
 *
 * The simulation runs on the client, so this can never *prove* a run
 * happened. What it does is make a forged score expensive: a cheater has to
 * fake a self-consistent run — score, brick count, level and duration all
 * agreeing — rather than posting a large number. Combined with the run
 * ticket, that removes casual tampering, which is the entire realistic goal
 * until deterministic replay lands (see PRODUCTION_SPEC Appendix C).
 *
 * Bounds are deliberately generous. A false reject costs a real player their
 * run and their coins; a false accept costs a leaderboard slot. Ties go to
 * the player.
 */

export interface RunClaim {
  score: number;
  levelReached: number;
  bestCombo: number;
  bricksDestroyed: number;
  durationSeconds: number;
  continuesUsed: number;
}

/** Mirrors the game's scoring: 100 base x brick multiplier x combo. */
const BRICK_SCORE = 100;
const MAX_BRICK_MULT = 10; // BOSS
const MAX_COMBO_MULT = 5; // OVERDRIVE
const NO_MISS_BONUS = 500;
/** A brick cannot be reached, hit and destroyed faster than this. */
const MIN_SECONDS_PER_BRICK = 0.12;
/** Even a perfect player needs some time per level. */
const MIN_SECONDS_PER_LEVEL = 4;

export type Verdict =
  | { ok: true }
  | { ok: false; reason: string };

export function validateRun(c: RunClaim): Verdict {
  if (c.score < 0 || c.bricksDestroyed < 0 || c.durationSeconds < 0) {
    return { ok: false, reason: 'NEGATIVE_VALUES' };
  }
  if (c.levelReached < 1 || c.levelReached > 10_000) {
    return { ok: false, reason: 'LEVEL_OUT_OF_RANGE' };
  }

  // A combo counts brick kills, so it cannot exceed them.
  if (c.bestCombo > c.bricksDestroyed) {
    return { ok: false, reason: 'COMBO_EXCEEDS_BRICKS' };
  }

  // Ceiling: every brick a boss brick, every hit at max combo, plus a
  // no-miss bonus on every level. Nothing legitimate can beat this.
  const ceiling =
    c.bricksDestroyed * BRICK_SCORE * MAX_BRICK_MULT * MAX_COMBO_MULT +
    c.levelReached * NO_MISS_BONUS;
  if (c.score > ceiling) {
    return { ok: false, reason: 'SCORE_EXCEEDS_CEILING' };
  }

  // Floor on time: bricks and levels both take a minimum amount of play.
  const minDuration = Math.max(
    c.bricksDestroyed * MIN_SECONDS_PER_BRICK,
    (c.levelReached - 1) * MIN_SECONDS_PER_LEVEL
  );
  if (c.durationSeconds + 1 < minDuration) {
    return { ok: false, reason: 'DURATION_TOO_SHORT' };
  }

  // 24h is far beyond any real session and suggests a tampered clock.
  if (c.durationSeconds > 86_400) {
    return { ok: false, reason: 'DURATION_TOO_LONG' };
  }

  if (c.continuesUsed < 0 || c.continuesUsed > 10) {
    return { ok: false, reason: 'CONTINUES_OUT_OF_RANGE' };
  }

  return { ok: true };
}

/**
 * Coins for a finished run. Computed here and nowhere else — the client is
 * told the number, it never proposes one.
 */
export function coinsForRun(score: number, coinsPer100: number): number {
  const earned = Math.floor(score / 100) * coinsPer100;
  // Ceiling per run, so a validation gap can never mint an unbounded balance.
  return Math.max(0, Math.min(earned, 10_000));
}
