import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { col } from '../utils/firestore';
import { requireUid, checkAppAttestation } from '../security/auth';
import { type PlayerDoc } from '../domain/players/model';
import { loadOrCreatePlayer } from '../domain/players/repo';
import { dailyForDate, readAttempt } from '../domain/dailies/daily';
import { APP_STATUS, DEFAULT_CONFIG, type AppStatus, type Tunables } from '../domain/config/tunables';
import { MISSIONS } from '../domain/missions/missions';

/**
 * The single call the client makes on launch.
 *
 * Returns the player, tunables, today's daily, mission definitions, the
 * cosmetic catalogue and app status in one round trip. Six separate requests
 * on a cold mobile connection is the difference between a snappy launch and a
 * visible stall, and the client has a hard 3s budget before it gives up and
 * runs offline — so this must stay a single, cheap read set.
 */

export interface DailyStatus {
  date: string;
  seed: number;
  closesAt: number;
  /** True once today's single attempt has been submitted. */
  played: boolean;
  score: number;
}

/** A mission definition plus this player's standing on it. */
export interface MissionStatus {
  id: string;
  text: string;
  metric: string;
  target: number;
  reward: number;
  value: number;
  claimed: boolean;
}

export interface BootstrapResult {
  player: PlayerDoc;
  config: Tunables;
  daily: DailyStatus | null;
  missions: MissionStatus[];
  catalogue: unknown | null;
  app: AppStatus;
  serverTime: number;
}

export const bootstrap = onCall(
  { region: 'us-central1', maxInstances: 20 },
  async (req: CallableRequest): Promise<BootstrapResult> => {
    const uid = requireUid(req);
    checkAppAttestation(req, 'bootstrap');

    const country = (req.rawRequest.headers['x-appengine-country'] as string) ?? null;
    const player = await loadOrCreatePlayer(uid, country);

    const spec = dailyForDate(new Date());
    const [attempt, progressSnap, catalogueSnap] = await Promise.all([
      readAttempt(uid, spec.date),
      // The player's own progress. The *definitions* come from MISSIONS in
      // code — this used to query a top-level `missions` collection that
      // nothing has ever written, so every launch paid for a query that
      // returned an empty list and the client rendered no missions at all
      // while `claimMission` happily paid out against the code-side table.
      col.players().doc(uid).collection('missions').get(),
      col.catalogue().doc('cosmetics').get(),
    ]);

    const progress = new Map(progressSnap.docs.map((d) => [d.id, d.data()]));
    const missions: MissionStatus[] = MISSIONS.map((def) => {
      const p = progress.get(def.id);
      return {
        id: def.id,
        text: def.text,
        metric: def.metric,
        target: def.target,
        reward: def.reward,
        value: (p?.['value'] as number | undefined) ?? 0,
        claimed: (p?.['claimed'] as boolean | undefined) ?? false,
      };
    });

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
      missions,
      catalogue: catalogueSnap.exists ? catalogueSnap.data() : null,
      app: APP_STATUS,
      serverTime: Date.now(),
    };
  }
);
