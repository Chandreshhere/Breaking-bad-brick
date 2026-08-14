import { col, db } from '../utils/firestore';
import { fail } from '../utils/errors';
import { ttlAt } from '../utils/ttl';

/**
 * Per-uid fixed-window limiter backed by Firestore.
 *
 * The read and the increment happen in **one transaction**. The earlier
 * read-then-write version let a burst of concurrent calls all observe the
 * same pre-increment count and all pass, which is precisely the case a
 * limiter exists for — a runaway client does not send its requests politely
 * spaced out. A transaction also halves the round trips.
 *
 * Still deliberately simple and slightly permissive at window edges: this is
 * a backstop against runaway clients and casual abuse, not a security
 * boundary. The real protections are validation and server authority.
 */
export async function rateLimit(
  uid: string,
  action: string,
  maxPerWindow: number,
  windowSeconds: number
): Promise<void> {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const ref = col.idempotency(uid).doc(`rl_${action}_${bucket}`);
  // Two windows of grace before the sweeper takes it, so a bucket is never
  // collected while it is still the current one.
  const expiresAt = (bucket + 2) * windowSeconds * 1000;

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = (snap.exists ? (snap.data()?.count as number) : 0) ?? 0;
    if (count >= maxPerWindow) throw fail.exhausted();
    tx.set(ref, { count: count + 1, expiresAt, ttlAt: ttlAt(expiresAt) }, { merge: true });
  });
}
