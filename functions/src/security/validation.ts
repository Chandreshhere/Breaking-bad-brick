import { fail } from '../utils/errors';

export function str(v: unknown, field: string, max = 64): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) {
    throw fail.badRequest(`${field} must be a string of 1-${max} chars.`);
  }
  return v;
}

export function int(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.floor(v) !== v || v < min || v > max) {
    throw fail.badRequest(`${field} must be an integer between ${min} and ${max}.`);
  }
  return v;
}

export function oneOf<T extends string>(v: unknown, field: string, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    throw fail.badRequest(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return v as T;
}
