import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { createHash } from 'crypto';
import { col } from '../utils/firestore';
import { requireUid } from '../security/auth';
import { rateLimit } from '../security/rateLimit';
import { str } from '../security/validation';

/** Tokens per player. Beyond this the oldest are dropped. */
const MAX_TOKENS = 10;

/**
 * Stores a device push token against the player, for retention nudges.
 *
 * The document id is a hash of the token, not a prefix of it. FCM tokens
 * share long structured prefixes, so truncating to the first hundred
 * characters could map two genuinely different devices onto one document and
 * silently drop one of them.
 */
export const registerPushToken = onCall(
  { region: 'us-central1', maxInstances: 10 },
  async (req: CallableRequest) => {
    const uid = requireUid(req);
    await rateLimit(uid, 'pushToken', 30, 3600);

    const d = (req.data ?? {}) as Record<string, unknown>;
    const token = str(d['token'], 'token', 512);
    const platform = str(d['platform'] ?? 'web', 'platform', 16);
    const id = createHash('sha256').update(token).digest('hex').slice(0, 32);

    const tokens = col.players().doc(uid).collection('pushTokens');
    await tokens.doc(id).set({ token, platform, updatedAt: Date.now() }, { merge: true });

    // A player who reinstalls repeatedly would otherwise accumulate a token
    // per install forever, and every one of them gets pushed to.
    const all = await tokens.orderBy('updatedAt', 'desc').offset(MAX_TOKENS).get();
    await Promise.all(all.docs.map((doc) => doc.ref.delete()));

    return { ok: true };
  }
);
