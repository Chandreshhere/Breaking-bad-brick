/**
 * AdMob identifiers.
 *
 * **Google's test unit ids are the default, deliberately.** Serving real ads
 * to yourself during development is the fastest way to get an AdMob account
 * suspended for invalid traffic — Google cannot tell your testing from click
 * fraud, and the penalty is the whole account, not the app. The test units
 * below always fill, never pay, and are safe to click.
 *
 * Real ids come from `.env.local` / the deploy environment, so the switch to
 * live inventory is a config change rather than a code change.
 */

/** Google's published sample units. Safe to click, never earn. */
const TEST_IDS = {
  android: {
    appId: 'ca-app-pub-3940256099942544~3347511713',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
  },
  ios: {
    appId: 'ca-app-pub-3940256099942544~1458002511',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
  },
} as const;

export interface AdConfig {
  appId: string;
  rewardedId: string;
  /** True while pointing at Google's test inventory. */
  isTest: boolean;
}

function platform(): 'android' | 'ios' {
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return cap?.getPlatform?.() === 'ios' ? 'ios' : 'android';
}

export function adConfig(): AdConfig {
  const env = import.meta.env;
  const p = platform();
  const appId = env['VITE_ADMOB_APP_ID'] as string | undefined;
  const rewardedId = env['VITE_ADMOB_REWARDED_ID'] as string | undefined;

  // Real ids only in a production build. A dev build that accidentally
  // carried live ids would be serving real ads to the developer.
  const useReal = Boolean(appId && rewardedId) && !env.DEV;
  if (useReal) return { appId: appId!, rewardedId: rewardedId!, isTest: false };

  const t = TEST_IDS[p];
  return { appId: t.appId, rewardedId: t.rewarded, isTest: true };
}
