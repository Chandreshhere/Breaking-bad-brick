import type { PlayerDoc, PlayerSettings } from './model';

/**
 * Reconciles a client's local profile into the authoritative document.
 *
 * The client is offline-first, so conflicts are guaranteed, not exceptional:
 * two devices, or one device that played through a tunnel, will both arrive
 * with divergent state. Every field therefore has an explicit rule rather
 * than a blanket last-write-wins, which would silently destroy progress.
 */

export interface ClientProfileSnapshot {
  updatedAt: number;
  stats: {
    bestScore: number;
    bestLevel: number;
    bestCombo: number;
    runs: number;
    totalBricks?: number;
    totalPlaySeconds?: number;
  };
  inventory: {
    ownedBalls: string[];
    ownedPaddles: string[];
    equippedBall: string;
    equippedPaddle: string;
  };
  settings?: Record<string, unknown>;
}

/** Items a client is allowed to claim without a purchase record. */
const FREE_ITEMS = new Set(['CLASSIC']);

/**
 * Whether the first sync imports cosmetics the client already claims to own.
 *
 * FALSE before public launch, and it should stay false unless there is a real
 * player base to protect. The pre-backend build stored inventory in editable
 * localStorage, so honouring those claims lets anyone grant themselves the
 * whole catalogue by writing one key before their first sign-in — the same
 * hole as importing legacy coins, just wearing a different hat.
 *
 * Flip to true ONLY if real players earned cosmetics on the old build, and
 * accept that some claims will be forged.
 */
const LEGACY_COSMETIC_IMPORT = false;

function union(a: string[], b: string[], allowed: Set<string> | null): string[] {
  const out = new Set(a);
  for (const item of b) {
    // A client may only *add* items it could legitimately have: free items,
    // or ones the server already granted. Otherwise anyone could hand
    // themselves the whole catalogue by editing localStorage before syncing.
    if (allowed === null || allowed.has(item) || FREE_ITEMS.has(item)) out.add(item);
  }
  return [...out];
}

const SHAKE: PlayerSettings['screenShake'][] = ['FULL', 'REDUCED', 'OFF'];
const RAIN: PlayerSettings['rainQuality'][] = ['LOW', 'MEDIUM', 'HIGH'];
const GRAPHICS: PlayerSettings['graphics'][] = ['AUTO', 'LOW', 'MEDIUM', 'HIGH'];

/**
 * Copies only known settings keys, and only when the value is of the right
 * shape. A blind spread would let a client write arbitrary fields into the
 * player document — a small hole, but a free one to close.
 */
function mergeSettings(
  server: PlayerSettings,
  client: Record<string, unknown>
): PlayerSettings {
  const out: PlayerSettings = { ...server };
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

  if (num(client['musicVolume'])) out.musicVolume = clamp01(client['musicVolume']);
  if (num(client['sfxVolume'])) out.sfxVolume = clamp01(client['sfxVolume']);
  if (num(client['bloom'])) out.bloom = Math.min(3, Math.max(0, client['bloom']));
  if (SHAKE.includes(client['screenShake'] as PlayerSettings['screenShake'])) {
    out.screenShake = client['screenShake'] as PlayerSettings['screenShake'];
  }
  if (RAIN.includes(client['rainQuality'] as PlayerSettings['rainQuality'])) {
    out.rainQuality = client['rainQuality'] as PlayerSettings['rainQuality'];
  }
  if (GRAPHICS.includes(client['graphics'] as PlayerSettings['graphics'])) {
    out.graphics = client['graphics'] as PlayerSettings['graphics'];
  }
  return out;
}

export interface MergeResult {
  player: PlayerDoc;
  changed: boolean;
  rejectedItems: string[];
}

