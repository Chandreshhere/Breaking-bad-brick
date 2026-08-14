import { col } from '../utils/firestore';
import { TTL, ttlAt } from '../utils/ttl';

/**
 * Mobile networks retry. Without this, one tap on BUY can debit twice.
 *
 * The stored value is the original response, so a retry returns exactly what
 * the first call returned instead of re-running the mutation.
 *
 * Crucially, only *completed mutations* are memoized. A refusal — "not enough
 * coins" — is a statement about the world at that moment, not a thing that
 * happened, and caching it means a player who earns the coins and tries again
 * is told no forever, because the answer never gets recomputed.
 *
 * Records carry a TTL stamp. A key kept forever is a key that costs storage
 * forever for a retry window measured in minutes; thirty days is far past any
 * plausible retry, including one that sat in the offline outbox through a
 * long outage.
 */
export async function withIdempotency<T>(
  uid: string,
  key: string | undefined,
  run: () => Promise<T>,
  shouldStore: (result: T) => boolean = defaultShouldStore
): Promise<T> {
  if (!key) return run();
  const ref = col.idempotency(uid).doc(key);
  const existing = await ref.get();
  if (existing.exists) return existing.data()?.result as T;
  const result = await run();
  if (shouldStore(result)) {
    const now = Date.now();
    await ref.set({
      result,
      createdAt: now,
      expiresAt: now + TTL.IDEMPOTENCY_MS,
      ttlAt: ttlAt(now + TTL.IDEMPOTENCY_MS),
    });
  }
  return result;
}

/** Anything reporting `ok: false` is a refusal, not a completed mutation. */
function defaultShouldStore(result: unknown): boolean {
  return (result as { ok?: boolean } | null)?.ok !== false;
}
