import { col } from '../../utils/firestore';

/**
 * The daily challenge.
 *
 * One run, one seed, everybody in the world playing the identical sequence of
 * levels — which is the point: a score only means something when the other
 * scores came from the same layout.
 *
 * The seed is *derived* from the date rather than stored by a scheduled job.
 * A cron that has to have run before anyone can play is a single point of
 * failure across timezones; deriving it means the challenge exists the
 * instant the date rolls over, in every region, with no job to babysit.
 */

export function dateKey(now: Date): string {
  // UTC everywhere. A local-date key would give players in different
  // timezones different "todays" and let someone replay by travelling.
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

/** Stable 32-bit hash of the date key — the same everywhere, forever. */
export function seedForDate(key: string): number {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // Keep it comfortably inside the range the client's PRNG expects.
  return h % 2_000_000_000;
}

export interface DailySpec {
  date: string;
  seed: number;
  opensAt: number;
  closesAt: number;
}

export function dailyForDate(now: Date): DailySpec {
  const date = dateKey(now);
  const opens = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    date,
    seed: seedForDate(date),
    opensAt: opens,
    closesAt: opens + 24 * 60 * 60 * 1000,
  };
}

export interface DailyAttempt {
  date: string;
  startedAt: number;
  submitted: boolean;
  score: number;
}

export function attemptRef(uid: string, date: string) {
  return col.players().doc(uid).collection('dailies').doc(date);
}

/** Null when the player has not touched today's challenge yet. */
export async function readAttempt(uid: string, date: string): Promise<DailyAttempt | null> {
  const snap = await attemptRef(uid, date).get();
  return snap.exists ? (snap.data() as DailyAttempt) : null;
}
