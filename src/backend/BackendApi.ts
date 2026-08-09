import { initFirebase } from './FirebaseClient';
import type {
  BootstrapResult,
  LeaderboardPage,
  PurchaseResult,
  RunSubmission,
  RunTicket,
  SubmitRunResult,
  SyncProfileResult,
} from './BackendTypes';

/**
 * Thin wrapper over the callable functions.
 *
 * Callables carry the Firebase auth token and App Check attestation
 * automatically, so there is no hand-rolled auth header anywhere in the
 * client. Every method resolves to null on failure rather than throwing —
 * a backend problem must never surface as an unhandled rejection mid-game.
 */
export class BackendApi {
  /** Rejects if the call takes longer than the caller's patience allows. */
  private async withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
    let timer: number | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = window.setTimeout(() => resolve(null), ms);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (timer !== undefined) window.clearTimeout(timer);
    }
  }

  private async call<T>(name: string, payload: unknown, timeoutMs: number): Promise<T | null> {
    const fb = await initFirebase();
    if (!fb) return null;
    try {
      const { httpsCallable } = await import('firebase/functions');
      const fn = httpsCallable(fb.functions, name);
      const res = await this.withTimeout(fn(payload), timeoutMs);
      if (!res) return null;
      return res.data as T;
    } catch (err) {
      console.warn(`[backend] ${name} failed`, err);
      return null;
    }
  }

  /** One launch call. 3s budget — after that the game starts offline. */
  bootstrap(): Promise<BootstrapResult | null> {
    return this.call<BootstrapResult>('bootstrap', {}, 3000);
  }

  /** Pushes local progress up, returns the reconciled profile. */
  syncProfile(profile: unknown): Promise<SyncProfileResult | null> {
    return this.call<SyncProfileResult>('syncProfile', { profile }, 8000);
  }

  /** Short budget: a slow ticket must not delay the serve. */
  startRun(mode = 'ENDLESS'): Promise<RunTicket | null> {
    return this.call<RunTicket>('startRun', { mode }, 2500);
  }

  submitRun(run: RunSubmission, idempotencyKey: string): Promise<SubmitRunResult | null> {
    return this.call<SubmitRunResult>('submitRun', { ...run, idempotencyKey }, 10000);
  }

  purchase(kind: 'ball' | 'paddle', id: string, idempotencyKey: string): Promise<PurchaseResult | null> {
    return this.call<PurchaseResult>('purchaseCosmetic', { kind, id, idempotencyKey }, 10000);
  }

  equip(kind: 'ball' | 'paddle', id: string): Promise<PurchaseResult | null> {
    return this.call<PurchaseResult>('equipCosmetic', { kind, id }, 8000);
  }

  leaderboard(board: string, limit = 25): Promise<LeaderboardPage | null> {
    return this.call<LeaderboardPage>('getLeaderboard', { board, limit }, 8000);
  }

  consent(ads: boolean, analytics: boolean): Promise<{ ok: boolean } | null> {
    return this.call<{ ok: boolean }>('updateConsent', { ads, analytics }, 6000);
  }

  claimMission(id: string): Promise<{ ok: boolean; reason: string } | null> {
    return this.call<{ ok: boolean; reason: string }>('claimMission', { id }, 8000);
  }

  exportData(): Promise<unknown | null> {
    return this.call<unknown>('exportPlayer', {}, 15000);
  }

  deleteAccount(): Promise<{ ok: boolean } | null> {
    return this.call<{ ok: boolean }>('deletePlayer', {}, 20000);
  }
}
