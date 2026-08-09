import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { col } from '../utils/firestore';
import { auditLog, auditWarn } from '../utils/logging';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * RevenueCat webhook — the authority on what a player has actually bought.
 *
 * The client reporting "purchase succeeded" is not evidence: receipts are
 * forgeable and the client is the party that benefits. RevenueCat validates
 * with Apple and Google, then tells us here, and only this updates
 * entitlements.
 *
 * The shared secret lives in Secret Manager, never in source, Remote Config
 * or a VITE_ variable — anything shipped to a client is public.
 */
const REVENUECAT_SECRET = defineSecret('REVENUECAT_WEBHOOK_SECRET');

/** Product ids we honour, and what they grant. */
const PRODUCTS: Record<string, { entitlement?: 'removeAds' | 'premium'; coins?: number }> = {
  remove_ads: { entitlement: 'removeAds' },
  premium: { entitlement: 'premium' },
  coins_small: { coins: 1000 },
  coins_medium: { coins: 5500 },
  coins_large: { coins: 12000 },
};

export const revenuecatWebhook = onRequest(
  { region: 'us-central1', maxInstances: 10, secrets: [REVENUECAT_SECRET], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('method not allowed');
      return;
    }
    const expected = REVENUECAT_SECRET.value();
    if (!expected || req.header('Authorization') !== expected) {
      auditWarn('revenuecat_bad_auth', 'unknown', {});
      res.status(401).send('unauthorized');
      return;
    }

    const event = (req.body?.event ?? {}) as Record<string, unknown>;
    const uid = String(event['app_user_id'] ?? '');
    const productId = String(event['product_id'] ?? '');
    const type = String(event['type'] ?? '');
    const eventId = String(event['id'] ?? '');
    if (!uid || !eventId) {
      res.status(400).send('missing fields');
      return;
    }

    const grant = PRODUCTS[productId];
    const ledger = col.players().doc(uid).collection('purchases').doc(eventId);
    const player = col.players().doc(uid);

    await col.players().firestore.runTransaction(async (tx) => {
      const seen = await tx.get(ledger);
      if (seen.exists) return; // webhooks retry; grant once
      const snap = await tx.get(player);
      if (!snap.exists) return;

      tx.set(ledger, { eventId, type, productId, at: Date.now() });

      const active = ['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE', 'UNCANCELLATION'];
      const revoked = ['CANCELLATION', 'EXPIRATION', 'REFUND'];

      if (grant?.entitlement) {
        if (active.includes(type)) {
          tx.update(player, { [`entitlements.${grant.entitlement}`]: true, updatedAt: Date.now() });
        } else if (revoked.includes(type)) {
          tx.update(player, { [`entitlements.${grant.entitlement}`]: false, updatedAt: Date.now() });
        }
      }
      // Consumables are granted on purchase and never revoked on refund by
      // this path — clawing back spent currency creates negative balances.
      // Refund abuse is handled by RevenueCat/store policy instead.
      if (grant?.coins && active.includes(type)) {
        tx.update(player, {
          'wallet.coins': FieldValue.increment(grant.coins),
          updatedAt: Date.now(),
        });
      }
    });

    auditLog('revenuecat_event', uid, { type, productId, eventId });
    res.status(200).send('ok');
  }
);
