import type { VisualConfig } from '../config/visual.config';

export interface ComboEvents {
  tierIndex: number; // -1 when below the first tier
  tierEntered: boolean; // crossed into a new tier this hit
  overdriveEntered: boolean;
}

/**
 * HIT → COMBO → MULTIPLIER → OVERDRIVE. Brick destructions build the
 * combo; it drains on a timer and resets when a ball is lost — paddle
 * contact does NOT reset it. Combo drives score multipliers and a 0..1
 * energy value that visual systems read; it never touches ball speed.
 */
export class ComboManager {
  combo = 0;
  highestCombo = 0;
  private comboTimer = 0;
  private overdriveTimer = 0;

  constructor(private cfg: VisualConfig) {}

  get overdriveActive(): boolean {
    return this.overdriveTimer > 0;
  }

  /** 0..1 charge toward overdrive (pegged at 1 while it is active). */
  get overdriveCharge(): number {
    if (this.overdriveActive) return 1;
    return Math.min(1, this.combo / this.cfg.game.combo.overdriveHits);
  }

  /** Visual energy 0..1 — glow, trails, sparks, UI intensity. */
  get energy(): number {
    return this.overdriveActive ? 1 : this.overdriveCharge * 0.85;
  }

  private tierIndexFor(combo: number): number {
    const tiers = this.cfg.game.combo.tiers;
    let index = -1;
    for (let i = 0; i < tiers.length; i++) {
      if (combo >= tiers[i].hits) index = i;
    }
    return index;
  }

  get multiplier(): number {
    if (this.overdriveActive) return this.cfg.game.combo.overdriveMult;
    const index = this.tierIndexFor(this.combo);
    return index === -1 ? 1 : this.cfg.game.combo.tiers[index].mult;
  }

  registerHit(): ComboEvents {
    const before = this.tierIndexFor(this.combo);
    this.combo += 1;
    this.highestCombo = Math.max(this.highestCombo, this.combo);
    this.comboTimer = this.cfg.game.combo.decaySeconds;
    const after = this.tierIndexFor(this.combo);

    let overdriveEntered = false;
    if (!this.overdriveActive && this.combo >= this.cfg.game.combo.overdriveHits) {
      this.overdriveTimer = this.cfg.game.combo.overdriveDuration;
      overdriveEntered = true;
    }
    return { tierIndex: after, tierEntered: after > before, overdriveEntered };
  }

  onBallLost(): void {
    this.combo = 0;
    this.comboTimer = 0;
    this.overdriveTimer = 0;
  }

  update(dt: number): void {
    if (this.overdriveTimer > 0) this.overdriveTimer -= dt;
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
      }
    }
  }

  reset(): void {
    this.combo = 0;
    this.comboTimer = 0;
    this.overdriveTimer = 0;
  }
}
