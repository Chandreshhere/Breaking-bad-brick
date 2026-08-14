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
