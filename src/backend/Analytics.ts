/**
 * Analytics.
 *
 * The event taxonomy in docs/PRODUCTION_SPEC §9, made real. Four rules this
 * file exists to enforce, all of which are easy to get wrong at a call site
 * and impossible to get wrong here:
 *
 *  1. **Nothing is sent before consent.** Not queued-then-flushed on a later
 *     yes — genuinely not sent. Events raised while consent is unanswered or
 *     refused are dropped on the floor.
 *  2. **Nothing is sent before a sink exists**, but events raised during the
 *     first few hundred milliseconds of a cold start are the most valuable
 *     ones you have. They buffer, bounded, and flush once a sink resolves.
 *  3. **A sink is optional.** With no Firebase config, no plugin and no
 *     network, every call here is a no-op. The game must never depend on it.
 *  4. **Payload shapes are typed.** A misspelled event name or a renamed
 *     parameter is invisible in a dashboard for weeks; here it fails to
 *     compile.
 *
 * Two sinks, tried in order:
 *
 *  - `@capacitor-firebase/analytics` when the app runs in a native shell and
 *    the plugin is installed. Events land against the iOS/Android app stream
 *    with real device, retention and attribution data.
 *  - The Firebase JS SDK otherwise, which is the only option on web. Inside
 *    a native shell this would attribute app traffic to the *web* stream, so
 *    it is deliberately never used there.
 */

import { initFirebase } from './FirebaseClient';

/** Parameter values GA4 accepts. `undefined` keys are stripped before send. */
export type EventParams = Record<string, string | number | boolean | undefined>;

/**
 * The taxonomy. Adding a placement, a screen or a metric means adding it
 * here first — which is the point.
 *
 * `game_open` deviates from the spec's `app_open` on purpose: `app_open` is
 * an automatically-collected GA4 event on native, and emitting our own would
 * double-count sessions and corrupt the one number (DAU) this whole exercise
 * exists to measure.
 */
export interface EventMap {
  game_open: { version: string; platform: string; is_first_run: boolean };
  run_start: { mode: string; world: string; ball: string; paddle: string };
  level_start: { level: number; world: string; is_boss: boolean };
  level_clear: { level: number; seconds: number; best_combo: number; no_miss: boolean };
  life_lost: { level: number; score: number; lives_left: number };
  run_end: {
    score: number;
    level_reached: number;
    best_combo: number;
    seconds: number;
    continues_used: number;
  };
  powerup_collected: { type: string; level: number };
  boss_engaged: { level: number; world: string };
  boss_defeated: { level: number; world: string; seconds_to_kill: number };
  ad_offered: { placement: string };
  ad_started: { placement: string };
  ad_completed: { placement: string };
  ad_dismissed: { placement: string };
  shop_opened: { coins: number; tab: string };
  item_purchased: { kind: string; id: string; price: number; coins_after: number };
  iap_purchased: { sku: string; price_local: number; currency: string };
  settings_changed: { key: string; value: string | number };
  quality_downgraded: { from_tier: string; to_tier: string; frame_ms: number };
  arena_selected: { world: string; locked: boolean };
  consent_answered: { ads: boolean; analytics: boolean };
  error: { message: string; state: string };
}

export type EventName = keyof EventMap;

interface Sink {
  log(name: string, params: EventParams): void;
  setUserId(id: string | null): void;
}

/** GA4 caps string parameters at 100 characters and drops longer ones. */
function clamp(value: string): string {
  return value.length <= 100 ? value : value.slice(0, 97) + '...';
}

function sanitise(params: EventParams): EventParams {
  const out: EventParams = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    out[k] = typeof v === 'string' ? clamp(v) : v;
  }
  return out;
}

function isNative(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  return cap?.isNativePlatform?.() === true;
}

export function platformName(): string {
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return cap?.getPlatform?.() ?? 'web';
}

/** Buffer bound. A session that never resolves a sink must not grow forever. */
const MAX_BUFFERED = 40;

export class Analytics {
  private sink: Sink | null = null;
  private buffered: Array<{ name: string; params: EventParams }> = [];
  private booting: Promise<void> | null = null;
  private pendingUid: string | null = null;

