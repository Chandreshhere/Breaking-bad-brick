/**
 * Server-owned tunables.
 *
 * These live in one module rather than inside `bootstrap` because more than
 * one function needs them: bootstrap advertises the values to the client and
 * `submitRun` has to actually *use* them. Two copies drift the moment anyone
 * edits one, and the failure is silent — the client is told coins are worth
 * one rate while the server pays another.
 *
 * Remote Config supersedes this later; the shape is what matters.
 */
export interface Tunables {
  dropChance: number;
  coinsPer100Points: number;
  livesPerRun: number;
  adsEnabled: boolean;
  interstitialEveryNRuns: number;
  continuesPerRun: number;
  dailyEnabled: boolean;
  leaderboardEnabled: boolean;
  maxRunsPerHour: number;
}

export const DEFAULT_CONFIG: Tunables = {
  dropChance: 0.22,
  coinsPer100Points: 1,
  livesPerRun: 3,
  adsEnabled: true,
  interstitialEveryNRuns: 3,
  continuesPerRun: 1,
  dailyEnabled: true,
  leaderboardEnabled: false,
  maxRunsPerHour: 60,
};

export interface AppStatus {
  minVersion: string;
  maintenance: boolean;
  message: string | null;
}

export const APP_STATUS: AppStatus = {
  minVersion: '1.0.0',
  maintenance: false,
  message: null,
};

// ─────────────────────────────────────────────────────────────────────────
// Remote Config
// ─────────────────────────────────────────────────────────────────────────

import { getRemoteConfig, type ServerTemplate } from 'firebase-admin/remote-config';

/**
 * How long a fetched template is trusted before refetching.
 *
 * Remote Config's server API is a network call, and bootstrap has a 3s
 * client budget it must not spend here. Five minutes means a warm instance
 * answers from memory, a tuning change reaches players within minutes
 * rather than a store release, and the RC API sees roughly one call per
 * instance per five minutes rather than one per player launch.
 */
const TEMPLATE_TTL_MS = 5 * 60 * 1000;

/**
 * How long to wait for a template before giving up and serving defaults.
 *
 * A slow config service must never become a slow game. Overshooting this
 * budget is not an error worth failing a launch over — the defaults below
 * are a correct, playable configuration.
 */
const TEMPLATE_TIMEOUT_MS = 1500;

let cached: ServerTemplate | null = null;
let cachedAt = 0;
let inFlight: Promise<ServerTemplate | null> | null = null;

export interface ResolvedConfig {
  config: Tunables;
  app: AppStatus;
  /** False when the defaults above were served — worth logging, not alerting. */
  fromRemote: boolean;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function loadTemplate(): Promise<ServerTemplate | null> {
  const fresh = cached && Date.now() - cachedAt < TEMPLATE_TTL_MS;
  if (fresh) return cached;
  if (inFlight) return inFlight;

  inFlight = (async (): Promise<ServerTemplate | null> => {
    try {
      // `defaultConfig` is what `evaluate()` falls back to per-key, so a
      // template that simply does not define a parameter yields the value
      // below rather than a zero.
      const template = await withTimeout(
        getRemoteConfig().getServerTemplate({
          defaultConfig: {
            ...DEFAULT_CONFIG,
            minVersion: APP_STATUS.minVersion,
            maintenance: APP_STATUS.maintenance,
            message: APP_STATUS.message ?? '',
          },
        }),
        TEMPLATE_TIMEOUT_MS
      );
      if (template) {
        cached = template;
        cachedAt = Date.now();
      }
      return cached;
    } catch (err) {
      // No template published yet, or the API is unreachable. Both are
      // normal — notably on a project where nobody has opened Remote Config.
      console.warn('[config] remote config unavailable, using defaults', err);
      return cached; // may be a stale template, which still beats nothing
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * The live tunables.
 *
 * **Every consumer must call this rather than reading `DEFAULT_CONFIG`.**
 * `bootstrap` advertises these values to the client and `submitRun` pays out
 * against them; if one reads Remote Config and the other reads the constants,
 * players are told coins are worth one rate and paid another, silently.
 */
export async function resolveConfig(): Promise<ResolvedConfig> {
  const template = await loadTemplate();
  if (!template) return { config: DEFAULT_CONFIG, app: APP_STATUS, fromRemote: false };

  try {
    const v = template.evaluate();
    // Every value is clamped to a sane range. Remote Config is a live edit
    // box with no schema: one mistyped digit could otherwise mint a million
    // coins per run, and there is no undo on coins already paid.
    const num = (key: string, fallback: number, min: number, max: number): number => {
      const raw = v.getNumber(key);
      if (!Number.isFinite(raw)) return fallback;
      return Math.min(max, Math.max(min, raw));
    };

    return {
      config: {
        dropChance: num('dropChance', DEFAULT_CONFIG.dropChance, 0, 1),
        coinsPer100Points: num('coinsPer100Points', DEFAULT_CONFIG.coinsPer100Points, 0, 50),
        livesPerRun: num('livesPerRun', DEFAULT_CONFIG.livesPerRun, 1, 10),
        adsEnabled: v.getBoolean('adsEnabled'),
        interstitialEveryNRuns: num(
          'interstitialEveryNRuns',
          DEFAULT_CONFIG.interstitialEveryNRuns,
          1,
          50
        ),
        continuesPerRun: num('continuesPerRun', DEFAULT_CONFIG.continuesPerRun, 0, 5),
        dailyEnabled: v.getBoolean('dailyEnabled'),
        leaderboardEnabled: v.getBoolean('leaderboardEnabled'),
        maxRunsPerHour: num('maxRunsPerHour', DEFAULT_CONFIG.maxRunsPerHour, 1, 1000),
      },
      app: {
        minVersion: v.getString('minVersion') || APP_STATUS.minVersion,
        maintenance: v.getBoolean('maintenance'),
        message: v.getString('message') || null,
      },
      fromRemote: true,
    };
  } catch (err) {
    console.warn('[config] template evaluation failed, using defaults', err);
    return { config: DEFAULT_CONFIG, app: APP_STATUS, fromRemote: false };
  }
}
