/**
 * Rewarded-ad seam.
 *
 * This file deliberately contains NO ad network. It defines the interface the
 * game calls and ships a visible placeholder so the continue-for-reward flow
 * is fully playable and testable today. Swapping in a real network later is a
 * one-file change: implement `RewardedAdProvider` against AdMob (through
 * Capacitor for the store builds) or an HTML5 ad SDK for web, and hand it to
 * `Experience`. Nothing else in the game needs to know.
 *
 * Two rules the game relies on and any real implementation must honour:
 *   - `show()` must resolve exactly once, and must never reject.
 *   - The reward is granted only on 'completed'. A dismissed ad pays nothing.
 */

export type AdResult = 'completed' | 'dismissed' | 'unavailable';

/** True only inside a Capacitor native shell, where AdMob actually exists. */
export function isNativeShell(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  return cap?.isNativePlatform?.() === true;
}

export interface RewardedAdProvider {
  /** False when nothing is loaded — the game hides the offer entirely. */
  isAvailable(): boolean;
  show(): Promise<AdResult>;
}

/**
 * AdMob through Capacitor.
 *
 * The web build has no AdMob rewarded video — the SDK is native only — so
 * this reports unavailable until the app runs inside a Capacitor shell with
 * `@capacitor-community/admob` installed. That keeps one provider working
 * across both targets instead of branching the game on platform.
 *
 * The reward is NOT granted here. `show()` only reports that the ad
 * completed; the coins arrive from AdMob's server-side verification callback
 * hitting the `admobSsv` function. A client that grants its own reward is a
 * client that can grant itself infinite rewards.
 */
export class AdMobRewardedAd implements RewardedAdProvider {
  private loaded = false;
  private plugin: {
    prepareRewardVideoAd(o: unknown): Promise<unknown>;
    showRewardVideoAd(): Promise<unknown>;
  } | null = null;

  constructor(
    private adUnitId: string,
    /** Firebase uid, forwarded so the SSV callback can identify the player. */
    private userId: () => string | null
  ) {}

  /** Resolves the native plugin if we are running inside Capacitor. */
  private async load(): Promise<boolean> {
    if (this.plugin) return true;
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor;
    if (!cap?.isNativePlatform?.()) return false;
    try {
      // Indirect specifier on purpose: the plugin only exists in a Capacitor
      // build, and a literal import would make the web build fail to compile
      // over a dependency it is never meant to have.
      const spec = '@capacitor-community/admob';
      const mod = (await import(/* @vite-ignore */ spec)) as unknown as {
        AdMob: NonNullable<AdMobRewardedAd['plugin']>;
      };
      this.plugin = mod.AdMob;
      return true;
    } catch {
      return false;
    }
  }

  isAvailable(): boolean {
    return this.loaded;
  }

  /** Call once at startup; safe to call on web, where it does nothing. */
  async prepare(): Promise<void> {
    if (!(await this.load())) return;
    try {
      await this.plugin!.prepareRewardVideoAd({
        adId: this.adUnitId,
        ssv: { userId: this.userId() ?? undefined },
      });
      this.loaded = true;
    } catch {
      this.loaded = false;
    }
  }

  async show(): Promise<AdResult> {
    if (!(await this.load())) return 'unavailable';
    try {
      await this.plugin!.showRewardVideoAd();
      this.loaded = false;
      void this.prepare(); // load the next one
      return 'completed';
    } catch {
      return 'dismissed';
    }
  }
}

/**
 * Wraps a provider so it reports unavailable until consent is given.
 *
 * Gating at this seam rather than at each call site means a new ad placement
 * added later cannot forget to check — the provider itself refuses.
 */
export class ConsentGatedAd implements RewardedAdProvider {
  constructor(
    private inner: RewardedAdProvider,
    private allowed: () => boolean
  ) {}

  /** Preloads the wrapped provider, if it needs it. Never before consent. */
  async prepare(): Promise<void> {
    if (!this.allowed()) return;
    const inner = this.inner as { prepare?: () => Promise<void> };
    await inner.prepare?.();
  }

  isAvailable(): boolean {
    return this.allowed() && this.inner.isAvailable();
  }

  async show(): Promise<AdResult> {
    if (!this.allowed()) return 'unavailable';
    return this.inner.show();
  }
}

/** Nothing to show. Used when ads are disabled or a network failed to load. */
export class NullRewardedAd implements RewardedAdProvider {
  isAvailable(): boolean {
    return false;
  }
  async show(): Promise<AdResult> {
    return 'unavailable';
  }
}

/**
 * Placeholder that stands in for a real rewarded video: a full-screen panel
 * with a skip-blocked countdown, then 'completed'. It looks like an ad break
 * so the pacing of the real thing can be judged before a network exists.
 */
export class PlaceholderRewardedAd implements RewardedAdProvider {
  constructor(private seconds = 4) {}

  isAvailable(): boolean {
    return true;
  }

  show(): Promise<AdResult> {
    return new Promise((resolve) => {
      const host = document.createElement('div');
      host.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:100',
        'background:#05070a',
        'color:#f2edda',
        'display:flex',
        'flex-direction:column',
        'align-items:center',
        'justify-content:center',
        'gap:18px',
        'font-family:"Helvetica Neue",Helvetica,Arial,sans-serif',
        'text-align:center',
        'padding:24px',
      ].join(';');
      host.innerHTML = `
        <div style="font-size:12px;letter-spacing:0.3em;opacity:0.55">ADVERTISEMENT</div>
        <div style="font-size:clamp(20px,5vw,30px);font-weight:700;letter-spacing:0.06em">
          PLACEHOLDER AD
        </div>
        <div style="font-size:13px;opacity:0.6;max-width:32ch;line-height:1.5">
          A real rewarded video goes here. Reward is granted only when it finishes.
        </div>
        <div data-t style="font-size:clamp(30px,9vw,52px);font-weight:700;color:#efd42e"></div>`;
      document.body.appendChild(host);

      const label = host.querySelector<HTMLDivElement>('[data-t]')!;
      let left = this.seconds;
      label.textContent = String(left);
      const timer = window.setInterval(() => {
        left -= 1;
        label.textContent = String(Math.max(0, left));
        if (left <= 0) {
          window.clearInterval(timer);
          host.remove();
          resolve('completed');
        }
      }, 1000);
    });
  }
}
