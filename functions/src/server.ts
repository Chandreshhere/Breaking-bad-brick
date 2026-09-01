/**
 * Long-lived Node process — Render, Fly, a VPS, or `node lib/server.js`
 * locally against the emulators.
 *
 * One of three entry points onto the same Express app; see `app.ts`. This one
 * owns a port and a lifecycle, which is the only thing that makes it
 * different from `lambda.ts`.
 */

import { createApp, initAdmin } from './app';

// Before the first request, and deliberately at module scope:
// `firebase-functions` resolves the default Admin app lazily, and if it gets
// there first it initialises one with credentials that do not exist on this
// host — an authentication failure on the first request instead of a clear
// error at boot.
initAdmin();

const app = createApp();
const port = Number(process.env['PORT'] ?? 8080);
const server = app.listen(port, () => {
  console.info(`[server] listening on ${port}`);
});

// Render sends SIGTERM on deploy and on scale-down. Closing the listener lets
// in-flight requests finish instead of dying mid-transaction.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.info(`[server] ${signal} received, draining`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
