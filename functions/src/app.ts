/**
 * The API as an ordinary Express app.
 *
 * Built here and exported, rather than started here, so the same app can be
 * served three ways with no forked logic:
 *
 *   - `index.ts`   — as Cloud Functions, on the Firebase Blaze plan
 *   - `server.ts`  — as a long-lived Node process (Render, Fly, a VPS)
 *   - `lambda.ts`  — as an AWS Lambda behind a Function URL
 *
 * Only the last line of each of those differs. Everything below — the
 * handlers, the auth, the domain logic — is shared.
 *
 * **Nothing about the API changes.** `onCall` returns an ordinary Express
 * handler that already implements the callable wire protocol: it verifies the
 * Firebase ID token, verifies App Check, handles CORS preflight, and encodes
 * `{data}` in and `{result}` or `{error}` out. Mounting those same handlers
 * on an Express app gives byte-identical behaviour, so:
 *
 *  - the game client keeps using `httpsCallable` and only changes its origin;
 *  - every callable, every security check and all the domain logic is shared
 *    with `index.ts` rather than forked; and
 *  - moving back onto Cloud Functions later is a deploy, not a rewrite.
 *
 * The one thing that genuinely differs is credentials. Inside Google's
 * runtime the Admin SDK finds them automatically; anywhere else they come
 * from a service-account key in the environment. See docs/AWS.md or
 * docs/RENDER.md.
 */

import express, { type Express, type Request, type Response } from 'express';
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';

import { bootstrap } from './callable/bootstrap';
import { syncProfile } from './callable/syncProfile';
import { startRun, submitRun } from './callable/runs';
import { purchaseCosmetic, equipCosmetic } from './callable/shop';
import { getLeaderboard } from './callable/leaderboard';
import { updateConsent } from './callable/consent';
import { claimMission } from './callable/missions';
import { registerPushToken } from './callable/push';
import { exportPlayer, deletePlayer } from './callable/privacy';
import { admobSsv } from './http/admobSsv';
import { revenuecatWebhook } from './http/revenuecatWebhook';

/**
 * Initialise the Admin SDK before anything can serve a request.
 *
 * This must happen first: `firebase-functions` resolves the default app
 * lazily on the first call, and if it gets there before us it initialises one
 * with `applicationDefault()` credentials that do not exist on this host —
 * producing an authentication failure on the first request rather than a
 * clear error at boot.
 */
export function initAdmin(): void {
  if (getApps().length > 0) return;

  const raw = process.env['FIREBASE_SERVICE_ACCOUNT'];
  const projectId = process.env['FIREBASE_PROJECT_ID'];

  // Against the emulator suite there is nothing to authenticate to, and
  // demanding a real service-account key to run locally would push everyone
  // towards developing against production data.
  const emulated =
    process.env['FIRESTORE_EMULATOR_HOST'] ?? process.env['FIREBASE_AUTH_EMULATOR_HOST'];
  if (emulated && !raw) {
    initializeApp({ projectId: projectId ?? 'demo-bbb' });
    console.info('[server] emulator mode — no credentials required');
    return;
  }

  if (raw) {
    let parsed: Record<string, string>;
    try {
      // Render's dashboard preserves newlines in a multi-line value, but
      // plenty of other places do not, so accept a base64 blob too.
      const json = raw.trim().startsWith('{')
        ? raw
        : Buffer.from(raw, 'base64').toString('utf8');
      parsed = JSON.parse(json) as Record<string, string>;
    } catch (err) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON (or base64 of JSON). ' +
          `Paste the whole service-account key file. Underlying error: ${String(err)}`
      );
    }
    // A key pasted through a form often arrives with literal backslash-n
    // instead of real newlines, and the resulting error ("error:1E08010C") is
    // impossible to trace back to this cause.
    const key = parsed['private_key'];
    if (key?.includes('\\n')) parsed['private_key'] = key.replace(/\\n/g, '\n');

    initializeApp({
      credential: cert(parsed as never),
      projectId: projectId ?? parsed['project_id'],
    });
    return;
  }

  // GOOGLE_APPLICATION_CREDENTIALS pointing at a mounted key file, or a
  // metadata server if this ever runs on Google infrastructure.
  initializeApp({ credential: applicationDefault(), ...(projectId ? { projectId } : {}) });
}

/**
 * Builds the app. Call `initAdmin()` first — every deployment target
 * does this at module scope so the cost is paid once per cold start
 * rather than once per request.
 */
export function createApp(): Express {
  const app = express();

  // Every target here sits behind a TLS-terminating proxy — Render's edge, a
  // Lambda Function URL, Cloudflare. Without this the client address reads as
  // the proxy's and `req.protocol` reads as http, which breaks rate limiting
  // and any absolute URL the app builds.
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  // The callable protocol is JSON in, JSON out. The limit is deliberately small:
  // every payload this API accepts is a few hundred bytes of run statistics, and
  // an unbounded body parser on a public endpoint is free memory pressure for
  // anyone who wants it.
  app.use(express.json({ limit: '64kb' }));

  /**
   * Handlers from `onCall`/`onRequest` are `(req, res)` functions with extra
   * properties bolted on for the deployment tooling. Express does not know that
   * shape, hence the narrow cast in one place rather than at ten call sites.
   */
  type NodeHandler = (req: Request, res: Response) => void | Promise<void>;
  const handler = (fn: unknown): NodeHandler => fn as NodeHandler;

  /**
   * Mounted with `all`, not `post`.
   *
   * The callable protocol sends a CORS preflight `OPTIONS` before the real
   * `POST`, and the handler's own cors middleware answers it. Registering only
   * `post` would leave preflight to Express's 404, and every browser call would
   * fail with an opaque CORS error that looks like a server outage.
   */
  const callables: Record<string, unknown> = {
    bootstrap,
    syncProfile,
    startRun,
    submitRun,
    purchaseCosmetic,
    equipCosmetic,
    getLeaderboard,
    updateConsent,
    claimMission,
    registerPushToken,
    exportPlayer,
    deletePlayer,
  };

  for (const [name, fn] of Object.entries(callables)) {
    app.all(`/${name}`, handler(fn));
  }

  // External callers. AdMob signs the raw query string, so this must keep the
  // path and query it was called with — which is why it is mounted at the same
  // shape of URL it had on Cloud Functions.
  app.all('/admobSsv', handler(admobSsv));
  app.all('/revenuecatWebhook', handler(revenuecatWebhook));

  /**
   * Health check.
   *
   * On a free Render instance this is also the endpoint an uptime pinger hits
   * to keep the service from sleeping — see docs/RENDER.md for why that
   * matters here.
   */
  app.get(['/', '/healthz'], (_req, res) => {
    res.status(200).json({ ok: true, service: 'breaking-bad-brick-api' });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: { status: 'NOT_FOUND', message: 'No such endpoint.' } });
  });

  return app;
}
