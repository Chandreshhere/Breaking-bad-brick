/**
 * Minimal HTML HUD for Phase 5 — lives, score, and state messages as a DOM
 * overlay (never TextGeometry). Phase 9 replaces this with the full art-
 * directed UI; the API is what matters now.
 */
export class Hud {
  /** Set by Game — invoked when the pause button is pressed. */
  onPause: (() => void) | null = null;
  private root: HTMLDivElement;
  private livesEl: HTMLSpanElement;
  private scoreEl: HTMLSpanElement;
  private messageEl: HTMLDivElement;
  private pauseButton: HTMLButtonElement;
  private bar: HTMLDivElement;
  private levelEl: HTMLSpanElement;
  private comboEl: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.style.cssText = [
      'position:absolute',
      'inset:0',
      'pointer-events:none',
      'font-family:"Helvetica Neue",Helvetica,Arial,sans-serif',
      'z-index:10',
    ].join(';');

    this.bar = document.createElement('div');
    const bar = this.bar;
    bar.style.cssText = [
      'position:absolute',
      'top:22px',
      'left:50%',
      'transform:translateX(-50%)',
      'display:flex',
      'align-items:center',
      'gap:18px',
      'color:#f3efe2',
      'font-size:clamp(14px, 2.2vw, 20px)',
      'letter-spacing:0.12em',
      'text-shadow:0 1px 8px rgba(0,0,0,0.6)',
    ].join(';');

    this.levelEl = document.createElement('span');
    this.levelEl.textContent = 'LV 1';
    this.levelEl.style.cssText = 'opacity:0.65;letter-spacing:0.2em';

    const livesLabel = document.createElement('span');
    livesLabel.textContent = 'LIVES';
    this.livesEl = document.createElement('span');
    this.livesEl.style.cssText = 'display:inline-flex;gap:7px;align-items:center';
    const divider = document.createElement('span');
    divider.textContent = '|';
    divider.style.opacity = '0.5';
    this.scoreEl = document.createElement('span');
    this.scoreEl.style.cssText =
      'color:#e8e04a;font-size:clamp(18px, 3vw, 26px);font-weight:600;min-width:60px';
    bar.append(this.levelEl, livesLabel, this.livesEl, divider, this.scoreEl);