export function mergeClientProfile(
  server: PlayerDoc,
  client: ClientProfileSnapshot,
  opts: { migrateLegacy: boolean }
): MergeResult {
  const next: PlayerDoc = structuredClone(server);
  const rejected: string[] = [];

  // ── Records: highest wins, whichever device set it ────────────────────
  next.stats.bestScore = Math.max(server.stats.bestScore, client.stats.bestScore ?? 0);
  next.stats.bestLevel = Math.max(server.stats.bestLevel, client.stats.bestLevel ?? 1);
  next.stats.bestCombo = Math.max(server.stats.bestCombo, client.stats.bestCombo ?? 0);

  // Monotonic counters: max, not sum. Summing would double-count every
  // resync of the same device.
  next.stats.runs = Math.max(server.stats.runs, client.stats.runs ?? 0);
  next.stats.totalBricks = Math.max(server.stats.totalBricks, client.stats.totalBricks ?? 0);
  next.stats.totalPlaySeconds = Math.max(
    server.stats.totalPlaySeconds,
    client.stats.totalPlaySeconds ?? 0
  );

  // ── Inventory: union, but only of items the server can vouch for ──────
  const granted = new Set([...server.inventory.ownedBalls, ...server.inventory.ownedPaddles]);
  const beforeBalls = next.inventory.ownedBalls.length;
  const beforePaddles = next.inventory.ownedPaddles.length;

  if (opts.migrateLegacy && LEGACY_COSMETIC_IMPORT) {
    // One-time import from the pre-backend build, only when explicitly
    // enabled for an existing player base.
    next.inventory.ownedBalls = union(server.inventory.ownedBalls, client.inventory.ownedBalls, null);
    next.inventory.ownedPaddles = union(
      server.inventory.ownedPaddles,
      client.inventory.ownedPaddles,
      null
    );
  } else {
    next.inventory.ownedBalls = union(server.inventory.ownedBalls, client.inventory.ownedBalls, granted);
    next.inventory.ownedPaddles = union(
      server.inventory.ownedPaddles,
      client.inventory.ownedPaddles,
      granted
    );
    for (const item of [...client.inventory.ownedBalls, ...client.inventory.ownedPaddles]) {
      if (!granted.has(item) && !FREE_ITEMS.has(item)) rejected.push(item);
    }
  }

  // ── Equipment + settings: last write wins, by the client's own clock ──
  // Safe to trust here: the worst a forged timestamp achieves is choosing
  // which skin you are wearing.
  if (client.updatedAt >= server.updatedAt) {
    if (next.inventory.ownedBalls.includes(client.inventory.equippedBall)) {
      next.inventory.equippedBall = client.inventory.equippedBall;
    }
    if (next.inventory.ownedPaddles.includes(client.inventory.equippedPaddle)) {
      next.inventory.equippedPaddle = client.inventory.equippedPaddle;
    }
    if (client.settings) next.settings = mergeSettings(next.settings, client.settings);
  }

  // ── Wallet: untouched. ────────────────────────────────────────────────
  // The client never supplies coins, and this merge never reads them. Coins
  // are granted only by server-side flows (run rewards, ad rewards, IAP).
  // Legacy localStorage balances are deliberately NOT imported: that field
  // was freely editable, so importing it would let anyone mint currency.

  next.flags.legacyMigrated = server.flags.legacyMigrated || opts.migrateLegacy;
  next.updatedAt = Date.now();

  const changed =
    next.stats.bestScore !== server.stats.bestScore ||
    next.stats.bestLevel !== server.stats.bestLevel ||
    next.stats.bestCombo !== server.stats.bestCombo ||
    next.stats.runs !== server.stats.runs ||
    next.inventory.ownedBalls.length !== beforeBalls ||
    next.inventory.ownedPaddles.length !== beforePaddles ||
    next.inventory.equippedBall !== server.inventory.equippedBall ||
    next.inventory.equippedPaddle !== server.inventory.equippedPaddle ||
    next.flags.legacyMigrated !== server.flags.legacyMigrated ||
    JSON.stringify(next.settings) !== JSON.stringify(server.settings);

  return { player: next, changed, rejectedItems: rejected };
}
