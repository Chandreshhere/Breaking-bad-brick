/**
 * The player's persistent profile — the thing the game was missing entirely.
 *
 * Before this, nothing survived a session: no best score, no progress, no
 * reason to come back. Everything that accumulates lives here, in one
 * localStorage key, written through a guard so private-mode browsers (where
 * localStorage throws) degrade to an in-memory profile instead of crashing.
 */

const KEY = 'acb-profile';

/** Shape version of the local profile. */
export const PROFILE_SCHEMA_VERSION = 2;

/** The subset the server merges. Coins are deliberately absent — see below. */
export interface ProfileSnapshot {
  updatedAt: number;
  stats: {
    bestScore: number;
    bestLevel: number;
    bestCombo: number;
    runs: number;
  };
  inventory: {
    ownedBalls: string[];
    ownedPaddles: string[];
    equippedBall: string;
    equippedPaddle: string;
  };
}

export interface Profile {
  /** Bumped when the shape changes so old saves can be upgraded, not lost. */
  schemaVersion: number;
  /** Client clock, used as the tiebreak for last-write-wins fields. */
  updatedAt: number;
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
    schemaVersion: PROFILE_SCHEMA_VERSION,
    updatedAt: 0,
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
  /**
   * True once a backend has answered. From that point the wallet belongs to
   * the server: the client stops minting coins locally and simply displays
   * whatever the server last said.
   *
   * The flag exists because the game must work identically with no backend
   * at all, where the client necessarily *is* the authority.
   */
  serverAuthoritative = false;

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
      this.data.updatedAt = Date.now();
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
    // Only mint locally when nobody else will. With a backend live, coins
    // arrive from submitRun — adding them here too would double-pay, then
    // get silently reverted on the next sync.
    if (!this.serverAuthoritative) this.data.coins += coinsEarned;
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

  /**
   * Local purchase. Only used when there is no backend — with one live the
   * shop calls `purchaseCosmetic` and applies the server's answer instead,
   * because a client that debits its own wallet is only ever role-playing.
   */
  buy(kind: 'ball' | 'paddle', id: string, price: number): boolean {
    if (this.serverAuthoritative) return false;
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

  /**
   * What the server needs to reconcile this device.
   *
   * `coins` is intentionally not included. The wallet is server-owned, and
   * the local balance came from a freely editable localStorage value, so
   * sending it would invite exactly the forgery the server exists to stop.
   */
  snapshot(): ProfileSnapshot {
    return {
      updatedAt: this.data.updatedAt,
      stats: {
        bestScore: this.data.bestScore,
        bestLevel: this.data.bestLevel,
        bestCombo: this.data.bestCombo,
        runs: this.data.runs,
      },
      inventory: {
        ownedBalls: [...this.data.ownedBalls],
        ownedPaddles: [...this.data.ownedPaddles],
        equippedBall: this.data.ball,
        equippedPaddle: this.data.paddle,
      },
    };
  }

  /**
   * Adopts the reconciled profile the server returned.
   *
   * Records and inventory take the server's value, which has already merged
   * this device's contribution. The wallet is left alone until the server
   * owns coin *earning* too — adopting a server balance of 0 while the
   * client is still awarding coins locally would simply erase them every
   * sync. That switchover happens with run submission.
   */
  applyRemote(remote: {
    wallet?: { coins: number };
    stats: { bestScore: number; bestLevel: number; bestCombo: number; runs: number };
    inventory: {
      ownedBalls: string[];
      ownedPaddles: string[];
      equippedBall: string;
      equippedPaddle: string;
    };
  }): void {
    // Records take the higher of the two: a record set moments ago on this
    // device may not have reached the server yet, and losing it would be
    // worse than briefly disagreeing.
    this.data.bestScore = Math.max(this.data.bestScore, remote.stats.bestScore);
    this.data.bestLevel = Math.max(this.data.bestLevel, remote.stats.bestLevel);
    this.data.bestCombo = Math.max(this.data.bestCombo, remote.stats.bestCombo);
    this.data.runs = Math.max(this.data.runs, remote.stats.runs);

    // Inventory is *replaced*, not merged. The server has already folded in
    // whatever this device legitimately owned, so anything missing from its
    // answer was refused — and re-adding it here would quietly restore the
    // exact claims the server just rejected.
    //
    // Consequence worth knowing: while purchases are still made locally,
    // a skin bought offline is provisional until buying moves server-side.
    this.data.ownedBalls = [...remote.inventory.ownedBalls];
    this.data.ownedPaddles = [...remote.inventory.ownedPaddles];
    this.data.ball = this.data.ownedBalls.includes(remote.inventory.equippedBall)
      ? remote.inventory.equippedBall
      : 'CLASSIC';
    this.data.paddle = this.data.ownedPaddles.includes(remote.inventory.equippedPaddle)
      ? remote.inventory.equippedPaddle
      : 'CLASSIC';
    // The wallet is adopted wholesale once the server owns it. Taking a max
    // here instead would let a tampered local balance survive forever.
    if (this.serverAuthoritative && remote.wallet) this.data.coins = remote.wallet.coins;
    this.save();
  }
}
