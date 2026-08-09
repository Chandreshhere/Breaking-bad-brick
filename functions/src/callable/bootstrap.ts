import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { col } from '../utils/firestore';
import { requireUid, checkAppAttestation } from '../security/auth';
import { auditLog } from '../utils/logging';
import { defaultPlayer, type PlayerDoc } from '../domain/players/model';
import { dailyForDate, readAttempt } from '../domain/dailies/daily';

/**
 * The single call the client makes on launch.
 *
 * Returns the player, tunables, today's daily, mission definitions, the
 * cosmetic catalogue and app status in one round trip. Six separate requests
 * on a cold mobile connection is the difference between a snappy launch and a
 * visible stall, and the client has a hard 3s budget before it gives up and
 * runs offline — so this must stay a single, cheap read set.
 */

/** Server-owned tunables. Remote Config supersedes these later. */
const DEFAULT_CONFIG = {
  dropChance: 0.22,
  coinsPer100Points: 1,
  livesPerRun: 3,
  adsEnabled: true,
  interstitialEveryNRuns: 3,
  continuesPerRun: 1,
  dailyEnabled: true,
  leaderboardEnabled: false,
  maxRunsPerHour: 60,
};

const APP_STATUS = {
  minVersion: '1.0.0',
  maintenance: false,
  message: null as string | null,
};

export interface DailyStatus {
  date: string;
  seed: number;
  closesAt: number;
  /** True once today's single attempt has been submitted. */
  played: boolean;
  score: number;
}

export interface BootstrapResult {
  player: PlayerDoc;
  config: typeof DEFAULT_CONFIG;
  daily: DailyStatus | null;
  missions: unknown[];
  catalogue: unknown | null;
  app: typeof APP_STATUS;
  serverTime: number;
}

/** Reads the player, creating a default document on first launch. */
async function loadOrCreatePlayer(uid: string, country: string | null): Promise<PlayerDoc> {
  const ref = col.players().doc(uid);
  const snap = await ref.get();
  if (snap.exists) return snap.data() as PlayerDoc;

  const fresh = defaultPlayer(uid, Date.now(), country);
  // create() rather than set(): if two cold starts race on a brand-new
  // anonymous uid, exactly one wins and the loser re-reads the winner's doc
  // instead of clobbering it.
  try {
    await ref.create(fresh);
    auditLog('player_created', uid, { country });
    return fresh;
  } catch {
    const retry = await ref.get();
    return (retry.data() as PlayerDoc) ?? fresh;
  }
}

export const bootstrap = onCall(
  { region: 'us-central1', maxInstances: 20 },
  async (req: CallableRequest): Promise<BootstrapResult> => {
    const uid = requireUid(req);
    checkAppAttestation(req); // monitor-only for now

    const country = (req.rawRequest.headers['x-appengine-country'] as string) ?? null;
    const player = await loadOrCreatePlayer(uid, country);

    const spec = dailyForDate(new Date());
    const [attempt, missionsSnap, catalogueSnap] = await Promise.all([
      readAttempt(uid, spec.date),
      col.missions().where('activeTo', '>', Date.now()).limit(3).get(),
      col.catalogue().doc('cosmetics').get(),
    ]);

    return {
      player,
      config: DEFAULT_CONFIG,
      daily: {
        date: spec.date,
        seed: spec.seed,
        closesAt: spec.closesAt,
        played: attempt?.submitted ?? false,
        score: attempt?.score ?? 0,
      },
      missions: missionsSnap.docs.map((d) => d.data()),
      catalogue: catalogueSnap.exists ? catalogueSnap.data() : null,
      app: APP_STATUS,
      serverTime: Date.now(),
    };
  }
);
