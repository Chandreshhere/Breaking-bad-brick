import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { col } from '../utils/firestore';
import { requireUid } from '../security/auth';
import { str } from '../security/validation';

/** Stores a device push token against the player, for retention nudges. */
export const registerPushToken = onCall(
  { region: 'us-central1', maxInstances: 10 },
  async (req: CallableRequest) => {
    const uid = requireUid(req);
    const token = str((req.data as Record<string, unknown>)?.['token'], 'token', 512);
    const platform = str((req.data as Record<string, unknown>)?.['platform'] ?? 'web', 'platform', 16);
    await col.players().doc(uid).collection('pushTokens').doc(token.slice(0, 100)).set({
      token,
      platform,
      updatedAt: Date.now(),
    });
    return { ok: true };
  }
);
