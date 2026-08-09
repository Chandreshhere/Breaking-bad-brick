/**
 * Full-screen UI states as HTML/CSS overlays — start screen, bonus
 * explainer, countdown, pause, and results — matching the reference's
 * layout language (cream serif + yellow grotesque on deep green, pill
 * buttons, dashed bonus rings). All markup/styles are generated here; no
 * external assets.
 */

const STYLE_ID = 'acb-screens-style';

const CSS = /* css */ `
.acb-screens { position: absolute; inset: 0; z-index: 30; pointer-events: none;
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
.acb-screen { position: absolute; inset: 0; pointer-events: auto; color: #f2edda;
  background: radial-gradient(130% 150% at 30% 15%, rgba(20,55,31,0.86) 0%,
    rgba(10,34,19,0.9) 55%, rgba(5,20,8,0.94) 100%); }
.acb-screen::after { content: ""; position: absolute; inset: 0; pointer-events: none;
  opacity: 0.05; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='160' height='160' filter='url(%23n)' opacity='0.6'/></svg>"); }
.acb-wordmark { position: absolute; top: 34px; left: 42px; font-size: 15px;
  letter-spacing: 0.42em; color: #f2edda; opacity: 0.9; }
.acb-title-block { position: absolute; left: 9%; top: 26%; }
.acb-title-serif { font-family: Georgia, "Times New Roman", serif; font-style: italic;
  font-size: clamp(40px, 7vw, 96px); letter-spacing: 0.06em; color: #f2edda; line-height: 1.05; }
.acb-title-main { font-size: clamp(48px, 8.5vw, 116px); font-weight: 700;
  letter-spacing: 0.04em; color: #efd42e; line-height: 1.1; }
.acb-divider { position: absolute; left: 9%; right: 9%; top: 62%; height: 1px;
  background: rgba(242, 237, 218, 0.55); }
.acb-pill { background: #efd42e; color: #0c2717; border: none; border-radius: 999px;
  padding: 20px 48px; font-size: clamp(16px, 2vw, 24px); letter-spacing: 0.2em; font-weight: 700;
  display: inline-flex; align-items: center; gap: 14px; cursor: pointer;
  font-family: inherit; transition: transform 0.15s ease; }
.acb-pill:hover { transform: scale(1.05); }
.acb-pill svg { width: 1.15em; height: 1.15em; }
.acb-intro-cta { position: absolute; right: 12%; bottom: 16%; }
.acb-bonus-head { position: absolute; left: 9%; top: 14%; font-size: clamp(28px, 4.4vw, 56px);
  font-weight: 600; line-height: 1.2; letter-spacing: 0.02em; }
.acb-bonus-head em { font-style: normal; color: #e8f13c; }
.acb-bonus-cta { position: absolute; right: 9%; top: 16%; }
.acb-bonus-row { position: absolute; left: 7%; right: 7%; top: 46%; display: flex;
  justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.acb-bonus { display: flex; flex-direction: column; align-items: center; gap: 22px;
  min-width: 130px; }
.acb-ring { width: clamp(84px, 8.5vw, 128px); height: clamp(84px, 8.5vw, 128px);
  border: 3px dashed var(--c); border-radius: 50%; display: grid; place-items: center; }
.acb-ring svg { width: 46%; height: 46%; }
.acb-bonus-label { font-size: clamp(11px, 1.1vw, 16px); letter-spacing: 0.14em; color: #f2edda; }

/* Results banner: the near-miss line is the reason people tap REPLAY. */
.acb-banner { font-size: clamp(13px, 2.4vw, 19px); font-weight: 700; letter-spacing: 0.16em;
  padding: 9px 20px; border-radius: 999px; animation: acb-pop 0.4s 0.4s both; }
.acb-banner-best { color: #0c2717; background: #efd42e; }
.acb-banner-near { color: #ffd8a0; background: rgba(255,140,58,0.16); border: 1px solid rgba(255,140,58,0.5); }
@keyframes acb-pop { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
.acb-pill-reward { background: #2a6cff; color: #fff; }

.acb-best { position: absolute; left: 9%; bottom: 6%; font-size: clamp(11px, 2vw, 14px);
  letter-spacing: 0.22em; color: rgba(242,237,218,0.62); }
.acb-best b { color: #efd42e; font-size: 1.35em; letter-spacing: 0.08em; }

/* Coin readout + shop grid */
.acb-coins { position: absolute; top: 24px; right: 84px; font-size: clamp(13px, 2.4vw, 18px);
  font-weight: 700; letter-spacing: 0.12em; color: #efd42e; display: flex; align-items: center; gap: 8px; }
.acb-shop-wrap { position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 16px; padding: 13vh 5% 4vh; box-sizing: border-box; }
.acb-shop-tabs { display: flex; gap: 10px; }
.acb-tab { background: none; border: 1px solid rgba(242,237,218,0.35); color: #f2edda; border-radius: 999px;
  padding: 8px 20px; font: inherit; font-size: 12px; letter-spacing: 0.16em; cursor: pointer; }
.acb-tab-on { background: #f2edda; color: #0c2717; border-color: #f2edda; }
.acb-shop-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
  width: min(760px, 100%); overflow-y: auto; }
@media (max-aspect-ratio: 4/5) { .acb-shop-grid { grid-template-columns: repeat(2, 1fr); } }
.acb-item { background: rgba(0,0,0,0.35); border: 1px solid rgba(242,237,218,0.18); border-radius: 14px;
  padding: 14px 8px 12px; display: flex; flex-direction: column; align-items: center; gap: 9px;
  cursor: pointer; font: inherit; color: #f2edda; }
.acb-item-on { border-color: #efd42e; box-shadow: 0 0 0 1px #efd42e inset; }
.acb-swatch { width: 44px; height: 44px; border-radius: 50%; }
.acb-swatch-pad { width: 58px; height: 22px; border-radius: 999px; }
.acb-item-name { font-size: 11px; letter-spacing: 0.14em; }
.acb-item-price { font-size: 12px; font-weight: 700; letter-spacing: 0.1em; color: #efd42e; }
.acb-item-lock { color: #9aa8a0; }

/* Leaderboard */
.acb-lb-wrap { position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; gap: 14px; padding: 12vh 5% 4vh; box-sizing: border-box; }
.acb-lb-list { width: min(620px, 100%); overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.acb-lb-row { display: grid; grid-template-columns: 46px 1fr auto; gap: 10px; align-items: center;
  padding: 10px 14px; border-radius: 10px; background: rgba(0,0,0,0.3);
  font-size: clamp(12px, 2.6vw, 15px); letter-spacing: 0.06em; }
.acb-lb-me { background: rgba(239,212,46,0.16); border: 1px solid rgba(239,212,46,0.6); }
.acb-lb-rank { color: #efd42e; font-weight: 700; }
.acb-lb-score { color: #efd42e; font-weight: 700; }
.acb-lb-state { color: rgba(242,237,218,0.7); font-size: clamp(12px,2.6vw,15px);
  letter-spacing: 0.16em; text-align: center; padding: 30px 10px; line-height: 1.7; }
.acb-lb-sep { text-align: center; color: rgba(242,237,218,0.35); letter-spacing: 0.4em; }

/* Portrait: the absolute landscape layout collapses on a phone — the CTA
   lands on top of the heading. Stack it instead, and put the button at the
   bottom where a thumb actually reaches. */
@media (max-aspect-ratio: 4/5) {
  .acb-bonus-screen { display: flex; flex-direction: column; }
  .acb-bonus-head { position: static; margin: 9vh 7% 0; font-size: clamp(26px, 7.5vw, 44px); }
  .acb-bonus-row { position: static; margin: 5vh 7% 0; display: grid;
    grid-template-columns: 1fr 1fr; gap: 4vh 4%; justify-items: center; }
  .acb-bonus { min-width: 0; gap: 12px; }
  .acb-ring { width: clamp(64px, 19vw, 104px); height: clamp(64px, 19vw, 104px); }
  .acb-bonus-label { font-size: clamp(10px, 3vw, 14px); text-align: center; }
  .acb-bonus-cta { position: static; margin: auto 7% 0; padding-bottom: calc(4vh + env(safe-area-inset-bottom, 0px));
    display: flex; justify-content: center; }
}
.acb-center { position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 28px; text-align: center;
  /* Full-screen flex box: let empty space pass clicks to siblings (gear). */
  pointer-events: none; }
.acb-center > * { pointer-events: auto; }
.acb-results-title { font-size: clamp(40px, 6vw, 80px); font-weight: 700;
  letter-spacing: 0.12em; color: #f2edda; }
.acb-results-score { font-size: clamp(48px, 7vw, 96px); font-weight: 700; color: #efd42e; }
.acb-results-sub { font-size: 16px; letter-spacing: 0.3em; color: rgba(242,237,218,0.65); }
.acb-stats { display: flex; flex-direction: column; gap: 6px; margin: 10px 0 4px; min-width: min(320px, 70vw); }
.acb-stat-row { display: flex; justify-content: space-between; gap: 32px; font-size: 14px;
  letter-spacing: 0.22em; color: rgba(242,237,218,0.75);
  opacity: 0; transform: translateY(8px); animation: acbStatIn 0.35s ease-out forwards; }
.acb-stat-val { color: #efd42e; font-weight: 700; }
@keyframes acbStatIn { to { opacity: 1; transform: translateY(0); } }
.acb-pause { background: radial-gradient(130% 150% at 30% 15%, rgba(18,48,28,0.9) 0%,
  rgba(8,28,16,0.92) 55%, rgba(4,16,7,0.95) 100%); backdrop-filter: blur(3px); }
.acb-count { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%);
  text-align: center; pointer-events: none; z-index: 25; }
.acb-count-number { font-size: clamp(110px, 16vw, 190px); font-weight: 700; color: #efd42e;
  text-shadow: 0 4px 30px rgba(0,0,0,0.5); line-height: 1; }
.acb-count-hint { margin-top: 12px; font-size: clamp(15px, 1.8vw, 24px); letter-spacing: 0.24em;
  color: #efd42e; text-shadow: 0 2px 12px rgba(0,0,0,0.6); }
.acb-gear { position: absolute; top: 28px; right: 34px; background: none; border: none;
  color: #f2edda; font-size: 26px; cursor: pointer; opacity: 0.85; font-family: inherit; }
.acb-settings { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(520px, 88vw); display: flex; flex-direction: column; gap: 22px; }
.acb-settings h2 { font-size: clamp(28px, 4vw, 44px); letter-spacing: 0.18em; color: #f2edda;
  font-weight: 700; margin: 0 0 8px; }
.acb-set-row { display: flex; align-items: center; justify-content: space-between; gap: 18px;
  font-size: 15px; letter-spacing: 0.16em; color: #f2edda; }
.acb-set-row input[type=range] { flex: 1; max-width: 260px; accent-color: #efd42e; }
.acb-set-row select { background: #0c2717; color: #f2edda; border: 1px solid #efd42e55;
  padding: 6px 10px; letter-spacing: 0.1em; font-family: inherit; }
.acb-set-dev { margin-top: 10px; opacity: 0.8; }
.acb-pill-ghost { background: transparent; color: #efd42e; border: 1.5px solid #efd42e88;
  padding: 14px 30px; font-size: clamp(12px, 1.3vw, 16px); margin-top: 14px; }
.acb-pill-ghost:hover { border-color: #efd42e; }
.acb-intro-cta { display: flex; flex-direction: column; align-items: flex-end; }
.acb-maps-wrap { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(860px, 92vw); display: flex; flex-direction: column; gap: 26px; align-items: center; }
.acb-maps-wrap h2 { font-size: clamp(28px, 4vw, 44px); letter-spacing: 0.18em; color: #f2edda;
  font-weight: 700; margin: 0; }
.acb-maps { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px; width: 100%; }
.acb-map-card { background: rgba(0,0,0,0.35); border: 1.5px solid color-mix(in srgb, var(--c) 45%, transparent);
  border-radius: 14px; padding: 18px 16px; display: flex; flex-direction: column; gap: 8px;
  cursor: pointer; font-family: inherit; text-align: left; transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease; }
.acb-map-card:hover { transform: translateY(-3px); border-color: var(--c);
  box-shadow: 0 0 22px color-mix(in srgb, var(--c) 35%, transparent); }
.acb-map-selected { border-color: var(--c); box-shadow: 0 0 18px color-mix(in srgb, var(--c) 45%, transparent);
  background: color-mix(in srgb, var(--c) 12%, rgba(0,0,0,0.35)); }
.acb-map-name { color: var(--c); font-size: clamp(15px, 1.6vw, 20px); font-weight: 700;
  letter-spacing: 0.14em; }
.acb-map-sub { color: rgba(242,237,218,0.6); font-size: clamp(10px, 1vw, 13px);
  letter-spacing: 0.2em; }
.acb-version { position: absolute; left: 26px; bottom: 20px; font-size: 11px;
  letter-spacing: 0.22em; color: rgba(242,237,218,0.45); pointer-events: none; }

/* Portrait results: the title used to collide with the wordmark, and with a
   banner, stats and three buttons the column overflowed off-screen. Scroll
   it, pad it clear of the wordmark, and shrink the headline. */
@media (max-aspect-ratio: 4/5) {
  .acb-center { justify-content: flex-start; gap: 14px; overflow-y: auto;
    padding: 12vh 6% calc(4vh + env(safe-area-inset-bottom, 0px)); box-sizing: border-box; }
  .acb-results-title { font-size: clamp(28px, 9vw, 46px); }
  .acb-results-score { font-size: clamp(44px, 15vw, 74px); }
  .acb-stats { min-width: min(320px, 86vw); }
}

`;

