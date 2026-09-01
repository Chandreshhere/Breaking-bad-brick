/**
 * Crash and error reporting.
 *
 * The game is a single long-lived WebGL loop: one uncaught exception in a
 * frame callback and the player is looking at a frozen court with no idea
 * why, on a device you will never hold. This file is how you find out.
 *
 * Three deliberate choices:
 *
 *  - **Handlers are installed unconditionally, reporting is not.** `window`
 *    error and rejection handlers attach on the first call regardless of
 *    consent or config, because they also drive the in-game `error` event
 *    and the console breadcrumb. Only the *upload* to Sentry is gated.
 *  - **Sentry is optional twice over** — off unless `VITE_SENTRY_DSN` is set,
 *    and dynamically imported so a build without the package still compiles
 *    and runs. Same contract as the ad and analytics plugins.
 *  - **Errors are sampled, not fire-hosed.** One broken frame fires the same
 *    exception sixty times a second; unthrottled that is a self-inflicted
 *    denial of service against your own quota. Identical messages are
 *    reported once per session.
 */

export interface CrashContext {
  /** Coarse game state at the time of the error — 'menu', 'rally', etc. */
  state: () => string;
  /** Reported alongside the event so a spike can be pinned to a release. */
  release: string;
  /** Called for every captured error, consent-gated by the caller. */
  onError?: (message: string, state: string) => void;
}

type SentryLike = {
  init(o: Record<string, unknown>): void;
  captureException(e: unknown, hint?: Record<string, unknown>): void;
  setUser(u: { id: string } | null): void;
  setTag(k: string, v: string): void;
};

function messageOf(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err).slice(0, 200);
  } catch {
    return 'unknown error';
  }
}

export class CrashReporter {
  private sentry: SentryLike | null = null;
  private seen = new Set<string>();
  private ctx: CrashContext | null = null;
  private attached = false;

  /** True when a DSN is configured. Nothing uploads without one. */
  get configured(): boolean {
    return Boolean(import.meta.env['VITE_SENTRY_DSN']);
  }

  /**
   * Installs the global handlers and, when configured, loads Sentry. Never
   * rejects: a reporting failure must never be the thing that breaks a
   * session.
   */
  async attach(ctx: CrashContext): Promise<void> {
    this.ctx = ctx;
    if (!this.attached) {
      this.attached = true;
      window.addEventListener('error', (e) => this.capture(e.error ?? e.message));
      window.addEventListener('unhandledrejection', (e) => this.capture(e.reason));
    }

    const dsn = import.meta.env['VITE_SENTRY_DSN'] as string | undefined;
    if (!dsn) return;

    try {
      // A literal specifier so the bundler can see it and split Sentry into
      // its own chunk. It must stay literal: hiding the name in a variable
      // leaves a bare module specifier in the output that no browser can
      // resolve at runtime, which is exactly how the Capacitor plugins came
      // to silently never load. See src/game/Ads.ts.
      //
      // The chunk is fetched only when a DSN is configured, so a build
      // without one never downloads it.
      const mod = (await import('@sentry/browser')) as unknown as SentryLike;
      mod.init({
        dsn,
        release: ctx.release,
        environment: import.meta.env.DEV ? 'development' : 'production',
        // Performance tracing on a 60fps render loop produces enormous,
        // useless spans. Errors are the entire point here.
        tracesSampleRate: 0,
        // Breadcrumbs from a game loop are mostly noise; keep enough to see
        // the last few user actions before the throw.
        maxBreadcrumbs: 20,
        beforeSend: (event: { request?: { url?: string } }) => {
          // A file:// URL from a native shell carries the device's path.
          if (event.request?.url) delete event.request.url;
          return event;
        },
      });
      mod.setTag('platform_shell', this.shell());
      this.sentry = mod;
    } catch {
      /* package absent or DSN rejected — handlers still run locally */
    }
  }

  private shell(): string {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    return cap?.getPlatform?.() ?? 'web';
  }

  /** Associates reports with the anonymous Firebase uid. */
  identify(uid: string | null): void {
    this.sentry?.setUser(uid ? { id: uid } : null);
  }

  /**
   * Reports one error. Safe to call from a hot path — the duplicate guard
   * makes the second and later occurrences of the same fault free.
   */
  capture(err: unknown): void {
    const message = messageOf(err);
    if (this.seen.has(message)) return;
    this.seen.add(message);

    const state = this.ctx?.state() ?? 'unknown';
    console.error(`[crash][${state}]`, err);
    this.ctx?.onError?.(message, state);
    try {
      this.sentry?.captureException(err, { tags: { game_state: state } });
    } catch {
      /* reporting must never itself throw */
    }
  }

  /**
   * Wraps a callback so a throw inside it is reported rather than silently
   * killing a listener. Returns a function with the same signature.
   */
  guard<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
    return (...args: A): void => {
      try {
        fn(...args);
      } catch (err) {
        this.capture(err);
        throw err;
      }
    };
  }
}
