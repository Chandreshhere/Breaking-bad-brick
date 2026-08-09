import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { col, db } from '../utils/firestore';
import { requireUid } from '../security/auth';
import { rateLimit } from '../security/rateLimit';
import { auditLog } from '../utils/logging';

/**
 * Data export and account deletion.
 *
 * Both stores require an in-app deletion path for any app that creates an
 * account — and an automatically-created anonymous account counts. GDPR
 * requires the same plus export. This is not optional polish; an app without
 * it gets rejected.
 */

export const exportPlayer = onCall(
  { region: 'us-central1', maxInstances: 10 },
  async (req: CallableRequest) => {
    const uid = requireUid(req);
    await rateLimit(uid, 'export', 5, 3600);

    const [player, runs, missions, dailies] = await Promise.all([
      col.players().doc(uid).get(),
      col.runs().where('uid', '==', uid).limit(500).get(),
      col.players().doc(uid).collection('missions').get(),
      col.players().doc(uid).collection('dailies').get(),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      player: player.data() ?? null,
      runs: runs.docs.map((d) => d.data()),
      missions: missions.docs.map((d) => d.data()),
      dailies: dailies.docs.map((d) => d.data()),
    };
  }
);

/** Deletes a subcollection in batches; Firestore has no recursive delete. */
async function deleteCollection(path: FirebaseFirestore.CollectionReference): Promise<void> {
  for (;;) {
    const snap = await path.limit(300).get();
    if (snap.empty) return;
    const batch = db().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < 300) return;
  }
}

export const deletePlayer = onCall(
  { region: 'us-central1', maxInstances: 10 },
  async (req: CallableRequest) => {
    const uid = requireUid(req);
    auditLog('account_deletion_requested', uid);

    const playerRef = col.players().doc(uid);

    // Subcollections first — deleting the parent document does not remove
    // them, and orphaned subcollections are still personal data.
    await Promise.all([
      deleteCollection(playerRef.collection('missions')),
      deleteCollection(playerRef.collection('dailies')),
      deleteCollection(playerRef.collection('pushTokens')),
      deleteCollection(col.idempotency(uid)),
    ]);

    // Leaderboard identity. The entry is removed outright rather than
    // anonymised: a "deleted user" row still links a score to a person who
    // asked to be forgotten.
    const boards = await db().collection('leaderboards').listDocuments();
    for (const board of boards) {
      await board.collection('entries').doc(uid).delete().catch(() => undefined);
    }

    // Run history.
    for (;;) {
      const runs = await col.runs().where('uid', '==', uid).limit(300).get();
      if (runs.empty) break;
      const batch = db().batch();
      runs.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      if (runs.size < 300) break;
    }

    // The ad-reward ledger is scrubbed, not deleted. Removing the rows would
    // drop replay protection, letting a deleted-and-recreated account claim
    // old transaction ids again; keeping the uid would retain an identifier
    // for someone who asked to be forgotten. Keep the transaction, lose the
    // person.
    for (;;) {
      const rewards = await db().collection('adRewards').where('uid', '==', uid).limit(300).get();
      if (rewards.empty) break;
      const batch = db().batch();
      rewards.docs.forEach((d) => batch.update(d.ref, { uid: null, scrubbedAt: Date.now() }));
      await batch.commit();
      if (rewards.size < 300) break;
    }

    await playerRef.delete();

    // Auth last: if anything above fails, the account still exists and the
    // player can retry. Deleting auth first would strand the data with no
    // way to reach it.
    await getAuth().deleteUser(uid).catch(() => undefined);

    auditLog('account_deleted', uid);
    return { ok: true };
  }
);
