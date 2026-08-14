import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { col } from '../utils/firestore';
import { requireUid, checkAppAttestation } from '../security/auth';
import { rateLimit } from '../security/rateLimit';
import { fail } from '../utils/errors';
import { auditLog, auditWarn } from '../utils/logging';
import { int, str } from '../security/validation';
import { type PlayerDoc } from '../domain/players/model';
import { playerFromSnapshot } from '../domain/players/repo';
import { mergeClientProfile, type ClientProfileSnapshot } from '../domain/players/merge';

/**
 * Pushes the client's local profile up and returns the authoritative one.
 *
 * Runs in a transaction because two devices can sync concurrently and a
 * read-modify-write outside one would drop whichever landed second.
 */

function parseSnapshot(raw: unknown): ClientProfileSnapshot {
  if (typeof raw !== 'object' || raw === null) throw fail.badRequest('profile required');
  const p = raw as Record<string, unknown>;
  const stats = (p['stats'] ?? {}) as Record<string, unknown>;
  const inv = (p['inventory'] ?? {}) as Record<string, unknown>;

  const list = (v: unknown, field: string): string[] => {
    if (!Array.isArray(v)) throw fail.badRequest(`${field} must be an array`);
    if (v.length > 64) throw fail.badRequest(`${field} too long`);
    return v.map((x) => str(x, field, 32));
  };

  return {
    updatedAt: int(p['updatedAt'] ?? 0, 'updatedAt', 0, Number.MAX_SAFE_INTEGER),
    stats: {
      bestScore: int(stats['bestScore'] ?? 0, 'bestScore', 0, 1_000_000_000),
      bestLevel: int(stats['bestLevel'] ?? 1, 'bestLevel', 1, 100_000),
      bestCombo: int(stats['bestCombo'] ?? 0, 'bestCombo', 0, 100_000),
      runs: int(stats['runs'] ?? 0, 'runs', 0, 10_000_000),
      totalBricks: int(stats['totalBricks'] ?? 0, 'totalBricks', 0, 1_000_000_000),
      totalPlaySeconds: int(stats['totalPlaySeconds'] ?? 0, 'totalPlaySeconds', 0, 100_000_000),
    },
    inventory: {
      ownedBalls: list(inv['ownedBalls'] ?? [], 'ownedBalls'),
      ownedPaddles: list(inv['ownedPaddles'] ?? [], 'ownedPaddles'),
      equippedBall: str(inv['equippedBall'] ?? 'CLASSIC', 'equippedBall', 32),
      equippedPaddle: str(inv['equippedPaddle'] ?? 'CLASSIC', 'equippedPaddle', 32),
    },
    settings: (p['settings'] as Record<string, unknown>) ?? undefined,
  };
}

export const syncProfile = onCall(
  { region: 'us-central1', maxInstances: 20 },
  async (req: CallableRequest): Promise<{ player: PlayerDoc; rejectedItems: string[] }> => {
    const uid = requireUid(req);
    checkAppAttestation(req, 'syncProfile');
    await rateLimit(uid, 'syncProfile', 60, 300); // 60 per 5 minutes

    const snapshot = parseSnapshot((req.data as Record<string, unknown>)?.['profile']);
    const ref = col.players().doc(uid);

    const result = await col
      .players()
      .firestore.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const server = playerFromSnapshot(snap, uid);

        // The very first sync for this player imports whatever they had
        // before the backend existed. Never again — otherwise clearing
        // storage and re-syncing would be a way to re-grant items.
        const migrateLegacy = !server.flags.legacyMigrated;

        const merged = mergeClientProfile(server, snapshot, { migrateLegacy });
        tx.set(ref, merged.player);
        return merged;
      });

    if (result.rejectedItems.length > 0) {
      auditWarn('inventory_claim_rejected', uid, { items: result.rejectedItems });
    }
    if (result.changed) {
      auditLog('profile_synced', uid, {
        bestScore: result.player.stats.bestScore,
        migrated: result.player.flags.legacyMigrated,
      });
    }

    return { player: result.player, rejectedItems: result.rejectedItems };
  }
);
