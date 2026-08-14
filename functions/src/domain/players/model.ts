/**
 * The authoritative player document.
 *
 * Mirrors the client's `Profile` in src/game/Progress.ts, but grouped and
 * with the fields the client must never own — wallet, inventory grants and
 * entitlements — separated out so it is obvious at a glance what is
 * server-authoritative.
 */

export const PLAYER_SCHEMA_VERSION = 3;

export interface PlayerStats {
  bestScore: number;
  bestLevel: number;
  bestCombo: number;
  runs: number;
  totalBricks: number;
  totalPlaySeconds: number;
}

export interface PlayerWallet {
  /** Server-authoritative. The client may display it, never set it. */
  coins: number;
  lifetimeCoinsEarned: number;
  /**
   * Budget for coins earned from runs the server could not verify.
   *
   * An unticketed run is indistinguishable from a fabricated one, so its
   * earnings are metered rather than trusted — see
   * UNVERIFIED_COIN_CAP_PER_DAY in domain/runs/validate.ts. The day key is
   * UTC so the budget cannot be reset by changing timezone.
   */
  unverifiedDay: string;
  unverifiedCoinsToday: number;
}

export interface PlayerInventory {
  ownedBalls: string[];
  ownedPaddles: string[];
  equippedBall: string;
  equippedPaddle: string;
  unlockedWorlds: string[];
}

export interface PlayerEntitlements {
  removeAds: boolean;
  premium: boolean;
}

export interface PlayerSettings {
  musicVolume: number;
  sfxVolume: number;
  screenShake: 'FULL' | 'REDUCED' | 'OFF';
  bloom: number;
  rainQuality: 'LOW' | 'MEDIUM' | 'HIGH';
  graphics: 'AUTO' | 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface PlayerFlags {
  consentAds: boolean;
  consentAnalytics: boolean;
  /** True once the legacy localStorage profile has been folded in. */
  legacyMigrated: boolean;
}

export interface PlayerDoc {
  uid: string;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
  displayName: string;
  country: string | null;
  stats: PlayerStats;
  wallet: PlayerWallet;
  inventory: PlayerInventory;
  entitlements: PlayerEntitlements;
  settings: PlayerSettings;
  flags: PlayerFlags;
  /**
   * Boards this player has an entry on.
   *
   * Deletion has to remove those entries, and the alternative — listing every
   * board in the database and trying a delete on each — grows by one board
   * per day forever, so it gets slower every day the game is live and
   * eventually times out. Recording the handful of boards a player actually
   * reached makes deletion cost proportional to that player.
   */
  rankedBoards: string[];
}

/** Free items every player starts with — must match src/game/Cosmetics.ts. */
export const DEFAULT_BALL = 'CLASSIC';
export const DEFAULT_PADDLE = 'CLASSIC';

/** Keeps `rankedBoards` bounded for a player who plays every daily for years. */
export const MAX_TRACKED_BOARDS = 400;

export function defaultPlayer(uid: string, now: number, country: string | null): PlayerDoc {
  return {
    uid,
    createdAt: now,
    updatedAt: now,
    schemaVersion: PLAYER_SCHEMA_VERSION,
    // Non-identifying by design: we store no PII beyond the auth identifier.
    displayName: `Player${Math.floor(1000 + Math.random() * 9000)}`,
    country,
    stats: {
      bestScore: 0,
      bestLevel: 1,
      bestCombo: 0,
      runs: 0,
      totalBricks: 0,
      totalPlaySeconds: 0,
    },
    wallet: { coins: 0, lifetimeCoinsEarned: 0, unverifiedDay: '', unverifiedCoinsToday: 0 },
    inventory: {
      ownedBalls: [DEFAULT_BALL],
      ownedPaddles: [DEFAULT_PADDLE],
      equippedBall: DEFAULT_BALL,
      equippedPaddle: DEFAULT_PADDLE,
      unlockedWorlds: ['CLAY'],
    },
    entitlements: { removeAds: false, premium: false },
    settings: {
      musicVolume: 0.7,
      sfxVolume: 0.8,
      screenShake: 'FULL',
      bloom: 0.6,
      rainQuality: 'MEDIUM',
      graphics: 'AUTO',
    },
    flags: { consentAds: false, consentAnalytics: false, legacyMigrated: false },
    rankedBoards: [],
  };
}

/**
 * Fills in whatever a stored document is missing.
 *
 * Two things produce a partial document and both are normal: a schema that
 * gained a field since the document was written, and a merge-write that
 * touched one group before the player was ever created. Handing either
 * straight back to the client crashes it on the first `wallet.coins` read, so
 * every read of a player document goes through here.
 *
 * Group-by-group rather than a deep merge, because a deep merge would also
 * happily resurrect fields that were deliberately removed.
 */
export function hydratePlayer(raw: Partial<PlayerDoc> | undefined, uid: string): PlayerDoc {
  const base = defaultPlayer(uid, Date.now(), null);
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    uid,
    createdAt: raw.createdAt ?? base.createdAt,
    schemaVersion: PLAYER_SCHEMA_VERSION,
    stats: { ...base.stats, ...raw.stats },
    wallet: { ...base.wallet, ...raw.wallet },
    inventory: { ...base.inventory, ...raw.inventory },
    entitlements: { ...base.entitlements, ...raw.entitlements },
    settings: { ...base.settings, ...raw.settings },
    flags: { ...base.flags, ...raw.flags },
    rankedBoards: raw.rankedBoards ?? base.rankedBoards,
  };
}
