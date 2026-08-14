import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { col } from '../utils/firestore';
import { requireUid, checkAppAttestation } from '../security/auth';
import { rateLimit } from '../security/rateLimit';
import { withIdempotency } from '../security/idempotency';
import { fail } from '../utils/errors';
import { auditLog } from '../utils/logging';
import { oneOf, str } from '../security/validation';
import { type PlayerDoc } from '../domain/players/model';
import { playerFromSnapshot } from '../domain/players/repo';
import { loadCatalogue, priceOf } from '../domain/economy/catalogue';

const KINDS = ['ball', 'paddle'] as const;

/**
 * Buying a cosmetic.
 *
 * The client sends what it wants, never what it costs. The price comes from
 * the catalogue and the balance from the player document, both server-side,
 * inside a transaction — otherwise two taps on a slow connection can spend
 * the same coins twice.
 */
export const purchaseCosmetic = onCall(
  { region: 'us-central1', maxInstances: 20 },
  async (req: CallableRequest) => {
    const uid = requireUid(req);
    checkAppAttestation(req, 'purchaseCosmetic');
    await rateLimit(uid, 'purchase', 60, 3600);

    const d = (req.data ?? {}) as Record<string, unknown>;
    const kind = oneOf(d['kind'], 'kind', KINDS);
    const id = str(d['id'], 'id', 32);
    const idempotencyKey = d['idempotencyKey']
      ? str(d['idempotencyKey'], 'idempotencyKey', 64)
      : `buy_${kind}_${id}`;

    const catalogue = await loadCatalogue();
    const price = priceOf(catalogue, kind, id);
    if (price === null) throw fail.notFound(`Item ${id}`);

    return withIdempotency(uid, idempotencyKey, async () => {
      const ref = col.players().doc(uid);
      const result = await col.players().firestore.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const player = playerFromSnapshot(snap, uid);

        const owned = kind === 'ball' ? player.inventory.ownedBalls : player.inventory.ownedPaddles;
        if (owned.includes(id)) {
          return { ok: false as const, reason: 'ALREADY_OWNED', player };
        }
        if (player.wallet.coins < price) {
          return { ok: false as const, reason: 'INSUFFICIENT_FUNDS', player };
        }

        const next: PlayerDoc = structuredClone(player);
        next.wallet.coins -= price;
        if (kind === 'ball') {
          next.inventory.ownedBalls.push(id);
          next.inventory.equippedBall = id; // buying it means wearing it
        } else {
          next.inventory.ownedPaddles.push(id);
          next.inventory.equippedPaddle = id;
        }
        next.updatedAt = Date.now();
        tx.set(ref, next);
        return { ok: true as const, reason: 'OK', player: next };
      });

      if (result.ok) auditLog('item_purchased', uid, { kind, id, price });
      return { ok: result.ok, reason: result.reason, player: result.player };
    });
  }
);

/** Equipping is free, but you may only wear what the server says you own. */
export const equipCosmetic = onCall(
  { region: 'us-central1', maxInstances: 20 },
  async (req: CallableRequest) => {
    const uid = requireUid(req);
    checkAppAttestation(req, 'equipCosmetic');
    await rateLimit(uid, 'equip', 200, 3600);

    const d = (req.data ?? {}) as Record<string, unknown>;
    const kind = oneOf(d['kind'], 'kind', KINDS);
    const id = str(d['id'], 'id', 32);

    const ref = col.players().doc(uid);
    const player = await col.players().firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw fail.notFound('Player');
      const p = playerFromSnapshot(snap, uid);
      const owned = kind === 'ball' ? p.inventory.ownedBalls : p.inventory.ownedPaddles;
      if (!owned.includes(id)) throw fail.denied('Item not owned.');
      const next: PlayerDoc = structuredClone(p);
      if (kind === 'ball') next.inventory.equippedBall = id;
      else next.inventory.equippedPaddle = id;
      next.updatedAt = Date.now();
      tx.set(ref, next);
      return next;
    });

    return { ok: true, player };
  }
);