/** Menu arena catalogue — key null is the automatic 3-level cycle. */
const MAPS: Array<{ key: string | null; name: string; sub: string; color: string }> = [
  { key: null, name: 'AUTO CYCLE', sub: 'A NEW ARENA EVERY 3 LEVELS', color: '#efd42e' },
  { key: 'CLAY', name: 'CLAY COURT', sub: 'NIGHT SESSION', color: '#d98a4f' },
  { key: 'NEON', name: 'NEON NIGHT', sub: 'ELECTRIC RALLY', color: '#4fc3ff' },
  { key: 'HELL', name: 'INFERNO', sub: 'EMBERS & ASH', color: '#ff5a3a' },
  { key: 'LOTUS_OS', name: 'LOTUS//OS', sub: 'HOLOGRAPHIC COURT', color: '#35e0ff' },
  { key: 'NEON_ARCADE', name: 'NEON ARCADE', sub: 'INSERT COIN', color: '#ffd21e' },
  { key: 'COMIC_IMPACT', name: 'COMIC IMPACT', sub: 'BAM! POW! SMASH!', color: '#ff3ad8' },
];

const COIN_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><circle cx="12" cy="12" r="9" fill="#efd42e"/><circle cx="12" cy="12" r="5.6" fill="none" stroke="#0c2717" stroke-width="1.6"/></svg>`;

const BALL_SVG = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#0c2717"/><path d="M4 6 C10 10 10 14 4 18 M20 6 C14 10 14 14 20 18" stroke="#efd42e" stroke-width="1.8" fill="none"/></svg>`;

