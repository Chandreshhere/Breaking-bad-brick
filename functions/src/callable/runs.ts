import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { randomUUID, randomBytes, createHmac } from 'crypto';
import { col } from '../utils/firestore';
import { requireUid, checkAppAttestation } from '../security/auth';
import { rateLimit } from '../security/rateLimit';
import { withIdempotency } from '../security/idempotency';
import { fail } from '../utils/errors';
import { auditLog, auditWarn } from '../utils/logging';
import { int, oneOf, str } from '../security/validation';
import { defaultPlayer, type PlayerDoc } from '../domain/players/model';
import { validateRun, coinsForRun, type RunClaim } from '../domain/runs/validate';

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
    checkAppAttestation(req);
    await rateLimit(uid, 'startRun', 120, 3600);

    const data = (req.data ?? {}) as Record<string, unknown>;
    const mode: Mode = oneOf(data['mode'] ?? 'ENDLESS', 'mode', MODES);

    const runId = randomUUID();
    const secret = randomBytes(24).toString('hex');
    const seed = Math.floor(Math.random() * 2_000_000_000);
    const now = Date.now();

    await col.runTickets().doc(runId).set({
      runId,
      uid,
      mode,
      seed,
      secret,
      issuedAt: now,
      expiresAt: now + TICKET_TTL_MS,
      submitted: false,
    });

    return {
      runId,
      mode,
      seed,
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
    checkAppAttestation(req);
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

      const result = await col.players().firestore.runTransaction(async (tx) => {
        const [ticketSnap, playerSnap] = await Promise.all([tx.get(ticketRef), tx.get(playerRef)]);

        // A missing ticket means the run started offline. That is allowed —
        // refusing it would make a tunnel cost the player their run — but the
        // result is marked UNVERIFIED and stays off competitive boards.
        let verification: 'VERIFIED' | 'UNVERIFIED' = 'UNVERIFIED';
        if (ticketSnap.exists) {
          const t = ticketSnap.data() as {
            uid: string;
            expiresAt: number;
            submitted: boolean;
          };
          if (t.uid !== uid) throw fail.denied('Ticket belongs to another player.');
          if (t.submitted) throw fail.badRequest('Run already submitted.');
          if (Date.now() > t.expiresAt) throw fail.badRequest('Run ticket expired.');
          verification = 'VERIFIED';
          tx.update(ticketRef, { submitted: true });
        }

        const player = playerSnap.exists
          ? (playerSnap.data() as PlayerDoc)
          : defaultPlayer(uid, Date.now(), null);

        const coins = coinsForRun(claim.score, 1);

        const next: PlayerDoc = JSON.parse(JSON.stringify(player));
        next.stats.bestScore = Math.max(next.stats.bestScore, claim.score);
        next.stats.bestLevel = Math.max(next.stats.bestLevel, claim.levelReached);
        next.stats.bestCombo = Math.max(next.stats.bestCombo, claim.bestCombo);
        next.stats.runs += 1;
        next.stats.totalBricks += claim.bricksDestroyed;
        next.stats.totalPlaySeconds += claim.durationSeconds;
        // The only place a run may add currency.
        next.wallet.coins += coins;
        next.wallet.lifetimeCoinsEarned += coins;
        next.updatedAt = Date.now();
        tx.set(playerRef, next);

        tx.set(col.runs().doc(runId), {
          runId,
          uid,
          ...claim,
          submittedAt: Date.now(),
          validation: { status: verification },
        });

        return { player: next, coinsAwarded: coins, verification };
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
        coinsAwarded: result.coinsAwarded,
        player: result.player,
      };
    });
  }
);
