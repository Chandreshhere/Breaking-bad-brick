import { onRequest } from 'firebase-functions/v2/https';
import { createVerify, createPublicKey } from 'crypto';
import { col, db } from '../utils/firestore';
import { auditLog, auditWarn } from '../utils/logging';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * AdMob server-side verification.
 *
 * The client saying "the ad finished" is worth nothing — it is the one party
 * with an incentive to lie and full control over the code. AdMob instead
 * calls this endpoint directly, signed with a key only Google holds, and the
 * reward is granted here.
 *
 * Two things make this safe:
 *
 *  1. **Signature.** ECDSA over the exact query string up to `&signature=`,
 *     verified against Google's published verifier keys.
 *  2. **Replay protection.** `transaction_id` is recorded; a repeat pays
 *     nothing. Without this, one legitimately-earned callback could be
 *     replayed forever.
 */

const VERIFIER_KEYS_URL = 'https://gstatic.com/admob/reward/verifier-keys.json';

interface VerifierKey {
  keyId: number;
  pem: string;
  base64: string;
}

let keyCache: { at: number; keys: Map<string, string> } | null = null;
const KEY_TTL_MS = 24 * 60 * 60 * 1000;

/** Google rotates these; cache for a day, refetch on an unknown key id. */
async function loadKeys(force = false): Promise<Map<string, string>> {
  if (!force && keyCache && Date.now() - keyCache.at < KEY_TTL_MS) return keyCache.keys;
  // Bounded explicitly: an unanswered fetch would otherwise pin the instance
  // for the function's whole timeout while AdMob waits on a callback it will
  // retry anyway.
  const res = await fetch(VERIFIER_KEYS_URL, { signal: AbortSignal.timeout(5000) });
  const json = (await res.json()) as { keys: VerifierKey[] };
  const keys = new Map<string, string>();
  for (const k of json.keys) keys.set(String(k.keyId), k.pem);
  keyCache = { at: Date.now(), keys };
  return keys;
}

/**
 * AdMob signs everything before `&signature=`, in the order sent — so the
 * raw query string must be used, not a re-serialised parse. Re-encoding
 * would reorder or re-escape parameters and every signature would fail.
 */
export function signedPortion(rawQuery: string): string | null {
  const i = rawQuery.indexOf('&signature=');
  if (i < 0) return null;
  return rawQuery.slice(0, i);
}

export async function verifySignature(
  rawQuery: string,
  signatureB64Url: string,
  keyId: string,
  keyLookup: (id: string, force?: boolean) => Promise<string | undefined>
): Promise<boolean> {
  const content = signedPortion(rawQuery);
  if (!content) return false;
  let pem = await keyLookup(keyId);
  if (!pem) pem = await keyLookup(keyId, true); // key rotated — refetch once
  if (!pem) return false;

  // AdMob uses base64url for the signature.
  const sig = Buffer.from(signatureB64Url.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const verifier = createVerify('SHA256');
  verifier.update(content);
  verifier.end();
  try {
    return verifier.verify(createPublicKey(pem), sig);
  } catch {
    return false;
  }
}

/**
 * Credits a verified reward exactly once.
 *
 * Exported so the replay behaviour can be tested directly — the signature
 * half is unreachable in a test without Google's private key, and "we assume
 * the dedupe works" is not a claim worth making about currency.
 *
 * Returns the amount actually credited: 0 means it was a replay, or the
 * player no longer exists.
 */
export async function grantAdReward(
  uid: string,
  transactionId: string,
  rewardAmount: number
): Promise<number> {
  // The ledger doc id *is* the transaction id, so a replay collides.
  const ledger = db().collection('adRewards').doc(transactionId);
  const player = col.players().doc(uid);
  let granted = 0;

  await db().runTransaction(async (tx) => {
    const [seen, playerSnap] = await Promise.all([tx.get(ledger), tx.get(player)]);
    if (seen.exists) return; // replay
    if (!playerSnap.exists) return; // unknown player; nothing to credit

    granted = Math.max(0, Math.min(Math.floor(rewardAmount) || 25, 500));
    tx.set(ledger, { transactionId, uid, amount: granted, at: Date.now() });
    tx.update(player, {
      'wallet.coins': FieldValue.increment(granted),
      'wallet.lifetimeCoinsEarned': FieldValue.increment(granted),
      updatedAt: Date.now(),
    });
  });

  return granted;
}

export const admobSsv = onRequest(
  { region: 'us-central1', maxInstances: 20, cors: false },
  async (req, res) => {
    const rawQuery = req.originalUrl.split('?')[1] ?? '';
    const q = req.query as Record<string, string>;
    const uid = q['user_id'];
    const transactionId = q['transaction_id'];
    const signature = q['signature'];
    const keyId = q['key_id'];
    const rewardAmount = Number(q['reward_amount'] ?? 0);

    if (!uid || !transactionId || !signature || !keyId) {
      res.status(400).send('missing parameters');
      return;
    }

    let ok = false;
    try {
      ok = await verifySignature(rawQuery, signature, keyId, async (id, force) =>
        (await loadKeys(force)).get(id)
      );
    } catch (err) {
      // Key fetch failed or timed out. 500 so AdMob retries — this callback
      // may well be legitimate, and dropping it silently loses a real reward.
      auditWarn('ssv_keys_unavailable', uid, { transactionId, err: String(err) });
      res.status(500).send('error');
      return;
    }
    if (!ok) {
      auditWarn('ssv_bad_signature', uid, { transactionId, keyId });
      // 200 so AdMob does not retry a callback that can never verify.
      res.status(200).send('invalid signature');
      return;
    }

    let granted = 0;
    try {
      granted = await grantAdReward(uid, transactionId, rewardAmount);
    } catch (err) {
      auditWarn('ssv_grant_failed', uid, { transactionId, err: String(err) });
      res.status(500).send('error');
      return;
    }

    if (granted > 0) auditLog('ad_reward_granted', uid, { transactionId, granted });
    res.status(200).send('ok');
  }
);
