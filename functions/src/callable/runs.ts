import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { randomUUID, randomBytes, createHmac } from 'crypto';
import { col } from '../utils/firestore';
import { requireUid, checkAppAttestation } from '../security/auth';
import { rateLimit } from '../security/rateLimit';
import { withIdempotency } from '../security/idempotency';
import { fail } from '../utils/errors';
import { auditLog, auditWarn } from '../utils/logging';
import { int, oneOf, str } from '../security/validation';
import { MAX_TRACKED_BOARDS, type PlayerDoc } from '../domain/players/model';
import { playerFromSnapshot } from '../domain/players/repo';
import {
  validateRun,
  coinsForRun,
  UNVERIFIED_COIN_CAP_PER_DAY,
  type RunClaim,
} from '../domain/runs/validate';
import {
  ALLTIME_BOARD,
  dailyBoardId,
  readBestScore,
  weeklyBoardId,
  writeBestEntry,
} from '../domain/leaderboards/boards';
import { attemptRef, dailyForDate, dateKey, readAttempt } from '../domain/dailies/daily';
import { MISSIONS, runValueFor, worldsUnlockedAt } from '../domain/missions/missions';
import { DEFAULT_CONFIG } from '../domain/config/tunables';
import { TTL, ttlAt } from '../utils/ttl';

const MODES = ['ENDLESS', 'DAILY'] as const;
type Mode = (typeof MODES)[number];

/** A ticket is only good for one run, and not for long. */
const TICKET_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Per-run secret. Generated server-side and never sent to the client — the
 * client receives only the opaque ticket. This is why the design issues a
 * ticket rather than handing out a signing key: a key shipped to the client
 * is a key the client can forge with.
 */
function signTicket(runId: string, seed: number, secret: string): string {
  return createHmac('sha256', secret).update(`${runId}:${seed}`).digest('hex');
}

export const startRun = onCall(
  { region: 'us-central1', maxInstances: 20 },
  async (req: CallableRequest) => {
    const uid = requireUid(req);
    checkAppAttestation(req, 'startRun');
    await rateLimit(uid, 'startRun', 120, 3600);

    const data = (req.data ?? {}) as Record<string, unknown>;
    const mode: Mode = oneOf(data['mode'] ?? 'ENDLESS', 'mode', MODES);

    const runId = randomUUID();
    const secret = randomBytes(24).toString('hex');
    const now = Date.now();

    // Endless gets a throwaway seed; the daily gets today's shared one, so
    // every player is ranked on the same layout.
    let seed = Math.floor(Math.random() * 2_000_000_000);
    let dailyDate: string | null = null;
    if (mode === 'DAILY') {
      const spec = dailyForDate(new Date());
      const attempt = await readAttempt(uid, spec.date);
      if (attempt?.submitted) throw fail.denied('Today\'s challenge is already played.');
      seed = spec.seed;
      dailyDate = spec.date;
      await attemptRef(uid, spec.date).set(
        { date: spec.date, startedAt: now, submitted: false, score: 0 },
        { merge: true }
      );
    }

    await col.runTickets().doc(runId).set({
      runId,
      uid,
      mode,
      seed,
      secret,
      dailyDate,
      issuedAt: now,
      expiresAt: now + TICKET_TTL_MS,
      // Swept by Firestore's TTL policy well after the ticket stops being
      // usable. Without one the collection keeps a document per run ever
      // started, forever.
      ttlAt: ttlAt(now + TTL.RUN_TICKET_MS),
      submitted: false,
    });

    return {
      runId,
      mode,
      seed,
      dailyDate,
      issuedAt: now,
      expiresAt: now + TICKET_TTL_MS,
      ticket: signTicket(runId, seed, secret),
    };
  }
);

