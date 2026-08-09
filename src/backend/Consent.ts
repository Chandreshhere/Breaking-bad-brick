/**
 * Consent state.
 *
 * Kept locally so the gate can be decided before any network call — the
 * whole point is that nothing tracking-related fires until the player has
 * answered — and mirrored to the server, because "we asked and they agreed"
 * is what a regulator expects you to be able to evidence.
 *
 * This is a deliberately simple gate, not a full CMP. For EU traffic on the
 * store builds it must be replaced by Google's UMP SDK, which handles the
 * TCF strings ad networks actually require. See docs/BACKEND.md.
 */

const KEY = 'acb-consent';

export interface ConsentState {
  answered: boolean;
  ads: boolean;
  analytics: boolean;
  at: number;
}

const BLANK: ConsentState = { answered: false, ads: false, analytics: false, at: 0 };

export class ConsentStore {
  private state: ConsentState = BLANK;

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.state = { ...BLANK, ...(JSON.parse(raw) as Partial<ConsentState>) };
    } catch {
      this.state = BLANK;
    }
  }

  get value(): Readonly<ConsentState> {
    return this.state;
  }

  get needsPrompt(): boolean {
    return !this.state.answered;
  }

  /** True only when the player actively agreed — the default is always no. */
  get adsAllowed(): boolean {
    return this.state.answered && this.state.ads;
  }

  get analyticsAllowed(): boolean {
    return this.state.answered && this.state.analytics;
  }

  set(ads: boolean, analytics: boolean): ConsentState {
    this.state = { answered: true, ads, analytics, at: Date.now() };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* private mode — the prompt will simply appear again next session */
    }
    return this.state;
  }
}
