import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { col } from '../utils/firestore';
import { requireUid } from '../security/auth';
import { rateLimit } from '../security/rateLimit';
import { auditLog } from '../utils/logging';
import { loadOrCreatePlayer } from '../domain/players/repo';

/**
 * Records the player's consent choice.
 *
 * Stored server-side with a timestamp because "we asked, and they said yes"
 * is the thing a regulator asks you to evidence — a flag living only in the
 * browser that made the choice is not evidence of anything.
 *
 * The player document is created first if it does not exist. The consent
 * screen can be the first thing a player ever sees, so this endpoint is
 * routinely the first to touch the document — and a bare merge-write here
 * used to leave behind a player consisting of nothing but `flags`, which
 * `bootstrap` then found, trusted, and handed to a client that immediately
 * read `wallet.coins` off it.
 */
export const updateConsent = onCall(
  { region: 'us-central1', maxInstances: 10 },
  async (req: CallableRequest) => {
    const uid = requireUid(req);
    await rateLimit(uid, 'consent', 60, 3600);

    const d = (req.data ?? {}) as Record<string, unknown>;
    const ads = d['ads'] === true;
    const analytics = d['analytics'] === true;

    await loadOrCreatePlayer(uid, null);
    await col.players().doc(uid).update({
      'flags.consentAds': ads,
      'flags.consentAnalytics': analytics,
      consentAt: Date.now(),
      updatedAt: Date.now(),
    });

    auditLog('consent_recorded', uid, { ads, analytics });
    return { ok: true, ads, analytics };
  }
);