export const submitRun = onCall(
  { region: 'us-central1', maxInstances: 20 },
  async (req: CallableRequest) => {
    const uid = requireUid(req);
    checkAppAttestation(req, 'submitRun');
    await rateLimit(uid, 'submitRun', 90, 3600);

    const d = (req.data ?? {}) as Record<string, unknown>;
    const runId = str(d['runId'], 'runId', 64);
    const idempotencyKey = d['idempotencyKey'] ? str(d['idempotencyKey'], 'idempotencyKey', 64) : runId;

    const claim: RunClaim = {
      score: int(d['score'] ?? 0, 'score', 0, 1_000_000_000),
      levelReached: int(d['levelReached'] ?? 1, 'levelReached', 1, 10_000),
      bestCombo: int(d['bestCombo'] ?? 0, 'bestCombo', 0, 1_000_000),
      bricksDestroyed: int(d['bricksDestroyed'] ?? 0, 'bricksDestroyed', 0, 10_000_000),
      durationSeconds: int(d['durationSeconds'] ?? 0, 'durationSeconds', 0, 1_000_000),
      continuesUsed: int(d['continuesUsed'] ?? 0, 'continuesUsed', 0, 100),
    };

    return withIdempotency(uid, idempotencyKey, async () => {
      const verdict = validateRun(claim);
      if (!verdict.ok) {
        auditWarn('run_rejected', uid, { runId, reason: verdict.reason, score: claim.score });
        throw fail.badRequest(`Run rejected: ${verdict.reason}`);
      }

      const ticketRef = col.runTickets().doc(runId);
      const playerRef = col.players().doc(uid);

      const weeklyBoard = weeklyBoardId(new Date());

      const missionRefs = MISSIONS.map((def) =>
        col.players().doc(uid).collection('missions').doc(def.id)
      );

      const result = await col.players().firestore.runTransaction(async (tx) => {
        // ── every read first ────────────────────────────────────────────
        const [ticketSnap, playerSnap, prevAlltime, prevWeekly, missionSnaps] =
          await Promise.all([
            tx.get(ticketRef),
            tx.get(playerRef),
            readBestScore(tx, ALLTIME_BOARD, uid),
            readBestScore(tx, weeklyBoard, uid),
            Promise.all(missionRefs.map((ref) => tx.get(ref))),
          ]);

        // A missing ticket means the run started offline. That is allowed —
        // refusing it would make a tunnel cost the player their run — but the
        // result is marked UNVERIFIED and stays off competitive boards.
        let verification: 'VERIFIED' | 'UNVERIFIED' = 'UNVERIFIED';
        let runMode: Mode = 'ENDLESS';
        let dailyDate: string | null = null;
        if (ticketSnap.exists) {
          const t = ticketSnap.data() as {
            uid: string;
            expiresAt: number;
            submitted: boolean;
            mode?: Mode;
            dailyDate?: string | null;
          };
          runMode = t.mode ?? 'ENDLESS';
          dailyDate = t.dailyDate ?? null;
          if (t.uid !== uid) throw fail.denied('Ticket belongs to another player.');
          if (t.submitted) throw fail.badRequest('Run already submitted.');
          if (Date.now() > t.expiresAt) throw fail.badRequest('Run ticket expired.');
          verification = 'VERIFIED';
        }

        // Which daily board this run belongs to comes from the ticket, not
        // from the clock at submit time: a run started at 23:59 UTC and
        // submitted at 00:01 is yesterday's, and reading today's board for
        // the previous best would either discard a winning entry or overwrite
        // a better one. Read after the ticket and only when it is a daily —
        // an endless run never consults this board. Still a read, and still
        // before the first write, which is all a transaction requires.
        const dailyBoard = dailyDate ? `daily_${dailyDate}` : dailyBoardId(new Date());
        const prevDaily =
          runMode === 'DAILY' && dailyDate ? await readBestScore(tx, dailyBoard, uid) : -1;

        const player = playerFromSnapshot(playerSnap, uid);

        const verified = verification === 'VERIFIED';
        let coins = coinsForRun(claim.score, DEFAULT_CONFIG.coinsPer100Points, verified);

        const next: PlayerDoc = structuredClone(player);

        // An unverified run draws from a daily budget rather than paying out
        // freely — see UNVERIFIED_COIN_CAP_PER_DAY. The budget lives on the
        // player document so it is read and spent inside this transaction,
        // which is the only way two concurrent submissions cannot both see a
        // full allowance.
        if (!verified) {
          const today = dateKey(new Date());
          if (next.wallet.unverifiedDay !== today) {
            next.wallet.unverifiedDay = today;
            next.wallet.unverifiedCoinsToday = 0;
          }
          const remaining = Math.max(
            0,
            UNVERIFIED_COIN_CAP_PER_DAY - next.wallet.unverifiedCoinsToday
          );
          coins = Math.min(coins, remaining);
          next.wallet.unverifiedCoinsToday += coins;
        }

        next.stats.bestScore = Math.max(next.stats.bestScore, claim.score);
        next.stats.bestLevel = Math.max(next.stats.bestLevel, claim.levelReached);
        next.stats.bestCombo = Math.max(next.stats.bestCombo, claim.bestCombo);
        next.stats.runs += 1;
        next.stats.totalBricks += claim.bricksDestroyed;
        next.stats.totalPlaySeconds += claim.durationSeconds;
        // The only place a run may add currency.
        next.wallet.coins += coins;
        next.wallet.lifetimeCoinsEarned += coins;
        // Worlds unlock from the deepest level ever reached. Derived from
        // the validated run, never claimed by the client.
        next.inventory.unlockedWorlds = worldsUnlockedAt(next.stats.bestLevel);
        next.updatedAt = Date.now();

        // ── writes from here ────────────────────────────────────────────
        if (verification === 'VERIFIED') tx.update(ticketRef, { submitted: true });

        // Only a ticketed run ranks. An offline run still counts for coins,
        // records and stats — it just cannot be told apart from a fabricated
        // one, so it does not get to sit next to runs that can.
        let ranked = false;
        if (verification === 'VERIFIED' && claim.score > 0) {
          const entry = {
            uid,
            displayName: next.displayName,
            country: next.country,
            score: claim.score,
            levelReached: claim.levelReached,
            runId,
          };
          // Remembered so deletion can find these entries again without
          // walking every board in the database.
          const rank = (board: string, previous: number): boolean => {
            const wrote = writeBestEntry(tx, board, entry, previous);
            if (wrote && !next.rankedBoards.includes(board)) {
              next.rankedBoards.push(board);
              if (next.rankedBoards.length > MAX_TRACKED_BOARDS) {
                next.rankedBoards = next.rankedBoards.slice(-MAX_TRACKED_BOARDS);
              }
            }
            return wrote;
          };

          if (runMode === 'DAILY' && dailyDate) {
            // A daily score belongs only to its own board — mixing one run
            // on a fixed layout into the endless boards would compare
            // different games.
            ranked = rank(dailyBoard, prevDaily);
            tx.set(
              attemptRef(uid, dailyDate),
              { date: dailyDate, submitted: true, score: claim.score },
              { merge: true }
            );
          } else {
            const a = rank(ALLTIME_BOARD, prevAlltime);
            const w = rank(weeklyBoard, prevWeekly);
            ranked = a || w;
          }
        }

        // After the ranking block so `rankedBoards` lands in the same write.
        tx.set(playerRef, next);

        tx.set(col.runs().doc(runId), {
          runId,
          uid,
          ...claim,
          submittedAt: Date.now(),
          validation: { status: verification },
        });

        // Mission progress is a high-water mark computed from the run, so a
        // client cannot assert completion. Claiming the reward is separate.
        //
        // Genuinely a maximum against the stored value: writing the run's own
        // number would mean a bad run *undoes* progress, so a player who hit
        // a 30 combo and then played a quiet round would watch the 25-combo
        // mission fall back to incomplete.
        MISSIONS.forEach((def, i) => {
          const value = runValueFor(def, claim);
          if (value <= 0) return;
          const prev = (missionSnaps[i]?.data()?.['value'] as number | undefined) ?? 0;
          if (value <= prev) return;
          tx.set(
            missionRefs[i]!,
            { id: def.id, value, target: def.target, updatedAt: Date.now() },
            { merge: true }
          );
        });

        return { player: next, coinsAwarded: coins, verification, ranked };
      });

      auditLog('run_accepted', uid, {
        runId,
        score: claim.score,
        coins: result.coinsAwarded,
        verification: result.verification,
      });

      return {
        accepted: true,
        verification: result.verification,
        ranked: result.ranked,
        coinsAwarded: result.coinsAwarded,
        player: result.player,
      };
    });
  }
);
