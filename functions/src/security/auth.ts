import type { CallableRequest } from 'firebase-functions/v2/https';
import { fail } from '../utils/errors';
import { auditWarn } from '../utils/logging';

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
 * App Check attestation.
 *
 * Monitor-only by default: a missing attestation is **logged, not rejected**,
 * so real users are never locked out while the providers are still rolling
 * out. The logging is the entire point of the monitor phase — the Phase 12
 * step is "watch the metrics, then enforce", and without an
 * `appcheck_missing` line there is nothing to watch and no way to know
 * whether flipping the switch would lock anyone out.
 *
 * Pass the function name so the log says *which* endpoint is seeing
 * unattested traffic; enforcement is worth turning on per-endpoint, starting
 * with the ones that move currency.
 */
export function checkAppAttestation(
  req: CallableRequest,
  fnName: string,
  enforce = false
): boolean {
  const ok = req.app !== undefined;
  if (!ok) {
    auditWarn('appcheck_missing', req.auth?.uid ?? 'anonymous', { fn: fnName, enforce });
    if (enforce) throw fail.denied('Failed app attestation.');
  }
  return ok;
}
