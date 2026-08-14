import { col } from '../../utils/firestore';
import { auditLog } from '../../utils/logging';
import { defaultPlayer, hydratePlayer, type PlayerDoc } from './model';

/**
 * The one way a player document comes into existence.
 *
 * Every endpoint that can be the *first* one a client calls has to be able to
 * create the document — the consent screen is reachable before bootstrap has
 * answered, so `updateConsent` landing first is ordinary, not exotic. When
 * such an endpoint merge-wrote its own field into a missing document it
 * produced a player with a `flags` map and nothing else, which `bootstrap`
 * then found, believed, and returned; the client read `wallet.coins` off it
 * and threw. Creating properly here, and hydrating on read, closes both ends.
 */
export async function loadOrCreatePlayer(
  uid: string,
  country: string | null
): Promise<PlayerDoc> {
  const ref = col.players().doc(uid);
  const snap = await ref.get();
  if (snap.exists) return hydratePlayer(snap.data() as Partial<PlayerDoc>, uid);

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
    return hydratePlayer(retry.data() as Partial<PlayerDoc> | undefined, uid);
  }
}

/** Reads a player inside a transaction, hydrating whatever is missing. */
export function playerFromSnapshot(
  snap: FirebaseFirestore.DocumentSnapshot,
  uid: string
): PlayerDoc {
  return snap.exists
    ? hydratePlayer(snap.data() as Partial<PlayerDoc>, uid)
    : defaultPlayer(uid, Date.now(), null);
}
