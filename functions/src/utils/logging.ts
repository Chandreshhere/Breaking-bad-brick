import { logger } from 'firebase-functions';

export function auditLog(event: string, uid: string, data: Record<string, unknown> = {}): void {
  // Structured so it is queryable in Cloud Logging. Never log PII or tokens.
  logger.info(event, { uid, ...data });
}

export function auditWarn(event: string, uid: string, data: Record<string, unknown> = {}): void {
  logger.warn(event, { uid, ...data });
}
