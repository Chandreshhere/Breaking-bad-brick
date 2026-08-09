import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';

let cached: Firestore | null = null;

/** Lazy admin init — Functions cold starts pay for this once. */
export function db(): Firestore {
  if (!cached) {
    if (getApps().length === 0) initializeApp();
    cached = getFirestore();
    cached.settings({ ignoreUndefinedProperties: true });
  }
  return cached;
}

export const col = {
  players: () => db().collection('players'),
  runs: () => db().collection('runs'),
  runTickets: () => db().collection('runTickets'),
  dailies: () => db().collection('dailies'),
  missions: () => db().collection('missions'),
  catalogue: () => db().collection('catalogue'),
  leaderboard: (board: string) => db().collection('leaderboards').doc(board).collection('entries'),
  idempotency: (uid: string) => db().collection('idempotency').doc(uid).collection('keys'),
};