const ICONS: Record<string, string> = {
  DEFENSIVE_WALL: `<svg viewBox="0 0 24 24" fill="#f2edda"><path d="M12 2 L20 5.5 V12 C20 17 16.5 20.8 12 22 C7.5 20.8 4 17 4 12 V5.5 Z"/></svg>`,
  MULTIBALL: `<svg viewBox="0 0 24 24" fill="#f2edda"><circle cx="8" cy="8" r="3.4"/><circle cx="16.5" cy="11" r="2.6"/><circle cx="10.5" cy="16.5" r="3"/></svg>`,
  SMASH: `<svg viewBox="0 0 24 24" fill="#f2edda"><path d="M13 2 L5 13 H11 L9 22 L19 9 H13 Z"/></svg>`,
  HEAVY_BALL: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.6" fill="#f2edda"/><circle cx="12" cy="12" r="8.6" stroke="#f2edda" stroke-width="1.6" stroke-dasharray="3 3.4" fill="none"/></svg>`,
  RACKET_XL: `<svg viewBox="0 0 24 24" fill="none" stroke="#f2edda" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12 H20 M8 8 L4 12 L8 16 M16 8 L20 12 L16 16"/></svg>`,
  POWER_SHOT: `<svg viewBox="0 0 24 24" fill="#f2edda"><circle cx="12" cy="8" r="4.4"/><path d="M8.5 14 C9 18 10 20.5 12 23 C14 20.5 15 18 15.5 14 C14.4 15.2 13.3 15.8 12 15.8 C10.7 15.8 9.6 15.2 8.5 14 Z"/></svg>`,
};

