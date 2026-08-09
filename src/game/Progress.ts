/**
 * The player's persistent profile — the thing the game was missing entirely.
 *
 * Before this, nothing survived a session: no best score, no progress, no
 * reason to come back. Everything that accumulates lives here, in one
 * localStorage key, written through a guard so private-mode browsers (where
 * localStorage throws) degrade to an in-memory profile instead of crashing.
 */

const KEY = 'acb-profile';

export interface Profile {
  bestScore: number;
  bestLevel: number;
  bestCombo: number;
  coins: number;
  runs: number;
  ownedBalls: string[];
  ownedPaddles: string[];
  ball: string;
  paddle: string;
}

function blank(): Profile {
  return {
    bestScore: 0,
    bestLevel: 1,
    bestCombo: 0,
    coins: 0,
    runs: 0,
    ownedBalls: ['CLASSIC'],
    ownedPaddles: ['CLASSIC'],
    ball: 'CLASSIC',
    paddle: 'CLASSIC',
  };
}

export class ProgressStore {
  private data: Profile = blank();

  constructor() {
    this.load();
  }

  get profile(): Readonly<Profile> {
    return this.data;
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Profile>;
      // Merge onto a blank so a profile saved by an older build — one
      // without `bestCombo`, say — gains the new fields instead of
      // producing undefined everywhere.
      this.data = { ...blank(), ...parsed };
      if (!this.data.ownedBalls.includes('CLASSIC')) this.data.ownedBalls.push('CLASSIC');
      if (!this.data.ownedPaddles.includes('CLASSIC')) this.data.ownedPaddles.push('CLASSIC');
    } catch {
      this.data = blank();
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* private mode — keep going in memory */
    }
  }

  /**
   * Files a finished run. Returns what changed, so the results screen can
   * say "NEW BEST" or "900 SHORT" — the near-miss line is the hook.
   */
  finishRun(score: number, level: number, combo: number): {
    coinsEarned: number;
    isBest: boolean;
    previousBest: number;
    shortBy: number;
  } {
    const previousBest = this.data.bestScore;
    const isBest = score > previousBest;
    // 1 coin per 100 points, so a decent run buys a cheap skin and a great
    // run buys a good one. Round down; a zero-score run earns nothing.
    const coinsEarned = Math.floor(score / 100);

    this.data.runs += 1;
    this.data.coins += coinsEarned;
    if (isBest) this.data.bestScore = score;
    if (level > this.data.bestLevel) this.data.bestLevel = level;
    if (combo > this.data.bestCombo) this.data.bestCombo = combo;
    this.save();

    return {
      coinsEarned,
      isBest,
      previousBest,
      shortBy: isBest ? 0 : previousBest - score,
    };
  }

  owns(kind: 'ball' | 'paddle', id: string): boolean {
    const list = kind === 'ball' ? this.data.ownedBalls : this.data.ownedPaddles;
    return list.includes(id);
  }

  /** Returns false when the player can't afford it or already owns it. */
  buy(kind: 'ball' | 'paddle', id: string, price: number): boolean {
    if (this.owns(kind, id)) return false;
    if (this.data.coins < price) return false;
    this.data.coins -= price;
    (kind === 'ball' ? this.data.ownedBalls : this.data.ownedPaddles).push(id);
    this.equip(kind, id); // buying it means you want to use it
    return true;
  }

  equip(kind: 'ball' | 'paddle', id: string): void {
    if (!this.owns(kind, id)) return;
    if (kind === 'ball') this.data.ball = id;
    else this.data.paddle = id;
    this.save();
  }

  /** Rewarded-ad payout. */
  grantCoins(n: number): void {
    this.data.coins += Math.max(0, Math.floor(n));
    this.save();
  }
}
