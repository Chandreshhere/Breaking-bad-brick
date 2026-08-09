import { col } from '../utils/firestore';
import { fail } from '../utils/errors';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Per-uid fixed-window limiter backed by Firestore.
 *
 * Deliberately simple and slightly permissive at window edges — this is a
 * backstop against runaway clients and casual abuse, not a security boundary.
 * The real protections are validation and server authority.
 */
export async function rateLimit(
  uid: string,
  action: string,
  maxPerWindow: number,
  windowSeconds: number
): Promise<void> {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const ref = col.idempotency(uid).doc(`rl_${action}_${bucket}`);
  const snap = await ref.get();
  const count = (snap.exists ? (snap.data()?.count as number) : 0) ?? 0;
  if (count >= maxPerWindow) throw fail.exhausted();
  await ref.set(
    {
      count: FieldValue.increment(1),
      expiresAt: (bucket + 2) * windowSeconds * 1000,
    },
    { merge: true }
  );
}