    this.messageEl = document.createElement('div');
    this.messageEl.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:56%',
      'transform:translateX(-50%)',
      'color:#e8d98a',
      'font-size:clamp(14px, 2.4vw, 22px)',
      'letter-spacing:0.28em',
      'text-align:center',
      'text-shadow:0 2px 12px rgba(0,0,0,0.7)',
      'white-space:nowrap',
    ].join(';');

    this.comboEl = document.createElement('div');
    this.comboEl.style.cssText = [
      'position:absolute',
      'top:60px',
      'left:50%',
      'transform:translateX(-50%)',
      'font-size:clamp(15px, 2vw, 22px)',
      'font-weight:700',
      'letter-spacing:0.18em',
      'text-shadow:0 2px 10px rgba(0,0,0,0.6)',
      'display:none',
      'white-space:nowrap',
    ].join(';');

    this.pauseButton = document.createElement('button');
    this.pauseButton.textContent = '❙ ❙';
    this.pauseButton.style.cssText = [
      'position:absolute',
      'top:22px',
      'right:30px',
      'background:none',
      'border:none',
      'color:#f2edda',
      'font-size:22px',
      'letter-spacing:0.1em',
      'cursor:pointer',
      'pointer-events:auto',
      'opacity:0.85',
      'display:none',
      'font-family:inherit',
    ].join(';');
    this.pauseButton.onclick = (): void => this.onPause?.();

    this.root.append(bar, this.comboEl, this.messageEl, this.pauseButton);
    container.appendChild(this.root);
  }

  /** Lives as little tennis balls, like the reference. */
  setLives(n: number): void {
    this.livesEl.innerHTML = Array.from(
      { length: Math.max(0, n) },
      () =>
        '<span style="width:15px;height:15px;border-radius:50%;display:inline-block;' +
        'background:radial-gradient(circle at 34% 30%, #f6f89e 0%, #dfe34a 55%, #b7bd2e 100%);' +
        'box-shadow:0 1px 5px rgba(0,0,0,0.5)"></span>'
    ).join('');
  }

  setLevel(n: number): void {
    this.levelEl.textContent = `LV ${n}`;
  }

  /** Live combo readout — pulses on every increment, hidden below 2 hits. */
  setCombo(combo: number, mult: number, color: string, overdrive: boolean): void {
    if (combo < 2) {
      this.comboEl.style.display = 'none';
      return;
    }
    this.comboEl.style.display = 'block';
    this.comboEl.style.color = color;
    this.comboEl.textContent = overdrive
      ? `OVERDRIVE ×${mult} — ${combo} HITS`
      : `${combo} HITS ×${mult}`;
    this.comboEl.style.transition = 'none';
    this.comboEl.style.transform = 'translateX(-50%) scale(1.18)';
    requestAnimationFrame(() => {
      this.comboEl.style.transition = 'transform 0.18s ease-out';
      this.comboEl.style.transform = 'translateX(-50%) scale(1)';
    });
  }

  setPauseVisible(visible: boolean): void {
    this.pauseButton.style.display = visible ? 'block' : 'none';
  }

  /** The lives/score bar only belongs to in-game states, not menu screens. */
  setBarVisible(visible: boolean): void {
    this.bar.style.display = visible ? 'flex' : 'none';
  }

  /** Quick scale punch on the score — driven by impact presets. */
  punchScore(strength: number): void {
    const scale = 1 + Math.min(0.5, strength * 0.35);
    this.scoreEl.style.transition = 'transform 0.08s ease-out';
    this.scoreEl.style.transform = `scale(${scale})`;
    window.setTimeout(() => {
      this.scoreEl.style.transition = 'transform 0.25s ease-in';
      this.scoreEl.style.transform = 'scale(1)';
    }, 90);
  }

  /** Animates the lost life breaking away, then settles on `remaining`. */
  breakLife(remaining: number): void {
    this.setLives(remaining + 1);
    const dot = this.livesEl.lastElementChild as HTMLElement | null;
    if (!dot) return;
    dot.style.transition = 'transform 0.45s ease-out, opacity 0.45s ease-out, filter 0.45s';
    requestAnimationFrame(() => {
      dot.style.transform = 'scale(2) translateY(6px)';
      dot.style.opacity = '0';
      dot.style.filter = 'hue-rotate(-70deg) saturate(2)'; // yellow → hot red
    });
    window.setTimeout(() => this.setLives(remaining), 480);
  }

  setScore(n: number): void {
    this.scoreEl.textContent = String(n);
  }

  setMessage(text: string | null): void {
    this.messageEl.textContent = text ?? '';
    this.messageEl.style.display = text ? 'block' : 'none';
  }

  // ── Single-slot announcement flash ────────────────────────────────────
  // One reusable element + a one-deep queue: rapid events (combo tier,
  // powerup, wave, level) play one after another instead of stacking
  // translucent text on the same screen spot.
  private flashEl: HTMLDivElement | null = null;
  private flashBusy = false;
  private flashExiting = false;
  private flashShownAt = 0;
  private flashNext: { text: string; color: string } | null = null;
  private flashHoldTimer = 0;
  private flashEndTimer = 0;

  /** Big centred announcement — queued, never overlapping a previous one. */
  powerupFlash(text: string, color: string): void {
    if (this.flashBusy) {
      // Newest message wins the single waiting slot; repeats are dropped.
      if (this.flashEl?.textContent !== text) this.flashNext = { text, color };
      // Fast-forward the current message out (after a minimum read time)
      // so the chain stays snappy without ever double-printing.
      if (!this.flashExiting) {
        const shown = performance.now() - this.flashShownAt;
        window.clearTimeout(this.flashHoldTimer);
        this.flashHoldTimer = window.setTimeout(
          () => this.beginFlashExit(),
          Math.max(0, 320 - shown)
        );
      }
      return;
    }
    this.showFlash(text, color);
  }

  private showFlash(text: string, color: string): void {
    this.flashBusy = true;
    this.flashExiting = false;
    this.flashShownAt = performance.now();
    if (!this.flashEl) {
      this.flashEl = document.createElement('div');
      this.root.appendChild(this.flashEl);
    }
    const el = this.flashEl;
    el.textContent = text;
    el.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:40%',
      'transform:translate(-50%,-50%) scale(0.6)',
      `color:${color}`,
      'font-size:clamp(28px, 6vw, 46px)',
      'font-weight:700',
      'letter-spacing:0.35em',
      `text-shadow:0 0 26px ${color}, 0 2px 12px rgba(0,0,0,0.7)`,
      'opacity:0',
      'transition:none',
      'pointer-events:none',
      'white-space:nowrap',
    ].join(';');
    requestAnimationFrame(() => {
      el.style.transition = 'all 0.18s ease-out';
      el.style.opacity = '1';
      el.style.transform = 'translate(-50%,-50%) scale(1.12)';
    });
    window.clearTimeout(this.flashHoldTimer);
    window.clearTimeout(this.flashEndTimer);
    this.flashHoldTimer = window.setTimeout(() => this.beginFlashExit(), 700);
  }

  private beginFlashExit(): void {
    const el = this.flashEl;
    if (!el || this.flashExiting) return;
    this.flashExiting = true;
    el.style.transition = 'all 0.3s ease-in';
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%,-50%) scale(1.3)';
    this.flashEndTimer = window.setTimeout(() => {
      this.flashBusy = false;
      this.flashExiting = false;
      const next = this.flashNext;
      this.flashNext = null;
      if (next) this.showFlash(next.text, next.color);
    }, 300);
  }

  private activePops = 0;

  /** Floating score text at a screen position, drifting up and fading.
   * Budgeted — rapid kill chains must not churn the DOM into jank. */
  scorePop(x: number, y: number, text: string): void {
    if (this.activePops >= 7) return; // the score counter still updates
    this.activePops += 1;
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = [
      'position:absolute',
      `left:${x}px`,
      `top:${y}px`,
      'transform:translate(-50%,-50%)',
      'color:#ffe94a',
      'font-size:clamp(15px, 2.4vw, 22px)',
      'font-weight:700',
      'letter-spacing:0.08em',
      'text-shadow:0 2px 10px rgba(0,0,0,0.65)',
      'transition:transform 0.55s ease-out, opacity 0.55s ease-out',
      'opacity:1',
      'pointer-events:none',
    ].join(';');
    this.root.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = 'translate(-50%,-170%)';
      el.style.opacity = '0';
    });
    window.setTimeout(() => {
      el.remove();
      this.activePops -= 1;
    }, 600);
  }

  dispose(): void {
    this.root.remove();
  }
}