  /**
   * @param allowed Consulted on every single event, never cached — the
   *   player can withdraw consent mid-session and the next event must
   *   already respect it.
   */
  constructor(private allowed: () => boolean) {}

  /**
   * Resolves a sink. Safe to call more than once and safe to never call —
   * `track` boots lazily on the first consented event, so a player who
   * declines never causes an SDK to load at all.
   */
  boot(): Promise<void> {
    if (this.booting) return this.booting;
    this.booting = (async (): Promise<void> => {
      this.sink = (await this.nativeSink()) ?? (await this.webSink());
      if (!this.sink) {
        this.buffered = [];
        return;
      }
      if (this.pendingUid !== null) this.sink.setUserId(this.pendingUid);
      const queued = this.buffered;
      this.buffered = [];
      for (const e of queued) this.sink.log(e.name, e.params);
    })();
    return this.booting;
  }

  private async nativeSink(): Promise<Sink | null> {
    if (!isNative()) return null;
    try {
      // Indirect specifier, deliberately — and note this is the OPPOSITE of
      // the rule in src/game/Ads.ts. This package is not a dependency at
      // all, so a literal import would fail the build outright. Hidden in a
      // variable it survives bundling and simply fails to resolve at runtime
      // until someone installs it, which is exactly the behaviour wanted:
      // the catch below falls through to the web SDK.
      const spec = '@capacitor-firebase/analytics';
      const mod = (await import(/* @vite-ignore */ spec)) as unknown as {
        FirebaseAnalytics: {
          logEvent(o: { name: string; params?: Record<string, unknown> }): Promise<void>;
          setUserId(o: { userId: string | null }): Promise<void>;
          setEnabled(o: { enabled: boolean }): Promise<void>;
        };
      };
      const fa = mod.FirebaseAnalytics;
      await fa.setEnabled({ enabled: true });
      return {
        log: (name, params): void => void fa.logEvent({ name, params }).catch(() => {}),
        setUserId: (id): void => void fa.setUserId({ userId: id }).catch(() => {}),
      };
    } catch {
      return null; // plugin not installed — fall through to the web SDK
    }
  }

  private async webSink(): Promise<Sink | null> {
    // Inside a native shell this files app traffic under the *web* stream,
    // so device, retention and attribution reporting are weaker than they
    // should be. It is still far better than the alternative, which is no
    // data at all from the store builds — so it runs, loudly.
    //
    // To upgrade: `npm i @capacitor-firebase/analytics`, add
    // android/app/google-services.json and
    // ios/App/App/GoogleService-Info.plist, then `npx cap sync`. The plugin
    // is picked up by `nativeSink` above with no code change. Do NOT install
    // it before those two config files exist — the native SDK aborts at
    // launch without them.
    if (isNative()) {
      console.info(
        '[analytics] using the web SDK inside a native shell; ' +
          'install @capacitor-firebase/analytics for app-stream attribution.'
      );
    }
    try {
      const fb = await initFirebase();
      if (!fb) return null;
      const mod = await import('firebase/analytics');
      if (!(await mod.isSupported())) return null;
      const ga = mod.getAnalytics(fb.app);
      return {
        log: (name, params): void => mod.logEvent(ga, name, params),
        setUserId: (id): void => mod.setUserId(ga, id ?? ''),
      };
    } catch {
      return null;
    }
  }

  /** Ties events to the Firebase uid so sessions join across devices. */
  identify(uid: string | null): void {
    this.pendingUid = uid;
    if (this.sink) this.sink.setUserId(uid);
  }

  /**
   * The only way to emit. Never throws, never awaits, never blocks a frame —
   * call it from anywhere in the game loop.
   */
  track<K extends EventName>(name: K, params: EventMap[K]): void {
    if (!this.allowed()) return;
    const clean = sanitise(params as EventParams);
    if (this.sink) {
      this.sink.log(name, clean);
      return;
    }
    if (this.buffered.length < MAX_BUFFERED) this.buffered.push({ name, params: clean });
    void this.boot();
  }
}
