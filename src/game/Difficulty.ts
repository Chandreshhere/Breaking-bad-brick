/**
 * Dynamic difficulty: tension waves inside each level plus gentle
 * rubber-banding between levels. Never a linear speed ramp — the curve is
 * INTRO → BUILD → PRESSURE → CLIMAX → RELEASE, driven by how much of the
 * field is cleared. Struggling players quietly get slower serves and more
 * capsule drops; dominating players get the opposite.
 */

export type TensionPhase = 'INTRO' | 'BUILD' | 'PRESSURE' | 'CLIMAX' | 'RELEASE';

export class DifficultyDirector {
  private ballsLostThisLevel = 0;
  private levelStartBricks = 1;
  private remainingBricks = 1;
  private peakCombo = 0;

  onLevelStart(totalBricks: number): void {
    this.ballsLostThisLevel = 0;
    this.levelStartBricks = Math.max(1, totalBricks);
    this.remainingBricks = this.levelStartBricks;
    this.peakCombo = 0;
  }

  onBallLost(): void {
    this.ballsLostThisLevel += 1;
  }

  onBrickDestroyed(remaining: number, combo: number): void {
    this.remainingBricks = remaining;
    this.peakCombo = Math.max(this.peakCombo, combo);
  }

  private get clearedFraction(): number {
    return 1 - this.remainingBricks / this.levelStartBricks;
  }

  get phase(): TensionPhase {
    const f = this.clearedFraction;
    if (f < 0.15) return 'INTRO';
    if (f < 0.45) return 'BUILD';
    if (f < 0.75) return 'PRESSURE';
    if (f < 0.95) return 'CLIMAX';
    return 'RELEASE';
  }

  /** 0..1 tension for music/weather/VFX — the wave, not a ramp. */
  get tension(): number {
    const f = this.clearedFraction;
    if (f < 0.15) return (f / 0.15) * 0.25;
    if (f < 0.45) return 0.25 + ((f - 0.15) / 0.3) * 0.35;
    if (f < 0.75) return 0.6 + ((f - 0.45) / 0.3) * 0.4;
    if (f < 0.95) return 1;
    return 0.45; // release breath before the clear
  }

  /** Serve-speed rubber band: struggle → gentler, dominate → livelier. */
  get speedFactor(): number {
    if (this.ballsLostThisLevel >= 2) return 0.9;
    if (this.ballsLostThisLevel === 0 && this.peakCombo >= 25) return 1.06;
    return 1;
  }

  /** Capsule generosity: struggling players get more help. */
  get dropChanceScale(): number {
    if (this.ballsLostThisLevel >= 2) return 1.5;
    if (this.ballsLostThisLevel === 0 && this.peakCombo >= 25) return 0.8;
    return 1;
  }
}
