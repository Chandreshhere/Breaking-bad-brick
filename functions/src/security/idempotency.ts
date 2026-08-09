import { col } from '../utils/firestore';

/**
 * Mobile networks retry. Without this, one tap on BUY can debit twice.
 *
 * The stored value is the original response, so a retry returns exactly what
 * the first call returned instead of re-running the mutation.
 */
export async function withIdempotency<T>(
  uid: string,
  key: string | undefined,
  run: () => Promise<T>
): Promise<T> {
  if (!key) return run();
  const ref = col.idempotency(uid).doc(key);
  const existing = await ref.get();
  if (existing.exists) return existing.data()?.result as T;
  const result = await run();
  await ref.set({ result, createdAt: Date.now() });
  return result;
}
