/**
 * Cloud Functions entry point.
 *
 * Authenticated game APIs are HTTPS *callables* — Firebase verifies the auth
 * token and App Check attestation before our code runs, so there is no
 * bespoke auth middleware to get wrong.
 *
 * Plain HTTP functions are reserved for external services that must call in
 * (AdMob SSV, RevenueCat webhooks) and are added in later phases.
 */
export { bootstrap } from './callable/bootstrap';
export { syncProfile } from './callable/syncProfile';
