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

export interface RewardedAdProvider {
  /** False when nothing is loaded — the game hides the offer entirely. */
  isAvailable(): boolean;
  show(): Promise<AdResult>;
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
