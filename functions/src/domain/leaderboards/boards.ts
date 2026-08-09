import { col } from '../../utils/firestore';
import type { Transaction } from 'firebase-admin/firestore';

/**
 * Leaderboard writes.
 *
 * Two rules the rest of the system depends on:
 *
 *  1. **Only verified runs rank.** A run started offline has no server
 *     ticket, so it cannot be distinguished from a fabricated one. Putting it
 *     on the same board as verified runs would quietly make the board
 *     meaningless, which is worse than the player not appearing — they still
 *     see their own score, just unranked.
 *
 *  2. **One entry per player per board, their best.** Boards are a ranking of
 *     people, not of attempts; keeping every run would let one player fill
 *     the top ten.
 */

export type BoardId = string;

/** Monday-anchored week key, so a board rolls over predictably. */
export function weeklyBoardId(now: Date): BoardId {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // getUTCDay: 0=Sunday. Shift so Monday starts the week.
  const dayOffset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayOffset);
  return `global_weekly_${d.toISOString().slice(0, 10).replace(/-/g, '')}`;
}

export function dailyBoardId(now: Date): BoardId {
  return `daily_${now.toISOString().slice(0, 10).replace(/-/g, '')}`;
}

export const ALLTIME_BOARD: BoardId = 'global_alltime';

export interface EntryWrite {
  uid: string;
  displayName: string;
  country: string | null;
  score: number;
  levelReached: number;
  runId: string;
}

/**
 * Split into read and write halves because a Firestore transaction must
 * perform every read before its first write. Keeping them together read
 * *after* the player document was written, which throws at runtime — the
 * kind of failure that only appears once a transaction actually runs.
 */
export async function readBestScore(
  tx: Transaction,
  board: BoardId,
  uid: string
): Promise<number> {
  const snap = await tx.get(col.leaderboard(board).doc(uid));
  return snap.exists ? ((snap.data()?.score as number) ?? -1) : -1;
}

/** Writes the entry only when it beats the score read earlier. */
export function writeBestEntry(
  tx: Transaction,
  board: BoardId,
  e: EntryWrite,
  previousScore: number
): boolean {
  if (e.score <= previousScore) return false;
  tx.set(col.leaderboard(board).doc(e.uid), {
    uid: e.uid,
    displayName: e.displayName,
    country: e.country,
    score: e.score,
    levelReached: e.levelReached,
    runId: e.runId,
    achievedAt: Date.now(),
    verified: true,
  });
  return true;
}
