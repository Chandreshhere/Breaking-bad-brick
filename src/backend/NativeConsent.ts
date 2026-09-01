/**
 * Google UMP consent and Apple App Tracking Transparency.
 *
 * The in-house gate in `Consent.ts` is honest but it is not a CMP: it does
 * not emit the IAB TCF strings that ad networks require, so in the EU/UK it
 * results in non-personalised inventory at best and no fill at worst. UMP is
 * Google's certified CMP, ships inside the AdMob plugin, and is what actually
 * unlocks European ad revenue.
 *
 * Order matters and is easy to get wrong:
 *
 *  1. **UMP first, ATT second.** Google's documented sequence. ATT asks for
 *     the IDFA; UMP asks for the legal basis to use it. Prompting for the
 *     IDFA before the player has agreed to anything reads as a dark pattern
 *     to reviewers and produces a worse opt-in rate.
 *  2. **Both before the AdMob SDK is initialised**, so the first ad request
 *     of the session already carries the right signals.
 *  3. **A privacy-options entry point is mandatory** once UMP says it is —
 *     an EU player must be able to reopen the form and change their mind.
 *     `showPrivacyOptions` is wired into the in-game privacy screen.
 *
 * Everything here no-ops on web and on any build without the plugin, so
 * there is one code path rather than a platform branch in the game.
 */

export interface NativeConsentResult {
  /** True when UMP says ad requests are permitted. */
  canRequestAds: boolean;
  /** True when the player must be offered a way to reopen the form. */
  privacyOptionsRequired: boolean;
  /** False when UMP is not present at all — caller falls back to its own gate. */
  available: boolean;
}

const UNAVAILABLE: NativeConsentResult = {
  canRequestAds: false,
  privacyOptionsRequired: false,
  available: false,
};

type ConsentInfo = {
  status: string;
  isConsentFormAvailable?: boolean;
  canRequestAds: boolean;
  privacyOptionsRequirementStatus: string;
};

type AdMobConsentPlugin = {
  requestConsentInfo(o?: Record<string, unknown>): Promise<ConsentInfo>;
  showConsentForm(): Promise<ConsentInfo>;
  showPrivacyOptionsForm(): Promise<void>;
  requestTrackingAuthorization(): Promise<void>;
  trackingAuthorizationStatus(): Promise<{ status: string }>;
};

function platform(): string {
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return cap?.getPlatform?.() ?? 'web';
}

function isNative(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  return cap?.isNativePlatform?.() === true;
}

export class NativeConsent {
  private plugin: AdMobConsentPlugin | null = null;
  private last: NativeConsentResult = UNAVAILABLE;

  /** The most recent result, for callers that cannot await. */
  get state(): NativeConsentResult {
    return this.last;
  }

  private async load(): Promise<AdMobConsentPlugin | null> {
    if (this.plugin) return this.plugin;
    if (!isNative()) return null;
    try {
      const mod = (await import('@capacitor-community/admob')) as unknown as {
        AdMob: AdMobConsentPlugin;
      };
      this.plugin = mod.AdMob;
      return this.plugin;
    } catch {
      return null;
    }
  }

  /**
   * Runs the full flow. Returns `available: false` on web or without the
   * plugin, which the caller must read as "use your own gate" rather than
   * as "consent refused".
   */
  async request(): Promise<NativeConsentResult> {
    const ad = await this.load();
    if (!ad) return (this.last = UNAVAILABLE);

    try {
      let info = await ad.requestConsentInfo({
        // Under-age tagging is a publisher declaration about the audience,
        // not a per-player toggle. This game is rated general audience and
        // is not directed at children, so it stays false.
        tagForUnderAgeOfConsent: false,
      });

      // REQUIRED means the player is in a region where consent is legally
      // needed and has not given it. Outside those regions the form is not
      // available and this is correctly skipped.
      if (info.status === 'REQUIRED' && info.isConsentFormAvailable) {
        info = await ad.showConsentForm();
      }

      // ATT strictly after UMP, and only on iOS — Android has no ATT and the
      // call would reject.
      if (platform() === 'ios') await this.requestTracking(ad);

      return (this.last = {
        canRequestAds: info.canRequestAds === true,
        privacyOptionsRequired: info.privacyOptionsRequirementStatus === 'REQUIRED',
        available: true,
      });
    } catch (err) {
      // A UMP failure must not block the game. Treat it as "no CMP" and let
      // the in-house gate decide, which is the conservative outcome.
      console.warn('[consent] UMP flow failed', err);
      return (this.last = UNAVAILABLE);
    }
  }

  /** Prompts for ATT once. Already-answered returns immediately. */
  private async requestTracking(ad: AdMobConsentPlugin): Promise<void> {
    try {
      const { status } = await ad.trackingAuthorizationStatus();
      if (status === 'notDetermined') await ad.requestTrackingAuthorization();
    } catch {
      /* pre-iOS 14, or the prompt is unavailable — ads still serve, unpersonalised */
    }
  }

  /**
   * Reopens the UMP privacy form. Wired to the in-game privacy screen, which
   * is the entry point UMP requires publishers to provide.
   */
  async showPrivacyOptions(): Promise<boolean> {
    const ad = await this.load();
    if (!ad) return false;
    try {
      await ad.showPrivacyOptionsForm();
      return true;
    } catch {
      return false;
    }
  }
}
