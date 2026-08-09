import type { CallableRequest } from 'firebase-functions/v2/https';
import { fail } from '../utils/errors';

/**
 * Every authenticated callable starts here. Firebase verifies the ID token
 * before our code runs, so the presence of `auth` is trustworthy — but it is
 * absent for unauthenticated calls, which we must reject explicitly.
 */
export function requireUid(req: CallableRequest): string {
  const uid = req.auth?.uid;
  if (!uid) throw fail.unauth();
  return uid;
}

/**
 * App Check attestation. Deliberately monitor-only for now: we log the
 * absence rather than reject, so real users are never locked out while the
 * attestation providers are still being rolled out. Flip `enforce` to true
 * per-environment once the dashboards show clean traffic.
 */
export function checkAppAttestation(req: CallableRequest, enforce = false): boolean {
  const ok = req.app !== undefined;
  if (!ok && enforce) throw fail.denied('Failed app attestation.');
  return ok;
}
