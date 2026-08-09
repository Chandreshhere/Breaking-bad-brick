/**
 * The only file in the game that knows Firebase exists.
 *
 * Two rules it enforces:
 *
 *  1. **Optional.** With no `VITE_FIREBASE_*` config the whole backend is
 *     disabled and the game runs exactly as it did before — no errors, no
 *     stalls, no console noise. That keeps the web build shippable while the
 *     backend is still being stood up.
 *
 *  2. **Lazy.** The SDK is loaded with a dynamic import, so Vite code-splits
 *     it out of the main bundle. A player who never reaches an online feature
 *     never downloads it, which matters on the mobile connections this game
 *     is aimed at.
 */

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Functions } from 'firebase/functions';

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

function readConfig(): FirebaseConfig | null {
  const env = import.meta.env;
  const apiKey = env['VITE_FIREBASE_API_KEY'] as string | undefined;
  const projectId = env['VITE_FIREBASE_PROJECT_ID'] as string | undefined;
  const appId = env['VITE_FIREBASE_APP_ID'] as string | undefined;
  const authDomain = env['VITE_FIREBASE_AUTH_DOMAIN'] as string | undefined;
  if (!apiKey || !projectId || !appId || !authDomain) return null;
  return {
    apiKey,
    projectId,
    appId,
    authDomain,
    storageBucket: env['VITE_FIREBASE_STORAGE_BUCKET'] as string | undefined,
    messagingSenderId: env['VITE_FIREBASE_SENDER_ID'] as string | undefined,
  };
}

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  functions: Functions;
}

let handles: FirebaseHandles | null = null;
let initPromise: Promise<FirebaseHandles | null> | null = null;

/** True when the build carries a Firebase config at all. */
export function backendConfigured(): boolean {
  return readConfig() !== null;
}

/**
 * Initialises Firebase once. Returns null when unconfigured or when the SDK
 * fails to load — callers must treat null as "run offline", never as fatal.
 */
export function initFirebase(): Promise<FirebaseHandles | null> {
  if (handles) return Promise.resolve(handles);
  if (initPromise) return initPromise;

  const config = readConfig();
  if (!config) return Promise.resolve(null);

  initPromise = (async (): Promise<FirebaseHandles | null> => {
    try {
      const [{ initializeApp }, authMod, fnMod] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/functions'),
      ]);
      const app = initializeApp(config);
      const auth = authMod.getAuth(app);
      const functions = fnMod.getFunctions(app, 'us-central1');

      // Point at the local emulator suite during development so no dev run
      // ever touches real data.
      if (import.meta.env.DEV && import.meta.env['VITE_FIREBASE_EMULATOR'] === '1') {
        authMod.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
        fnMod.connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      }

      handles = { app, auth, functions };
      return handles;
    } catch (err) {
      console.warn('[backend] Firebase unavailable, running offline.', err);
      return null;
    }
  })();

  return initPromise;
}
