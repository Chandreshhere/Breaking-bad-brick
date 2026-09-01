/**
 * AWS Lambda entry point, behind a Function URL.
 *
 * One of three entry points onto the same Express app; see `app.ts`. Nothing
 * about the API changes — the game client still speaks the Firebase callable
 * protocol and only its origin differs.
 *
 * Why Lambda rather than a container: this workload is bursty and idle most
 * of the time. A Render free instance sleeps after 15 minutes and takes about
 * a minute to wake, which is far outside the client's 3-second launch budget;
 * a Lambda cold start is a few hundred milliseconds and is inside it. The
 * always-free allowance (1M requests and 400,000 GB-seconds a month) covers
 * roughly a quarter of a million sessions at this app's ~4 calls each.
 *
 * Deploy with `sam deploy --guided` from `functions/`; see docs/AWS.md.
 */

import serverlessExpress from '@codegenie/serverless-express';
import { createApp, initAdmin } from './app';

/**
 * Module scope, not handler scope — and this is the whole performance story
 * on Lambda.
 *
 * Code out here runs once per *execution environment*; code inside the
 * handler runs once per *request*. Initialising the Admin SDK and building
 * the Express app here means a warm invocation does neither, and the
 * Firestore gRPC channel stays open between requests rather than being
 * renegotiated every time. Moving these two lines inside the handler would
 * add hundreds of milliseconds to every single call.
 */
initAdmin();
const app = createApp();

/**
 * Function URLs deliver an API Gateway v2 (`payloadFormatVersion: 2.0`)
 * event. The adapter detects that automatically; it is named here so a future
 * move to a REST API or an ALB is an explicit change rather than a silent
 * mis-parse of the request body.
 */
export const handler = serverlessExpress({
  app,
  // The callable protocol is JSON both ways and the SSV callback is plain
  // text, so nothing this API returns needs base64 transport. Listing the
  // types keeps a stray binary response from being silently mangled.
  binarySettings: { isBinary: false },
});
