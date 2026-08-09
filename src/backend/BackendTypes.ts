/**
 * Shapes shared between the game client and Cloud Functions.
 *
 * Kept deliberately free of Firebase imports so that game code can reference
 * these types without pulling the SDK into the main bundle.
 */

export interface RemoteConfigValues {
  dropChance: number;
  coinsPer100Points: number;
  livesPerRun: number;
  adsEnabled: boolean;
  interstitialEveryNRuns: number;
  continuesPerRun: number;
  dailyEnabled: boolean;
  leaderboardEnabled: boolean;
  maxRunsPerHour: number;
}

export interface RemotePlayer {
  uid: string;
  displayName: string;
  updatedAt: number;
  schemaVersion: number;
  stats: {
    bestScore: number;
    bestLevel: number;
    bestCombo: number;
    runs: number;
    totalBricks: number;
    totalPlaySeconds: number;
    bestPerWorld: Record<string, number>;
  };
  wallet: { coins: number; lifetimeCoinsEarned: number };
  inventory: {
    ownedBalls: string[];
    ownedPaddles: string[];
    equippedBall: string;
    equippedPaddle: string;
    unlockedWorlds: string[];
  };
  entitlements: { removeAds: boolean; premium: boolean };
  settings: Record<string, unknown>;
  flags: { consentAds: boolean; consentAnalytics: boolean; legacyMigrated: boolean };
}

export interface AppStatus {
  minVersion: string;
  maintenance: boolean;
  message: string | null;
}

export interface BootstrapResult {
  player: RemotePlayer;
  config: RemoteConfigValues;
  daily: unknown | null;
  missions: unknown[];
  catalogue: unknown | null;
  app: AppStatus;
  serverTime: number;
}

export interface SyncProfileResult {
  player: RemotePlayer;
  /** Items the client claimed that the server would not vouch for. */
  rejectedItems: string[];
}

export interface RunTicket {
  runId: string;
  mode: string;
  seed: number;
  expiresAt: number;
  ticket: string;
}

export interface RunSubmission {
  runId: string;
  score: number;
  levelReached: number;
  bestCombo: number;
  bricksDestroyed: number;
  durationSeconds: number;
  continuesUsed: number;
}

export interface SubmitRunResult {
  accepted: boolean;
  verification: 'VERIFIED' | 'UNVERIFIED';
  coinsAwarded: number;
  player: RemotePlayer;
}

export interface PurchaseResult {
  ok: boolean;
  reason: string;
  player: RemotePlayer;
}

/** Queued mutation shape. Kept small — it is persisted between sessions. */
export interface OutboxItem {
  id: string;
  op: 'submitRun' | 'purchaseCosmetic' | 'equipCosmetic' | 'syncProfile';
  payload: unknown;
  idempotencyKey: string;
  createdAt: number;
  retries: number;
}

/** Everything the game needs from the backend, with no Firebase in sight. */
export interface RemoteProgressApi {
  readonly enabled: boolean;
  readonly online: boolean;
  bootstrap(): Promise<BootstrapResult | null>;
  enqueue(op: OutboxItem['op'], payload: unknown): void;
  flush(): Promise<void>;
}
