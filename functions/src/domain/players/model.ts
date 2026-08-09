/**
 * The authoritative player document.
 *
 * Mirrors the client's `Profile` in src/game/Progress.ts, but grouped and
 * with the fields the client must never own — wallet, inventory grants and
 * entitlements — separated out so it is obvious at a glance what is
 * server-authoritative.
 */

export const PLAYER_SCHEMA_VERSION = 2;

export interface PlayerStats {
  bestScore: number;
  bestLevel: number;
  bestCombo: number;
  runs: number;
  totalBricks: number;
  totalPlaySeconds: number;
  bestPerWorld: Record<string, number>;
}

export interface PlayerWallet {
  /** Server-authoritative. The client may display it, never set it. */
  coins: number;
  lifetimeCoinsEarned: number;
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
}

/** Free items every player starts with — must match src/game/Cosmetics.ts. */
export const DEFAULT_BALL = 'CLASSIC';
export const DEFAULT_PADDLE = 'CLASSIC';

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
      bestPerWorld: {},
    },
    wallet: { coins: 0, lifetimeCoinsEarned: 0 },
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
  };
}