const BONUSES: Array<{ key: string; label: string; color: string }> = [
  { key: 'DEFENSIVE_WALL', label: 'DEFENSIVE WALL', color: '#4aa3ff' },
  { key: 'MULTIBALL', label: 'MULTIBALL', color: '#ff8c3a' },
  { key: 'SMASH', label: 'SMASH', color: '#7dff6a' },
  { key: 'HEAVY_BALL', label: 'HEAVY BALL', color: '#ff5fd2' },
  { key: 'RACKET_XL', label: 'RACKET XL', color: '#b06aff' },
  { key: 'POWER_SHOT', label: 'POWER SHOT', color: '#ff6a6a' },
];

export class Screens {
  private readonly root: HTMLDivElement;
  private readonly countdownEl: HTMLDivElement;
  private current: HTMLDivElement | null = null;

  constructor(container: HTMLElement) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = document.createElement('div');
    this.root.className = 'acb-screens';
    this.countdownEl = document.createElement('div');
    this.countdownEl.className = 'acb-count';
    this.countdownEl.style.display = 'none';
    this.root.appendChild(this.countdownEl);
    container.appendChild(this.root);
  }

  /** App version from /version.json — stamped onto every menu screen. */
  private version: string | null = null;

  setVersion(version: string): void {
    this.version = version;
    if (this.current && !this.current.querySelector('.acb-version')) {
      this.current.insertAdjacentHTML('beforeend', `<div class="acb-version">v${version}</div>`);
    }
  }

  private show(el: HTMLDivElement): void {
    this.hideAll();
    if (this.version) {
      el.insertAdjacentHTML('beforeend', `<div class="acb-version">v${this.version}</div>`);
    }
    this.root.appendChild(el);
    this.current = el;
  }

  hideAll(): void {
    this.current?.remove();
    this.current = null;
  }

  showIntro(
    onPlay: () => void,
    onSettings?: () => void,
    arena?: { label: string; open: () => void },
    extras: {
      best?: number;
      coins?: number;
      onShop?: () => void;
      onLeaderboard?: () => void;
    } = {}
  ): void {
    const el = document.createElement('div');
    el.className = 'acb-screen';
    el.innerHTML = `
      <div class="acb-wordmark">BREAKING BAD BRICK</div>
      <button class="acb-gear" data-action="settings" title="Settings">⚙</button>
      <div class="acb-title-block">
        <div class="acb-title-serif">${arena && arena.label !== 'AUTO CYCLE' ? arena.label : 'CLAY COURT'}</div>
        <div class="acb-title-main">BREAKING BAD BRICK</div>
      </div>
      <div class="acb-divider"></div>
      ${
        extras.coins !== undefined
          ? `<div class="acb-coins">${COIN_SVG}${extras.coins}</div>`
          : ''
      }
      ${
        extras.best
          ? `<div class="acb-best">BEST <b>${extras.best}</b></div>`
          : ''
      }
      <div class="acb-intro-cta">
        <button class="acb-pill" data-action="play">${BALL_SVG}PLAY</button>
        ${arena ? `<button class="acb-pill acb-pill-ghost" data-action="arena">ARENA: ${arena.label}</button>` : ''}
        ${extras.onShop ? '<button class="acb-pill acb-pill-ghost" data-action="shop">SHOP</button>' : ''}
        ${extras.onLeaderboard ? '<button class="acb-pill acb-pill-ghost" data-action="leaderboard">RANKS</button>' : ''}
      </div>`;
    el.querySelector<HTMLButtonElement>('[data-action="play"]')!.onclick = onPlay;
    const gear = el.querySelector<HTMLButtonElement>('[data-action="settings"]')!;
    if (onSettings) gear.onclick = onSettings;
    else gear.remove();
    const arenaBtn = el.querySelector<HTMLButtonElement>('[data-action="arena"]');
    if (arenaBtn && arena) arenaBtn.onclick = arena.open;
    const shopBtn = el.querySelector<HTMLButtonElement>('[data-action="shop"]');
    if (shopBtn && extras.onShop) shopBtn.onclick = extras.onShop;
    const lbBtn = el.querySelector<HTMLButtonElement>('[data-action="leaderboard"]');
    if (lbBtn && extras.onLeaderboard) lbBtn.onclick = extras.onLeaderboard;
    this.show(el);
  }

  /** Display name for a biome key (null = the automatic 3-level cycle). */
  mapName(key: string | null): string {
    return MAPS.find((m) => m.key === key)?.name ?? 'AUTO CYCLE';
  }

  /** Arena picker — one card per world; the current pick is highlighted. */
  showMapSelect(opts: {
    current: string | null;
    onPick: (key: string | null) => void;
    onBack: () => void;
  }): void {
    const el = document.createElement('div');
    el.className = 'acb-screen';
    const cards = MAPS.map(
      (m) => `
      <button class="acb-map-card${m.key === opts.current ? ' acb-map-selected' : ''}"
              style="--c:${m.color}" data-map="${m.key ?? 'AUTO'}">
        <span class="acb-map-name">${m.name}</span>
        <span class="acb-map-sub">${m.sub}</span>
      </button>`
    ).join('');
    el.innerHTML = `
      <div class="acb-wordmark">BREAKING BAD BRICK</div>
      <div class="acb-maps-wrap">
        <h2>SELECT ARENA</h2>
        <div class="acb-maps">${cards}</div>
        <button class="acb-pill" data-action="back">${BALL_SVG}BACK</button>
      </div>`;
    el.querySelectorAll<HTMLButtonElement>('[data-map]').forEach((card) => {
      card.onclick = (): void => {
        const raw = card.dataset['map']!;
        opts.onPick(raw === 'AUTO' ? null : raw);
      };
    });
    el.querySelector<HTMLButtonElement>('[data-action="back"]')!.onclick = opts.onBack;
    this.show(el);
  }

  /**
   * Player settings — volumes, shake, bloom, rain quality. The Developer
   * row (dev builds only) opens the relocated 3D scene controls; the
   * debug panel never renders during normal gameplay any more.
   */
  showSettings(opts: {
    values: {
      musicVolume: number;
      sfxVolume: number;
      screenShake: string;
      bloom: number;
      rainQuality: string;
      graphics: string;
    };
    onChange: (key: string, value: string | number) => void;
    onBack: () => void;
    onOpenDevTools: (() => void) | null;
  }): void {
    const el = document.createElement('div');
    el.className = 'acb-screen';
    const v = opts.values;
    el.innerHTML = `
      <div class="acb-wordmark">BREAKING BAD BRICK</div>
      <div class="acb-settings">
        <h2>SETTINGS</h2>
        <div class="acb-set-row"><span>MUSIC</span>
          <input type="range" min="0" max="1" step="0.05" value="${v.musicVolume}" data-key="musicVolume" /></div>
        <div class="acb-set-row"><span>SFX</span>
          <input type="range" min="0" max="1" step="0.05" value="${v.sfxVolume}" data-key="sfxVolume" /></div>
        <div class="acb-set-row"><span>SCREEN SHAKE</span>
          <select data-key="screenShake">
            ${['FULL', 'REDUCED', 'OFF'].map((o) => `<option ${o === v.screenShake ? 'selected' : ''}>${o}</option>`).join('')}
          </select></div>
        <div class="acb-set-row"><span>BLOOM</span>
          <input type="range" min="0" max="1.2" step="0.05" value="${v.bloom}" data-key="bloom" /></div>
        <div class="acb-set-row"><span>GRAPHICS</span>
          <select data-key="graphics">
            ${['AUTO', 'LOW', 'MEDIUM', 'HIGH'].map((o) => `<option ${o === v.graphics ? 'selected' : ''}>${o}</option>`).join('')}
          </select></div>
        <div class="acb-set-row"><span>RAIN QUALITY</span>
          <select data-key="rainQuality">
            ${['LOW', 'MEDIUM', 'HIGH'].map((o) => `<option ${o === v.rainQuality ? 'selected' : ''}>${o}</option>`).join('')}
          </select></div>
        ${opts.onOpenDevTools ? '<div class="acb-set-row acb-set-dev"><span>DEVELOPER</span><button class="acb-pill" style="padding:10px 22px;font-size:13px" data-action="devtools">3D SCENE CONTROLS</button></div>' : ''}
        <div><button class="acb-pill" data-action="back">${BALL_SVG}BACK</button></div>
      </div>`;
    el.querySelectorAll<HTMLInputElement>('input[data-key]').forEach((input) => {
      input.oninput = (): void => opts.onChange(input.dataset['key']!, parseFloat(input.value));
    });
    el.querySelectorAll<HTMLSelectElement>('select[data-key]').forEach((select) => {
      select.onchange = (): void => opts.onChange(select.dataset['key']!, select.value);
    });
    el.querySelector<HTMLButtonElement>('[data-action="back"]')!.onclick = opts.onBack;
    const dev = el.querySelector<HTMLButtonElement>('[data-action="devtools"]');
    if (dev && opts.onOpenDevTools) dev.onclick = opts.onOpenDevTools;
    this.show(el);
  }

  showBonuses(onStart: () => void): void {
    const items = BONUSES.map(
      (b) => `
      <div class="acb-bonus" style="--c:${b.color}">
        <div class="acb-ring">${ICONS[b.key]}</div>
        <div class="acb-bonus-label">${b.label}</div>
      </div>`
    ).join('');
    const el = document.createElement('div');
    el.className = 'acb-screen acb-bonus-screen';
    el.innerHTML = `
      <div class="acb-wordmark">BREAKING BAD BRICK</div>
      <div class="acb-bonus-head">6 BONUSES<br /><em>TO BOOST YOUR GAME</em></div>
      <div class="acb-bonus-row">${items}</div>
      <div class="acb-bonus-cta">
        <button class="acb-pill" data-action="start">${BALL_SVG}START GAME</button>
      </div>`;
    el.querySelector<HTMLButtonElement>('[data-action="start"]')!.onclick = onStart;
    this.show(el);
  }

  showResults(
    title: string,
    score: number,
    onReplay: () => void,
    buttonLabel = 'REPLAY',
    stats: { label: string; value: string }[] = [],
    onMainMenu?: () => void,
    extras: {
      /** "NEW BEST" or the near-miss line — the strongest retry hook. */
      banner?: { text: string; tone: 'best' | 'near' };
      /** Rewarded-ad continue. Omitted when no ad is available. */
      onContinue?: () => void;
      continueLabel?: string;
    } = {}
  ): void {
    const el = document.createElement('div');
    el.className = 'acb-screen';
    // Stat rows cascade in one after another — each is its own reward beat.
    const statLines = stats
      .map(
        (s, i) =>
          `<div class="acb-stat-row" style="animation-delay:${0.55 + i * 0.18}s">` +
          `<span>${s.label}</span><span class="acb-stat-val">${s.value}</span></div>`
      )
      .join('');
    el.innerHTML = `
      <div class="acb-wordmark">BREAKING BAD BRICK</div>
      <div class="acb-center">
        <div class="acb-results-title">${title}</div>
        <div class="acb-results-sub">SCORE</div>
        <div class="acb-results-score">0</div>
        ${
          extras.banner
            ? `<div class="acb-banner acb-banner-${extras.banner.tone}">${extras.banner.text}</div>`
            : ''
        }
        ${statLines ? `<div class="acb-stats">${statLines}</div>` : ''}
        ${
          extras.onContinue
            ? `<button class="acb-pill acb-pill-reward" data-action="continue">▶ ${
                extras.continueLabel ?? 'WATCH AD TO CONTINUE'
              }</button>`
            : ''
        }
        <button class="acb-pill" data-action="replay">${BALL_SVG}${buttonLabel}</button>
        ${onMainMenu ? '<button class="acb-pill acb-pill-ghost" data-action="menu">MAIN MENU</button>' : ''}
      </div>`;
    el.querySelector<HTMLButtonElement>('[data-action="replay"]')!.onclick = onReplay;
    const cont = el.querySelector<HTMLButtonElement>('[data-action="continue"]');
    if (cont && extras.onContinue) cont.onclick = extras.onContinue;
    const menu = el.querySelector<HTMLButtonElement>('[data-action="menu"]');
    if (menu && onMainMenu) menu.onclick = onMainMenu;
    this.show(el);

    // Score counts up rapidly — the payoff moment.
    const scoreEl = el.querySelector<HTMLDivElement>('.acb-results-score')!;
    const start = performance.now();
    const duration = 900;
    const count = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      scoreEl.textContent = String(Math.round(score * eased));
      if (t < 1 && scoreEl.isConnected) requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
  }


  /**
   * Shop. Items are cosmetic only — nothing here changes physics or scoring,
   * so buying is never pay-to-win. Owned items equip on tap; unowned ones
   * buy and equip in one tap when affordable.
   */
  showShop(opts: {
    coins: number;
    tab: 'ball' | 'paddle';
    items: Array<{
      id: string;
      name: string;
      price: number;
      owned: boolean;
      equipped: boolean;
      swatch: string;
      swatch2: string;
    }>;
    onTab: (tab: 'ball' | 'paddle') => void;
    onPick: (id: string) => void;
    onBack: () => void;
  }): void {
    const el = document.createElement('div');
    el.className = 'acb-screen';
    const cards = opts.items
      .map((it) => {
        const swatch =
          opts.tab === 'ball'
            ? `<span class="acb-swatch" style="background:radial-gradient(circle at 34% 30%, ${it.swatch} 0%, ${it.swatch2} 70%)"></span>`
            : `<span class="acb-swatch-pad" style="background:${it.swatch};border:2px solid ${it.swatch2}"></span>`;
        const state = it.equipped
          ? '<span class="acb-item-price">EQUIPPED</span>'
          : it.owned
            ? '<span class="acb-item-price">TAP TO USE</span>'
            : `<span class="acb-item-price ${opts.coins >= it.price ? '' : 'acb-item-lock'}">${it.price}</span>`;
        return `<button class="acb-item${it.equipped ? ' acb-item-on' : ''}" data-id="${it.id}">
            ${swatch}
            <span class="acb-item-name">${it.name}</span>
            ${state}
          </button>`;
      })
      .join('');
    el.innerHTML = `
      <div class="acb-wordmark">BREAKING BAD BRICK</div>
      <div class="acb-coins">${COIN_SVG}${opts.coins}</div>
      <div class="acb-shop-wrap">
        <h2 style="margin:0;letter-spacing:0.2em;font-size:clamp(18px,4vw,26px)">SHOP</h2>
        <div class="acb-shop-tabs">
          <button class="acb-tab${opts.tab === 'ball' ? ' acb-tab-on' : ''}" data-tab="ball">BALLS</button>
          <button class="acb-tab${opts.tab === 'paddle' ? ' acb-tab-on' : ''}" data-tab="paddle">PADDLES</button>
        </div>
        <div class="acb-shop-grid">${cards}</div>
        <button class="acb-pill" data-action="back">${BALL_SVG}BACK</button>
      </div>`;
    el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
      b.onclick = (): void => opts.onTab(b.dataset['tab'] as 'ball' | 'paddle');
    });
    el.querySelectorAll<HTMLButtonElement>('[data-id]').forEach((b) => {
      b.onclick = (): void => opts.onPick(b.dataset['id']!);
    });
    el.querySelector<HTMLButtonElement>('[data-action="back"]')!.onclick = opts.onBack;
    this.show(el);
  }


  /**
   * Leaderboard. Three states, because it is fed by the network: loading,
   * loaded and unavailable. `me` is rendered even when the player is far
   * below the visible page — "where am I" is the question that makes a board
   * motivating, and a top-25 list alone cannot answer it.
   */
  showLeaderboard(opts: {
    tab: 'global_alltime' | 'weekly';
    state: 'loading' | 'ready' | 'offline';
    rows: Array<{ rank: number; displayName: string; score: number; levelReached: number; isMe: boolean }>;
    me: { rank: number; score: number } | null;
    total: number;
    onTab: (tab: 'global_alltime' | 'weekly') => void;
    onBack: () => void;
  }): void {
    const el = document.createElement('div');
    el.className = 'acb-screen';

    let body: string;
    if (opts.state === 'loading') {
      body = '<div class="acb-lb-state">LOADING…</div>';
    } else if (opts.state === 'offline') {
      body =
        '<div class="acb-lb-state">LEADERBOARD UNAVAILABLE<br>' +
        '<span style="opacity:0.6;font-size:0.85em">YOUR SCORES ARE SAFE AND WILL RANK LATER</span></div>';
    } else if (opts.rows.length === 0) {
      body = '<div class="acb-lb-state">NO RANKED SCORES YET<br>' +
        '<span style="opacity:0.6;font-size:0.85em">FINISH A RUN TO CLAIM FIRST PLACE</span></div>';
    } else {
      const row = (r: { rank: number; displayName: string; score: number; levelReached: number; isMe: boolean }): string =>
        `<div class="acb-lb-row${r.isMe ? ' acb-lb-me' : ''}">
           <span class="acb-lb-rank">#${r.rank}</span>
           <span>${r.displayName}${r.isMe ? ' (YOU)' : ''}</span>
           <span class="acb-lb-score">${r.score}</span>
         </div>`;
      const onPage = opts.rows.some((r) => r.isMe);
      const mine =
        !onPage && opts.me
          ? '<div class="acb-lb-sep">· · ·</div>' +
            row({ rank: opts.me.rank, displayName: 'YOU', score: opts.me.score, levelReached: 0, isMe: true })
          : '';
      body = `<div class="acb-lb-list">${opts.rows.map(row).join('')}${mine}</div>`;
    }

    el.innerHTML = `
      <div class="acb-wordmark">BREAKING BAD BRICK</div>
      <div class="acb-lb-wrap">
        <h2 style="margin:0;letter-spacing:0.2em;font-size:clamp(18px,4vw,26px)">LEADERBOARD</h2>
        <div class="acb-shop-tabs">
          <button class="acb-tab${opts.tab === 'global_alltime' ? ' acb-tab-on' : ''}" data-tab="global_alltime">ALL TIME</button>
          <button class="acb-tab${opts.tab === 'weekly' ? ' acb-tab-on' : ''}" data-tab="weekly">THIS WEEK</button>
        </div>
        ${body}
        <button class="acb-pill" data-action="back">${BALL_SVG}BACK</button>
      </div>`;
    el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
      b.onclick = (): void => opts.onTab(b.dataset['tab'] as 'global_alltime' | 'weekly');
    });
    el.querySelector<HTMLButtonElement>('[data-action="back"]')!.onclick = opts.onBack;
    this.show(el);
  }

  showPause(onResume: () => void, onSettings?: () => void, onMainMenu?: () => void): void {
    const el = document.createElement('div');
    el.className = 'acb-screen acb-pause';
    el.innerHTML = `
      <div class="acb-wordmark">BREAKING BAD BRICK</div>
      ${onSettings ? '<button class="acb-gear" data-action="settings" title="Settings">⚙</button>' : ''}
      <div class="acb-center">
        <div class="acb-results-title">PAUSED</div>
        <button class="acb-pill" data-action="resume">${BALL_SVG}RESUME</button>
        ${onMainMenu ? '<button class="acb-pill acb-pill-ghost" data-action="menu">MAIN MENU</button>' : ''}
      </div>`;
    el.querySelector<HTMLButtonElement>('[data-action="resume"]')!.onclick = onResume;
    const gear = el.querySelector<HTMLButtonElement>('[data-action="settings"]');
    if (gear && onSettings) gear.onclick = onSettings;
    const menu = el.querySelector<HTMLButtonElement>('[data-action="menu"]');
    if (menu && onMainMenu) menu.onclick = onMainMenu;
    this.show(el);
  }

  setCountdown(value: number | null, hint = 'CLICK & HOLD TO MOVE'): void {
    if (value === null) {
      this.countdownEl.style.display = 'none';
      return;
    }
    this.countdownEl.style.display = 'block';
    this.countdownEl.innerHTML = `
      <div class="acb-count-number">${value}</div>
      <div class="acb-count-hint">${hint}</div>`;
  }

  dispose(): void {
    this.root.remove();
  }
}
