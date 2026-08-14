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
    // The most expensive endpoint in the codebase, and it was the only
    // mutating one with no limit at all.
    await rateLimit(uid, 'delete', 5, 3600);
    auditLog('account_deletion_requested', uid);

    const playerRef = col.players().doc(uid);
    const player = (await playerRef.get()).data() as { rankedBoards?: string[] } | undefined;

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
    //
    // Only the boards this player actually reached. Listing every board and
    // attempting a delete on each grows by one board per day for the life of
    // the game — a year in that is 365 sequential deletes for a player who
    // ranked on three of them, and eventually the callable times out and the
    // deletion never completes. `rankedBoards` is recorded by submitRun;
    // accounts predating it fall back to the scan, which is correct for them
    // because there are few and the board count was small.
    const boards = player?.rankedBoards?.length
      ? player.rankedBoards.map((b) => db().collection('leaderboards').doc(b))
      : await db().collection('leaderboards').listDocuments();
    await Promise.all(
      boards.map((board) =>
        board.collection('entries').doc(uid).delete().catch(() => undefined)
      )
    );

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
