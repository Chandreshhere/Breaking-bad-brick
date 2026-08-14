import { Timestamp } from 'firebase-admin/firestore';

/**
 * Expiry stamp for Firestore's TTL policies.
 *
 * TTL only fires on a **Timestamp** field — a millisecond number is ignored
 * silently, which is the worst kind of ignored: the documents look expired
 * and are never collected. The policies are declared in
 * `firestore.indexes.json` under `fieldOverrides`, and every collection they
 * cover must write this field.
 *
 * `expiresAt` (a number) stays where code compares it, because comparing
 * against a Timestamp everywhere would be a bigger change for no gain. This
 * is purely what the sweeper reads.
 */
export function ttlAt(atMs: number): Timestamp {
  return Timestamp.fromMillis(atMs);
}

/** Common horizons, so the numbers are named rather than scattered. */
export const TTL = {
  /** Run tickets: comfortably past their own 6h validity. */
  RUN_TICKET_MS: 24 * 60 * 60 * 1000,
  /**
   * Idempotency keys. Long enough that any realistic retry — including one
   * queued in the outbox through a multi-day outage — still dedupes, short
   * enough that the collection does not grow forever.
   */
  IDEMPOTENCY_MS: 30 * 24 * 60 * 60 * 1000,
} as const;
