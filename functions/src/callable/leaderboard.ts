import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { col } from '../utils/firestore';
import { requireUid, checkAppAttestation } from '../security/auth';
import { rateLimit } from '../security/rateLimit';
import { int, str } from '../security/validation';
import { ALLTIME_BOARD, weeklyBoardId } from '../domain/leaderboards/boards';

export interface LeaderboardRow {
  rank: number;
  uid: string;
  displayName: string;
  country: string | null;
  score: number;
  levelReached: number;
  isMe: boolean;
}

/**
 * A page of a board plus the caller's own standing.
 *
 * "Where am I?" is the question that makes a leaderboard motivating, and it
 * is useless to a player ranked 40,000th if all they get is the top ten. The
 * caller's rank is computed with a count aggregation rather than by reading
 * every row above them, so it costs the same at rank 10 and rank 400,000.
 */
export const getLeaderboard = onCall(
  { region: 'us-central1', maxInstances: 20 },
  async (req: CallableRequest) => {
    const uid = requireUid(req);
    checkAppAttestation(req, 'getLeaderboard');
    await rateLimit(uid, 'leaderboard', 120, 3600);

    const d = (req.data ?? {}) as Record<string, unknown>;
    const requested = d['board'] ? str(d['board'], 'board', 48) : 'global_alltime';
    const limit = int(d['limit'] ?? 25, 'limit', 1, 100);

    // Resolve aliases server-side so the client never has to know how a week
    // is keyed — and cannot ask for an arbitrary collection path.
    let board = ALLTIME_BOARD;
    if (requested === 'weekly') board = weeklyBoardId(new Date());
    else if (requested === 'global_alltime') board = ALLTIME_BOARD;
    else if (/^daily_\d{8}$/.test(requested)) board = requested;

    const entries = col.leaderboard(board);

    // Four independent reads. Run together: none of them needs another's
    // answer, and serialised they turn one call into four round trips against
    // a client that is watching a spinner.
    const [top, mineSnap, total] = await Promise.all([
      entries.orderBy('score', 'desc').limit(limit).get(),
      entries.doc(uid).get(),
      entries.count().get(),
    ]);

    const rows: LeaderboardRow[] = top.docs.map((doc, i) => {
      const e = doc.data() as Omit<LeaderboardRow, 'rank' | 'isMe'>;
      return {
        rank: i + 1,
        uid: e.uid,
        displayName: e.displayName,
        country: e.country ?? null,
        score: e.score,
        levelReached: e.levelReached,
        isMe: e.uid === uid,
      };
    });

    // The caller's own standing, whether or not they made the page. The rank
    // query has to wait for their score, so this one genuinely is sequential.
    let me: LeaderboardRow | null = null;
    if (mineSnap.exists) {
      const e = mineSnap.data() as Omit<LeaderboardRow, 'rank' | 'isMe'>;
      const ahead = await entries.where('score', '>', e.score).count().get();
      me = {
        rank: ahead.data().count + 1,
        uid: e.uid,
        displayName: e.displayName,
        country: e.country ?? null,
        score: e.score,
        levelReached: e.levelReached,
        isMe: true,
      };
    }

    return { board, rows, me, total: total.data().count };
  }
);
