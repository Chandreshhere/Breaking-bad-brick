import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { col } from '../utils/firestore';
import { requireUid } from '../security/auth';
import { auditLog } from '../utils/logging';

/**
 * Records the player's consent choice.
 *
 * Stored server-side with a timestamp because "we asked, and they said yes"
 * is the thing a regulator asks you to evidence — a flag living only in the
 * browser that made the choice is not evidence of anything.
 */
export const updateConsent = onCall(
  { region: 'us-central1', maxInstances: 10 },
  async (req: CallableRequest) => {
    const uid = requireUid(req);
    const d = (req.data ?? {}) as Record<string, unknown>;
    const ads = d['ads'] === true;
    const analytics = d['analytics'] === true;

    await col.players().doc(uid).set(
      {
        flags: { consentAds: ads, consentAnalytics: analytics },
        consentAt: Date.now(),
        updatedAt: Date.now(),
      },
      { merge: true }
    );
    auditLog('consent_recorded', uid, { ads, analytics });
    return { ok: true, ads, analytics };
  }
);
