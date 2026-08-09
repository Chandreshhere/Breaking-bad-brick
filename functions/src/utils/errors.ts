import { HttpsError } from 'firebase-functions/v2/https';

/** Client-safe failure codes. Never leak internals in the message. */
export const fail = {
  unauth: () => new HttpsError('unauthenticated', 'Sign-in required.'),
  badRequest: (why: string) => new HttpsError('invalid-argument', why),
  notFound: (what: string) => new HttpsError('not-found', `${what} not found.`),
  denied: (why: string) => new HttpsError('permission-denied', why),
  exhausted: () => new HttpsError('resource-exhausted', 'Too many requests.'),
  internal: () => new HttpsError('internal', 'Something went wrong.'),
};
