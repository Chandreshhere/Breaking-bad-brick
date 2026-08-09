import { initFirebase } from './FirebaseClient';

/**
 * Anonymous-first identity.
 *
 * A player gets a durable uid on first launch without ever seeing a sign-in
 * screen; linking to Apple or Google later keeps the same uid, so progress
 * and purchases survive the upgrade. We deliberately do not implement our own
 * /auth/anonymous endpoint — Firebase already owns this, and rolling it
 * ourselves would mean owning token rotation and revocation.
 */
export class AuthService {
  private uid: string | null = null;

  get currentUid(): string | null {
    return this.uid;
  }

  /** Resolves to a uid, or null when the backend is unavailable. */
  async signIn(): Promise<string | null> {
    const fb = await initFirebase();
    if (!fb) return null;
    try {
      const { signInAnonymously, onAuthStateChanged } = await import('firebase/auth');
      const existing = await new Promise<string | null>((resolve) => {
        const stop = onAuthStateChanged(fb.auth, (user) => {
          stop();
          resolve(user?.uid ?? null);
        });
      });
      if (existing) {
        this.uid = existing;
        return existing;
      }
      const cred = await signInAnonymously(fb.auth);
      this.uid = cred.user.uid;
      return this.uid;
    } catch (err) {
      console.warn('[backend] anonymous sign-in failed, running offline.', err);
      return null;
    }
  }
}
