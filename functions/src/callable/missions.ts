import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { col } from '../utils/firestore';
import { requireUid } from '../security/auth';
import { fail } from '../utils/errors';
import { auditLog } from '../utils/logging';
import { str } from '../security/validation';
import { MISSIONS } from '../domain/missions/missions';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Claims a completed mission's reward.
 *
 * Completion is decided when a run is validated; this only pays out, and
 * only once — the claimed flag is set inside the same transaction that
 * credits the coins.
 */
export const claimMission = onCall(
  { region: 'us-central1', maxInstances: 10 },
  async (req: CallableRequest) => {
    const uid = requireUid(req);
    const id = str((req.data as Record<string, unknown>)?.['id'], 'id', 48);
    const def = MISSIONS.find((m) => m.id === id);
    if (!def) throw fail.notFound('Mission');

    const progressRef = col.players().doc(uid).collection('missions').doc(id);
    const playerRef = col.players().doc(uid);

    const result = await col.players().firestore.runTransaction(async (tx) => {
      const [p, pl] = await Promise.all([tx.get(progressRef), tx.get(playerRef)]);
      if (!pl.exists) throw fail.notFound('Player');
      const prog = p.exists ? (p.data() as { value: number; claimed: boolean }) : null;
      if (!prog || prog.value < def.target) return { ok: false as const, reason: 'INCOMPLETE' };
      if (prog.claimed) return { ok: false as const, reason: 'ALREADY_CLAIMED' };

      tx.update(progressRef, { claimed: true, claimedAt: Date.now() });
      tx.update(playerRef, {
        'wallet.coins': FieldValue.increment(def.reward),
        'wallet.lifetimeCoinsEarned': FieldValue.increment(def.reward),
        updatedAt: Date.now(),
      });
      return { ok: true as const, reason: 'OK', reward: def.reward };
    });

    if (result.ok) auditLog('mission_claimed', uid, { id, reward: def.reward });
    return result;
  }
);
