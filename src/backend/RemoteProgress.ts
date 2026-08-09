import { AuthService } from './AuthService';
import { BackendApi } from './BackendApi';
import { backendConfigured } from './FirebaseClient';
import { Outbox } from './Outbox';
import type {
  BootstrapResult,
  LeaderboardPage,
  OutboxItem,
  PurchaseResult,
  RemoteProgressApi,
  RunSubmission,
  RunTicket,
  SubmitRunResult,
  SyncProfileResult,
} from './BackendTypes';

/**
 * The single seam between the game and the backend.
 *
 * `ProgressStore` stays the synchronous source of truth the UI reads — this
 * class reconciles the cloud behind it. Nothing here may block a run: every
 * method is safe to call with no network, no config and no auth, and does
 * nothing useful in that case rather than failing.
 *
 * Phase 3 implements identity + bootstrap. `enqueue` already persists
 * mutations so that later phases can flush them without another migration.
 */
export class RemoteProgress implements RemoteProgressApi {
  private readonly auth = new AuthService();
  private readonly api = new BackendApi();
  private readonly outbox = new Outbox();
  private booted: BootstrapResult | null = null;
  private uid: string | null = null;
  private flushing = false;

  readonly enabled = backendConfigured();

  get online(): boolean {
    return this.enabled && this.uid !== null && navigator.onLine;
  }

  get player(): BootstrapResult['player'] | null {
    return this.booted?.player ?? null;
  }

  get config(): BootstrapResult['config'] | null {
    return this.booted?.config ?? null;
  }

  constructor() {
    if (!this.enabled) return;
    // Flush whatever queued up while the player was offline.
    window.addEventListener('online', () => void this.flush());
  }

  /**
   * Signs in anonymously and fetches the launch payload. Returns null when
   * the backend is unconfigured, unreachable or slow — the caller carries on
   * with local data either way.
   */
  async bootstrap(): Promise<BootstrapResult | null> {
    if (!this.enabled) return null;
    this.uid = await this.auth.signIn();
    if (!this.uid) return null;
    this.booted = await this.api.bootstrap();
    if (this.booted) void this.flush();
    return this.booted;
  }

  /**
   * Pushes a local profile snapshot up and returns the reconciled profile.
   * Queues for later when offline rather than losing the attempt.
   */
  async syncProfile(snapshot: unknown): Promise<SyncProfileResult | null> {
    if (!this.enabled) return null;
    if (!this.online) {
      this.enqueue('syncProfile', snapshot);
      return null;
    }
    const res = await this.api.syncProfile(snapshot);
    if (!res) this.enqueue('syncProfile', snapshot);
    return res;
  }

  /** Current run's server ticket, if one was issued. */
  private ticket: string | null = null;

  /**
   * Asks for a run ticket. Failure is fine and expected offline — the run
   * proceeds either way and simply submits as UNVERIFIED, because refusing
   * to let someone play in a tunnel is a worse outcome than an unranked
   * score.
   */
  async startRun(mode = 'ENDLESS'): Promise<RunTicket | null> {
    this.ticket = null;
    if (!this.online) return null;
    const t = await this.api.startRun(mode);
    this.ticket = t?.runId ?? null;
    return t;
  }

  /** Today's challenge, as of the last bootstrap. */
  get daily(): BootstrapResult['daily'] {
    return this.booted?.daily ?? null;
  }

  /** Submits a finished run, queueing it when offline. */
  async submitRun(run: Omit<RunSubmission, 'runId'>): Promise<SubmitRunResult | null> {
    if (!this.enabled) return null;
    const runId = this.ticket ?? `offline_${crypto.randomUUID()}`;
    this.ticket = null;
    const payload: RunSubmission = { ...run, runId };
    if (!this.online) {
      this.enqueue('submitRun', payload);
      return null;
    }
    const res = await this.api.submitRun(payload, runId);
    if (!res) this.enqueue('submitRun', payload);
    return res;
  }

  leaderboard(board: string, limit = 25): Promise<LeaderboardPage | null> {
    if (!this.online) return Promise.resolve(null);
    return this.api.leaderboard(board, limit);
  }

  purchase(kind: 'ball' | 'paddle', id: string): Promise<PurchaseResult | null> {
    if (!this.online) return Promise.resolve(null);
    return this.api.purchase(kind, id, `buy_${kind}_${id}`);
  }

  equip(kind: 'ball' | 'paddle', id: string): Promise<PurchaseResult | null> {
    if (!this.online) return Promise.resolve(null);
    return this.api.equip(kind, id);
  }

  /** Queues a mutation. Safe offline; flushed opportunistically. */
  enqueue(op: OutboxItem['op'], payload: unknown): void {
    if (!this.enabled) return;
    const item: OutboxItem = {
      id: `${op}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      op,
      payload,
      idempotencyKey: crypto.randomUUID(),
      createdAt: Date.now(),
      retries: 0,
    };
    void this.outbox.add(item);
  }

  /**
   * Drains the queue. A no-op until the phases that add the corresponding
   * callables land — items simply wait, which is the correct behaviour for a
   * queue whose consumer is not deployed yet.
   */
  async flush(): Promise<void> {
    if (!this.online || this.flushing) return;
    this.flushing = true;
    try {
      const items = await this.outbox.all();
      for (const item of items) {
        // Only the ops whose endpoints exist are drained; anything else
        // waits rather than being dropped, so a queue written by a newer
        // client is never destroyed by an older one.
        if (item.op === 'syncProfile') {
          const res = await this.api.syncProfile(item.payload);
          if (res) {
            await this.outbox.remove(item.id);
            this.onRemoteProfile?.(res);
          }
        } else if (item.op === 'submitRun') {
          const run = item.payload as RunSubmission;
          const res = await this.api.submitRun(run, run.runId);
          // A rejected run is removed too: retrying a submission the server
          // has already judged invalid would loop forever.
          if (res !== null) {
            await this.outbox.remove(item.id);
            this.onRemoteRun?.(res);
          }
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  /** Set by Experience so a flushed sync still reaches ProgressStore. */
  onRemoteProfile: ((res: SyncProfileResult) => void) | null = null;
  onRemoteRun: ((res: SubmitRunResult) => void) | null = null;
}
