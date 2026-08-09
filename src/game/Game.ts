import * as THREE from 'three';
import type { AudioFx } from '../audio/AudioFx';
import type { VisualConfig } from '../config/visual.config';
import type { BiomeName } from '../environment/EnvironmentDirector';
import type { BallTrail } from '../effects/BallTrail';
import type { GameFeelManager } from '../effects/GameFeel';
import type { Vfx } from '../effects/Vfx';
import type { Hud } from '../ui/Hud';
import type { Screens } from '../ui/Screens';
import type { BallVisual } from './Ball';
import { BOSS_SCALE, BRICK_TYPES } from './BrickType';
import { ComboManager } from './Combo';
import { DifficultyDirector } from './Difficulty';
import type { BrickState } from './Bricks';
import type { GameObjects } from './GameObjects';
import type { Input } from './Input';
import type { LevelDirector } from './LevelDirector';
import { paddleTopY } from './Paddle';
import { stepBall, type BallBody, type PhysicsEnv } from './Physics';
import type { PowerupManager, PowerupType } from './Powerups';
import { SpectacleDirector, type SpectacleTargets } from './Spectacle';

const FIXED_STEP = 1 / 120;
const DEATH_DURATION = 0.16;
const COUNTDOWN_TICK = 0.8;

type GameState =
  | 'intro'
  | 'bonuses'
  | 'countdown'
  | 'playing'
  | 'lifeLost'
  | 'levelClear'
  | 'paused'
  | 'gameOver'
  | 'win';

interface DyingBrick {
  brick: BrickState;
  t: number;
}

interface PendingKill {
  brick: BrickState;
  delay: number;
  /** true = cuts through remaining armour (explosions/SMASH); false = a plain hit. */
  pierce: boolean;
}

/** One live ball: physics body + its visual root (and trail). */
interface BallUnit {
  body: BallBody;
  visual: BallVisual;
  trail: BallTrail | null;
  extra: boolean; // spawned at runtime by MULTIBALL
}

const POWERUP_LABELS: Record<PowerupType, string> = {
  RACKET_XL: 'RACKET XL',
  MULTIBALL: 'MULTIBALL',
  HEAVY_BALL: 'HEAVY BALL',
  DEFENSIVE_WALL: 'DEFENSIVE WALL',
  SMASH: 'SMASH',
  POWER_SHOT: 'POWER SHOT',
};

/**
 * Fixed-timestep arcade loop plus the full UI state flow:
 * intro → bonuses → countdown (3-2-1, auto-serve) → playing → lifeLost →
 * countdown … → results. `silent` mode (screenshot harness) skips the
 * overlay screens and serves on click, like the pre-UI builds.
 */
export class Game {
  private state: GameState = 'intro';
  private lives: number;
  private score = 0;
  private accumulator = 0;
  private stateTimer = 0;
  private countdownValue = -1;
  private countdownTimer = 0;
  private paddleX = 0;
  private paddleZ: number;
  private paddleVx = 0;
  private paddleVz = 0;
  private dashTime = 0;
  private dashCooldown = 0;
  private dashVx = 0;
  private dashVz = 0;
  private dying: DyingBrick[] = [];
  private pendingKills: PendingKill[] = [];
  private units: BallUnit[] = [];
  private heavyT = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly impactPos = new THREE.Vector3();
  private readonly flashColor = new THREE.Color();
  readonly combo: ComboManager;
  readonly difficulty = new DifficultyDirector();
  private readonly spectacle = new SpectacleDirector();
  private spectacleTargets: SpectacleTargets = { weather: 0.35, music: 0.35, visual: 0.35 };
  /** Set by Experience — the world performs its signature clear reaction. */
  onLevelSignature: (() => void) | null = null;
  /** Seconds actually spent in the 'playing' state this level — the CLEAR
   * TIME stat must not count menus, countdowns, pauses, or cinematics. */
  private playSeconds = 0;
  private livesLostThisLevel = 0;
  /** A settings/map overlay is open — global keys must not resume play. */
  private overlayOpen = false;
  /** Attract mode — the menu plays itself behind the screens. */
  private demo = false;
  private demoAccumulator = 0;
  private clearLabelShown = false;
  private clearSignatureFired = false;
  /** Set by Experience — biome/weather swap on level change. */
  onLevelChanged: ((level: number) => void) | null = null;
  /** Set by Experience — e.g. force a lightning strike on overdrive. */
  onOverdrive: (() => void) | null = null;
  /** Set by Experience — applies a changed player setting. */
  onSettingChanged: ((key: string, value: string | number) => void) | null = null;
  /** Set by Experience — locks the arena biome (null returns to auto cycle). */
  onMapSelected: ((biome: BiomeName | null) => void) | null = null;
  private selectedMap: string | null = null;
  /** Set by Experience — opens the relocated dev tools (dev builds only). */
  onOpenDevTools: (() => void) | null = null;
  private stunTimer = 0;
  /** Fired when the rival actually swings / is hit / falls — visuals only. */
  onBossStrike: (() => void) | null = null;
  onBossHit: (() => void) | null = null;
  onBossDefeated: (() => void) | null = null;
  private bossAttackMode: 'idle' | 'telegraph' = 'idle';
  private bossAttackTimer = 6;
  private bossAttackZ = 0;
  private lastBossPhase = 1;

  constructor(
    private cfg: VisualConfig,
    private objects: GameObjects,
    private input: Input,
    private hud: Hud,
    private vfx: Vfx,
    private powerups: PowerupManager,
    private screens: Screens,
    private audio: AudioFx,
    private feel: GameFeelManager,
    private levels: LevelDirector,
    private silent: boolean,
    private rebuildObjects: () => void
  ) {
    this.lives = cfg.game.rules.lives;
    this.paddleZ = cfg.game.paddle.z;
    this.combo = new ComboManager(cfg);
    input.onPrimary = this.onPrimary;
    input.onDash = (): void => this.dash();
    hud.onPause = (): void => this.togglePause();
    hud.setLevel(this.levels.level);
    this.difficulty.onLevelStart(objects.brickField?.aliveCount() ?? 1);
    this.spectacleTargets = this.spectacle.targetsForLevel(this.levels.level);
    this.syncHud();
    if (silent) {
      this.startCountdown();
    } else {
      this.enterIntro();
    }
  }

  /** 0..1 red-arena factor for the heavy-ball state; Experience applies it. */
  get heavyTint(): number {
    return this.heavyT;
  }

  /**
   * 0..1 music intensity from gameplay state — combo heat, multiball,
   * level depth, and overdrive push it up; menus and losses pull it down.
   */
  get musicIntensity(): number {
    switch (this.state) {
      case 'intro':
      case 'bonuses':
        // Attract mode: the menu grooves — drums and bass already in.
        return 0.45;
      case 'gameOver':
      case 'win':
        return 0.18;
      case 'paused':
        return 0.08;
      case 'lifeLost':
        return 0.15;
      case 'levelClear':
        return 0.5;
      case 'countdown':
        return 0.25;
      case 'playing': {
        let intensity =
          0.42 +
          this.spectacleTargets.music * 0.15 +
          this.combo.energy * 0.5 +
          this.difficulty.tension * 0.1 +
          (this.units.length > 1 ? 0.1 : 0) +
          Math.min(0.12, (this.levels.level - 1) * 0.03);
        if (this.combo.overdriveActive) intensity += 0.15;
        if (this.powerups.isHeavy) intensity += 0.08;
        if (this.bossAlive()) intensity += 0.15;
        return Math.min(1, intensity);
      }
    }
  }

  /** 0..1 tension wave for weather/VFX intensity. */
  get tension(): number {
    return this.state === 'playing' ? this.difficulty.tension : 0.2;
  }

  /** Per-level spectacle baseline for the weather system. */
  get spectacleWeather(): number {
    return this.spectacleTargets.weather;
  }

  /**
   * Everything the rival's body needs to perform the fight. Null when no
   * boss is on the court. Read-only — the character must never feed back
   * into gameplay.
   */
  bossVisualState(): {
    x: number;
    z: number;
    phase: number;
    health01: number;
    windingUp: boolean;
  } | null {
    const boss = this.objects.brickStates.find((b) => b.type === 'BOSS' && b.alive);
    if (!boss) return null;
    return {
      x: boss.x,
      z: boss.z,
      phase: boss.health > 16 ? 1 : boss.health > 8 ? 2 : 3,
      health01: Math.max(0, Math.min(1, boss.health / 24)),
      windingUp: this.bossAttackMode === 'telegraph',
    };
  }

  private bossAlive(): boolean {
    return this.objects.brickStates.some((b) => b.type === 'BOSS' && b.alive);
  }

  // ── Lightning gameplay (Phase 27) ─────────────────────────────────────

  /** Valid strike targets — only live, tangible bricks during play. */
  lightningTargets(): BrickState[] {
    if (this.state !== 'playing') return [];
    return this.objects.brickStates.filter((b) => b.alive && !b.intangible);
  }

  /** ~14×/s during the telegraph: crackle + flicker the marked brick. */
  lightningTelegraphTick(brick: BrickState): void {
    this.impactPos.set(brick.x, 0.5, brick.z);
    this.vfx.telegraphSpark(this.impactPos);
    const mesh = this.objects.brickField?.meshFor(brick.type);
    if (mesh) {
      const hot = Math.random() > 0.5;
      this.flashColor.setRGB(hot ? 1.9 : 0.8, hot ? 1.9 : 0.9, hot ? 2.4 : 1.3);
      mesh.setColorAt(brick.meshIndex, this.flashColor);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** The bolt lands: direct damage + radial splash, full impact stack. */
  lightningStrikeAt(brick: BrickState): void {
    if (this.state !== 'playing' || !brick.alive) return;
    const cfgL = this.cfg.game.lightning;
    const field = this.objects.brickField;
    if (!field) return;

    this.impactPos.set(brick.x, 0.4, brick.z);
    this.vfx.lightningImpact(this.impactPos);
    this.feel.impact('HEAVY');

    // Direct target: boss takes controlled damage, armour may survive.
    if (brick.type === 'BOSS') {
      brick.health = Math.max(1, brick.health - 1); // + the hit below = 2
      this.applyBrickHit(brick, false);
    } else {
      brick.health = Math.max(1, brick.health - (cfgL.directDamage - 1));
      this.applyBrickHit(brick, false);
    }

    // Radial splash — never half the level.
    const splashed = this.objects.brickStates.filter(
      (other) =>
        other.alive &&
        other !== brick &&
        Math.hypot(other.x - brick.x, other.z - brick.z) <= cfgL.strikeRadius
    );
    splashed.forEach((victim, i) => {
      if (this.pendingKills.some((k) => k.brick === victim)) return;
      for (let d = 1; d < cfgL.splashDamage; d++) victim.health = Math.max(1, victim.health - 1);
      this.pendingKills.push({ brick: victim, delay: 0.05 + i * 0.04, pierce: false });
    });
  }

  private enterIntro(): void {
    this.setState('intro');
    this.demo = true; // attract mode runs behind every menu screen
    this.screens.showIntro(
      () => {
        this.audio.unlock();
        this.audio.click();
        this.enterBonuses();
      },
      () => this.openSettings(() => this.enterIntro()),
      {
        label: this.screens.mapName(this.selectedMap),
        open: (): void => this.openMapSelect(() => this.enterIntro()),
      }
    );
  }

  /** Arena picker; picking applies the world immediately as a live preview. */
  private openMapSelect(onBack: () => void): void {
    this.audio.click();
    this.overlayOpen = true;
    this.screens.showMapSelect({
      current: this.selectedMap,
      onPick: (key): void => {
        this.audio.powerup();
        this.overlayOpen = false;
        this.selectedMap = key;
        this.onMapSelected?.(key as BiomeName | null);
        onBack();
      },
      onBack: (): void => {
        this.audio.click();
        this.overlayOpen = false;
        onBack();
      },
    });
  }

  /** Settings overlay; `onBack` restores whichever screen invoked it. */
  private openSettings(onBack: () => void): void {
    this.audio.click();
    this.overlayOpen = true;
    const cfg = this.cfg;
    this.screens.showSettings({
      values: {
        musicVolume: cfg.audioSettings.musicVolume,
        sfxVolume: cfg.audioSettings.sfxVolume,
        screenShake: cfg.accessibility.screenShake,
        bloom: cfg.bloom.strength,
        rainQuality: cfg.weatherFx.quality,
        graphics: cfg.graphics.mode,
      },
      onChange: (key, value): void => this.onSettingChanged?.(key, value),
      onBack: (): void => {
        this.audio.click();
        this.overlayOpen = false;
        onBack();
      },
      onOpenDevTools: this.onOpenDevTools,
    });
  }

  private enterBonuses(): void {
    this.setState('bonuses');
    this.screens.showBonuses(() => {
      this.audio.unlock();
      this.audio.click();
      this.startCountdown();
    });
  }

  private startCountdown(): void {
    // Leaving attract mode: clear the demo ball and restore a pristine field.
    if (this.demo) {
      this.stopDemo();
      this.dying = [];
      this.objects.rebuildBricks();
      this.difficulty.onLevelStart(this.objects.brickField?.aliveCount() ?? 1);
    }
    this.screens.hideAll();
    // A boss telegraph must never survive into a fresh serve un-telegraphed.
    this.bossAttackMode = 'idle';
    this.bossAttackTimer = Math.max(4, this.bossAttackTimer);
    this.setState('countdown');
    if (this.silent) {
      this.countdownValue = -1; // waits for a click instead of ticking
    } else {
      this.countdownValue = 3;
      this.countdownTimer = 0;
      this.screens.setCountdown(3);
    }
  }

  private onPrimary = (): void => {
    if (this.overlayOpen) return; // Space inside settings must not resume
    if (this.state === 'countdown' && this.silent) {
      this.serve();
    } else if (this.state === 'paused') {
      this.resume();
    } else if (this.silent && (this.state === 'gameOver' || this.state === 'win')) {
      this.restart(this.state === 'win');
    }
  };

  togglePause(): void {
    if (this.overlayOpen) return; // Escape/p inside settings must not resume
    if (this.state === 'playing') {
      this.audio.click();
      this.setState('paused');
      this.showPauseScreen();
    } else if (this.state === 'paused') {
      this.resume();
    }
  }

  /** One wiring for the pause screen — settings BACK returns here intact. */
  private showPauseScreen(): void {
    this.screens.showPause(
      () => this.resume(),
      () => this.openSettings(() => this.showPauseScreen()),
      () => this.returnToMenu()
    );
  }

  /** Abandon the run and return to the intro menu, fully reset. */
  private returnToMenu(): void {
    this.audio.click();
    this.setState('intro'); // before the rebuild so no countdown auto-starts
    this.levels.setLevel(1);
    this.lives = this.cfg.game.rules.lives;
    this.score = 0;
    this.onLevelChanged?.(this.levels.level); // restore the level-1 arena
    this.rebuildObjects();
    this.handleRebuild();
    this.hud.setLevel(this.levels.level);
    this.enterIntro();
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.audio.click();
    this.screens.hideAll();
    this.setState('playing');
  }

  private serve(): void {
    const visual = this.objects.ballVisual;
    if (!visual) return;
    const physics = this.cfg.game.physics;
    const angle = (Math.random() * 2 - 1) * THREE.MathUtils.degToRad(18);
    // Dynamic difficulty nudges the serve speed (never mid-rally).
    const serveSpeed = Math.min(
      physics.maxSpeed,
      physics.baseSpeed * this.difficulty.speedFactor
    );
    visual.root.visible = true;
    visual.dissolve = 0;
    this.screens.setCountdown(null);
    this.audio.serve();
    this.units = [
      {
        body: {
          x: this.paddleX,
          z: this.paddleZ - this.cfg.game.paddle.depth / 2 - this.cfg.game.ball.radius,
          vx: Math.sin(angle) * serveSpeed,
          vz: -Math.cos(angle) * serveSpeed,
          speed: serveSpeed,
        },
        visual,
        trail: this.objects.trail,
        extra: false,
      },
    ];
    this.setState('playing');
  }

  private spawnMultiball(): void {
    if (this.state !== 'playing' || this.units.length === 0) return;
    const source = this.units[0];
    for (let i = 0; i < this.cfg.game.powerups.multiballCount; i++) {
      const made = this.objects.createExtraBall();
      if (!made) break;
      const rot = (i === 0 ? 1 : -1) * 0.45;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      this.units.push({
        body: {
          x: source.body.x,
          z: source.body.z,
          vx: source.body.vx * cos - source.body.vz * sin,
          vz: source.body.vx * sin + source.body.vz * cos,
          speed: source.body.speed,
        },
        visual: made.visual,
        trail: made.trail,
        extra: true,
      });
    }
  }

  /** `advance` = level cleared → next level, keeping score and lives. */
  private restart(advance: boolean): void {
    this.audio.unlock();
    this.audio.click();
    if (advance) {
      this.levels.setLevel(this.levels.level + 1);
    } else {
      this.levels.setLevel(1);
      this.lives = this.cfg.game.rules.lives;
      this.score = 0;
    }
    this.onLevelChanged?.(this.levels.level);
    this.rebuildObjects();
    this.handleRebuild();
    this.hud.setLevel(this.levels.level);
    this.hud.powerupFlash(`LEVEL ${this.levels.level}`, '#e8e04a');
    this.startCountdown();
  }

  /** All bricks in the current wave are gone. */
  private onFieldCleared(): void {
    if (this.levels.advanceWave()) {
      // The new field gets fresh InstancedMeshes — any in-flight death
      // animations reference the old field and must never touch the new one.
      this.dying = [];
      this.pendingKills = [];
      this.objects.rebuildBricks();
      this.difficulty.onLevelStart(this.objects.brickField?.aliveCount() ?? 1);
      this.hud.powerupFlash(`WAVE ${this.levels.wave}`, '#8ecfff');
      this.audio.powerup();
    } else {
      this.endGame(true);
    }
  }

  /**
   * The single wave/level completion check. Called after every brick death
   * AND after stale pending kills are discarded — a queued kill whose
   * target already died must never permanently block completion.
   */
  private checkFieldCleared(): void {
    if (this.state !== 'playing') return;
    const field = this.objects.brickField;
    if (field && field.aliveCount() <= 0 && this.pendingKills.length === 0) {
      this.onFieldCleared();
    }
  }

  private endGame(won: boolean): void {
    if (this.state === 'win' || this.state === 'gameOver' || this.state === 'levelClear') return;
    if (won && this.state === 'lifeLost') return; // death outranks a chain-clear
    if (won) {
      // ── Level-clear sequence (Phase 34): a staged dopamine timeline. ──
      // t=0      hitstop + boom + music cut
      // t≈0.35s  kinetic LEVEL COMPLETE slam
      // t≈1.1s   the world's signature reaction
      // t≈2.2s   results screen with stats + score burst
      this.feel.impact(this.levels.isBossLevel() ? 'BOSS' : 'CRITICAL');
      this.feel.slowmo(0.25);
      this.audio.duck(0.8); // the music cuts out — silence sells the boom
      this.audio.win();
      this.setState('levelClear');
      this.clearLabelShown = false;
      this.clearSignatureFired = false;
      for (const unit of this.units) unit.visual.pulse(1.5); // balls glow up
      return;
    }
    this.setState('gameOver');
    this.audio.gameOver();
    if (!this.silent) {
      this.screens.showResults(
        'GAME OVER',
        this.score,
        () => this.restart(false),
        'REPLAY',
        [],
        () => this.returnToMenu()
      );
    }
  }

  /** levelClear cinematic finished — show the animated results screen. */
  private finishLevelClear(): void {
    this.setState('win');
    const clearSeconds = this.playSeconds;
    const noMiss = this.livesLostThisLevel === 0;
    if (noMiss) this.score += 500;
    const stats: { label: string; value: string }[] = [
      { label: 'CLEAR TIME', value: `${clearSeconds.toFixed(1)}s` },
    ];
    if (this.combo.highestCombo > 1) {
      stats.push({ label: 'MAX COMBO', value: `×${this.combo.highestCombo}` });
    }
    if (noMiss) stats.push({ label: 'NO-MISS BONUS', value: '+500' });
    if (!this.silent) {
      this.screens.showResults(
        `LEVEL ${this.levels.level} CLEAR`,
        this.score,
        () => this.restart(true),
        'NEXT LEVEL',
        stats,
        () => this.returnToMenu()
      );
    }
  }

  // ── Attract mode ──────────────────────────────────────────────────────
  // A self-playing rally behind the menu screens: real physics and brick
  // destruction VFX, but no score, combo, power-ups, feel impulses, or
  // life loss — the menu must feel alive, not noisy.

  private stopDemo(): void {
    if (!this.demo) return;
    this.demo = false;
    this.demoAccumulator = 0;
    for (const unit of this.units) {
      if (unit.extra) this.objects.removeExtraBall(unit.visual, unit.trail);
    }
    this.units = [];
    const visual = this.objects.ballVisual;
    if (visual) visual.root.visible = false;
  }

  private updateDemo(dt: number): void {
    const cfg = this.cfg;
    const physics = cfg.game.physics;
    const visual = this.objects.ballVisual;
    const field = this.objects.brickField;
    if (!visual || !field) return;

    // The demo cleared the field — quietly deal a fresh one.
    if (field.aliveCount() === 0) {
      this.dying = [];
      this.objects.rebuildBricks();
    }

    if (this.units.length === 0) {
      const angle = (Math.random() * 2 - 1) * 0.45;
      const speed = physics.baseSpeed * 0.85;
      visual.root.visible = true;
      visual.dissolve = 0;
      this.units = [
        {
          body: {
            x: this.paddleX,
            z: this.paddleZ - cfg.game.paddle.depth / 2 - cfg.game.ball.radius,
            vx: Math.sin(angle) * speed,
            vz: -Math.cos(angle) * speed,
            speed,
          },
          visual,
          trail: this.objects.trail,
          extra: false,
        },
      ];
    }

    const ball = this.units[0];
    // Perfect lazy chase — the demo never loses a ball.
    this.paddleX += (ball.body.x - this.paddleX) * (1 - Math.exp(-6 * dt));
    const halfW = cfg.game.paddle.width / 2;
    const maxX = cfg.walls.innerX - halfW - 0.1;
    this.paddleX = Math.max(-maxX, Math.min(maxX, this.paddleX));

    const rearWallZ = -cfg.court.length / 2 + 0.15 + cfg.rear.blockD;
    const radius = cfg.game.ball.radius;
    const env: PhysicsEnv = {
      radius,
      minX: -(cfg.walls.innerX - radius),
      maxX: cfg.walls.innerX - radius,
      minZ: rearWallZ + radius,
      lossZ: physics.lossZ,
      paddle: {
        x: this.paddleX,
        z: this.paddleZ,
        halfW,
        halfD: cfg.game.paddle.depth / 2,
        vx: 0,
        vz: 0,
      },
      maxSpeed: physics.baseSpeed,
      bricks: this.objects.brickStates,
      maxBounceAngle: THREE.MathUtils.degToRad(physics.maxBounceAngleDeg),
      minForwardRatio: physics.minForwardRatio,
      pierceBricks: false,
      shieldZ: null,
    };

    this.demoAccumulator = Math.min(this.demoAccumulator + dt, 0.2);
    while (this.demoAccumulator >= FIXED_STEP) {
      this.demoAccumulator -= FIXED_STEP;
      const events = stepBall(ball.body, FIXED_STEP, env);
      if (events.hitBrick) {
        const result = field.hit(events.hitBrick);
        if (result.destroyed) {
          this.dying.push({ brick: events.hitBrick, t: 0 });
          this.impactPos.set(events.hitBrick.x, 0.5, events.hitBrick.z);
          const points = Math.round(
            cfg.game.rules.brickScore * BRICK_TYPES[events.hitBrick.type].scoreMult
          );
          this.vfx.brickImpact(this.impactPos, `+${points}`, false, 0.2);
          this.audio.brick(false);
          visual.pulse(0.8);
        }
      } else if (events.hitPaddle) {
        this.audio.paddle();
        visual.pulse(0.5);
      }
      if (events.lost) {
        // A demo ball simply comes back for another rally.
        ball.body.x = this.paddleX;
        ball.body.z = this.paddleZ - 1;
        ball.body.vx = (Math.random() - 0.5) * 2;
        ball.body.vz = -Math.abs(ball.body.vz || physics.baseSpeed * 0.8);
      }
    }
  }

  /** Called whenever GameObjects is rebuilt (GUI tweaks, restart). */
  handleRebuild(): void {
    this.dying = [];
    this.pendingKills = [];
    this.units = []; // extras were children of the rebuilt group
    this.feel.reset();
    this.powerups.reset();
    this.combo.reset();
    this.hud.setCombo(0, 1, '#f3efe2', false);
    this.difficulty.onLevelStart(this.objects.brickField?.aliveCount() ?? 1);
    this.spectacleTargets = this.spectacle.targetsForLevel(this.levels.level);
    this.playSeconds = 0;
    this.livesLostThisLevel = 0;
    this.stunTimer = 0;
    this.bossAttackMode = 'idle';
    this.bossAttackTimer = 6;
    this.lastBossPhase = 1;
    if (this.state === 'playing' || this.state === 'paused') {
      this.screens.hideAll();
      this.startCountdown();
    }
    this.syncHud();
  }

  private setState(state: GameState): void {
    this.state = state;
    this.stateTimer = 0;
    this.syncHud();
  }

  private syncHud(): void {
    this.hud.setLives(this.lives);
    this.hud.setScore(this.score);
    this.hud.setPauseVisible(this.state === 'playing');
    this.hud.setBarVisible(
      this.state === 'countdown' ||
        this.state === 'playing' ||
        this.state === 'lifeLost' ||
        this.state === 'levelClear' ||
        this.state === 'paused'
    );
    const silentMessages: Partial<Record<GameState, string>> = {
      countdown: 'CLICK & HOLD TO MOVE — CLICK TO LAUNCH',
      gameOver: 'GAME OVER — CLICK TO RESTART',
      win: 'COURT CLEARED — CLICK TO RESTART',
    };
    this.hud.setMessage(this.silent ? (silentMessages[this.state] ?? null) : null);
  }

  update(dt: number): void {
    if (this.state === 'paused') return;
    this.stateTimer += dt;
    if (this.state === 'playing') this.playSeconds += dt;

    // Hitstop/slow-mo live in the GameFeelManager; cinematic staging
    // (stateTimer, countdowns) runs in real time.
    const gameDt = this.feel.step(dt);

    this.updatePaddle(gameDt);

    const paddle = this.objects.paddle;
    const halfW = (this.cfg.game.paddle.width / 2) * (paddle?.scale.x ?? 1);
    const caught = this.powerups.update(
      gameDt,
      { x: this.paddleX, z: this.paddleZ, halfW },
      this.state === 'playing' // capsules only catch mid-rally
    );
    for (const type of caught) this.applyPowerup(type);

    this.updatePendingKills(gameDt);
    this.objects.brickField?.update(gameDt);
    this.combo.update(gameDt);
    this.feel.sustainedBloom +=
      ((this.combo.overdriveActive ? 1 : 0) - this.feel.sustainedBloom) *
      (1 - Math.exp(-3 * dt));

    if (this.state === 'countdown' && !this.silent && this.countdownValue > 0) {
      this.countdownTimer += dt;
      if (this.countdownTimer >= COUNTDOWN_TICK) {
        this.countdownTimer -= COUNTDOWN_TICK;
        this.countdownValue -= 1;
        if (this.countdownValue <= 0) {
          this.serve();
        } else {
          this.screens.setCountdown(this.countdownValue);
        }
      }
    }

    this.stunTimer = Math.max(0, this.stunTimer - dt);
    this.updateBossAttack(gameDt);

    if (this.state === 'playing') {
      this.accumulator = Math.min(this.accumulator + gameDt, 0.25);
      while (this.accumulator >= FIXED_STEP) {
        this.stepPhysics(FIXED_STEP);
        this.accumulator -= FIXED_STEP;
        if (this.state !== 'playing') break;
      }
    } else if (this.state === 'lifeLost' && this.stateTimer > this.cfg.game.feel.lifeLostDuration) {
      if (this.lives > 0) this.startCountdown();
      else this.endGame(false);
    } else if (this.state === 'levelClear') {
      // Staged beats of the level-up sequence (see endGame).
      if (!this.clearLabelShown && this.stateTimer > 0.35) {
        this.clearLabelShown = true;
        this.hud.powerupFlash('LEVEL COMPLETE', '#ffd21e');
        this.feel.flashPulse(0.5);
        this.audio.powerup();
      }
      if (!this.clearSignatureFired && this.stateTimer > 1.1) {
        this.clearSignatureFired = true;
        this.onLevelSignature?.();
      }
      if (this.stateTimer > 2.2) this.finishLevelClear();
    }

    // Attract mode: the menu plays itself behind the screens.
    if (this.demo && (this.state === 'intro' || this.state === 'bonuses')) {
      this.updateDemo(gameDt);
    }

    // Paddle width chases the RACKET XL target — no model swap.
    if (paddle) {
      const targetScale = this.powerups.isXl ? this.cfg.game.powerups.xlScale : 1;
      const k = 1 - Math.exp(-8 * dt);
      paddle.scale.x += (targetScale - paddle.scale.x) * k;
    }

    // Heavy-ball arena state eases in and out.
    const heavyTarget = this.powerups.isHeavy ? 1 : 0;
    this.heavyT += (heavyTarget - this.heavyT) * (1 - Math.exp(-3 * dt));

    this.updateDyingBricks(gameDt);
    this.syncVisuals(dt);
  }

  private applyPowerup(type: PowerupType): void {
    this.audio.powerup();
    this.feel.impact('TINY');
    this.hud.powerupFlash(POWERUP_LABELS[type], this.cfg.game.powerups.capsuleColors[type]);
    if (type === 'MULTIBALL') this.spawnMultiball();
    else if (type === 'SMASH') this.triggerSmash();
    else this.powerups.activate(type);
  }

  /** SMASH: a light beam wipes the nearest surviving brick row. */
  private triggerSmash(): void {
    const alive = this.objects.brickStates.filter((b) => b.alive);
    if (alive.length === 0) return;
    const rowZ = Math.max(...alive.map((b) => b.z));
    const row = alive.filter((b) => Math.abs(b.z - rowZ) < 0.1).sort((a, b) => a.x - b.x);
    this.feel.impact('HEAVY');
    this.powerups.showBeam(rowZ);
    row.forEach((brick, i) => {
      if (this.pendingKills.some((k) => k.brick === brick)) return;
      this.pendingKills.push({ brick, delay: 0.06 + i * 0.035, pierce: true });
    });
  }

  private updatePendingKills(dt: number): void {
    if (this.state !== 'playing') return; // chains fizzle outside play
    if (this.pendingKills.length === 0) return;
    let discardedStale = false;
    for (const kill of [...this.pendingKills]) {
      kill.delay -= dt;
      if (kill.delay <= 0) {
        this.pendingKills.splice(this.pendingKills.indexOf(kill), 1);
        if (kill.brick.alive) {
          if (kill.pierce) kill.brick.health = 1; // chains cut through armour
          this.audio.brick(false);
          this.applyBrickHit(kill.brick, false);
        } else {
          discardedStale = true;
        }
      }
    }
    if (discardedStale) this.checkFieldCleared();
  }

  /**
   * Boss laser: a red telegraph bar flashes on the paddle's row, then the
   * beam fires — if the paddle is still in that row, it's briefly stunned.
   * Readable, avoidable, and scaling with boss phase.
   */
  private updateBossAttack(gameDt: number): void {
    if (this.state !== 'playing') return;
    const boss = this.objects.brickStates.find((b) => b.type === 'BOSS' && b.alive);
    if (!boss) {
      this.bossAttackMode = 'idle';
      return;
    }
    const phase = boss.health > 16 ? 1 : boss.health > 8 ? 2 : 3;
    if (phase !== this.lastBossPhase) {
      this.lastBossPhase = phase;
      this.feel.impact('BOSS');
      this.audio.overdrive();
      this.hud.powerupFlash(`BOSS PHASE ${phase}`, '#c04af0');
    }

    this.bossAttackTimer -= gameDt;
    if (this.bossAttackMode === 'idle' && this.bossAttackTimer <= 0) {
      this.bossAttackMode = 'telegraph';
      this.bossAttackZ = this.paddleZ;
      this.powerups.showBeam(this.bossAttackZ, '#ff3030', 0.95, 1);
      this.audio.armor(); // warning tick
      this.bossAttackTimer = 0.95;
    } else if (this.bossAttackMode === 'telegraph' && this.bossAttackTimer <= 0) {
      this.bossAttackMode = 'idle';
      this.bossAttackTimer = 9.5 - phase * 1.8;
      this.powerups.showBeam(this.bossAttackZ, '#ff5050', 0.3, 1);
      this.onBossStrike?.(); // the rival's racket comes through
      this.feel.impact('HEAVY');
      if (Math.abs(this.paddleZ - this.bossAttackZ) < 1.0) {
        this.stunTimer = 1.6;
        this.audio.zap();
        this.feel.damagePulse();
        this.hud.powerupFlash('STUNNED', '#ff8080');
      } else {
        this.audio.explosion();
      }
    }
  }

  /** Short burst toward the pointer; Shift / right-click / double-tap. */
  private dash(): void {
    if (this.state !== 'playing' && this.state !== 'countdown') return;
    if (this.dashCooldown > 0 || this.stunTimer > 0) return;
    const d = this.cfg.game.paddle.dash;
    let dx = 0;
    let dz = 0;
    if (this.input.targetX !== null && this.input.targetZ !== null) {
      dx = this.input.targetX - this.paddleX;
      dz = this.input.targetZ - this.paddleZ;
    }
    const len = Math.hypot(dx, dz);
    if (len < 0.2) {
      dx = Math.sign(this.paddleVx || 1);
      dz = 0;
    } else {
      dx /= len;
      dz /= len;
    }
    this.dashCooldown = d.cooldown;
    this.dashTime = d.duration;
    this.dashVx = dx * d.speed;
    this.dashVz = dz * d.speed;
    this.feel.impact('TINY');
    this.audio.dash();
    this.impactPos.set(this.paddleX, 0.4, this.paddleZ);
    this.vfx.dashBurst(this.impactPos);
  }

  private updatePaddle(dt: number): void {
    const paddle = this.objects.paddle;
    if (!paddle) return;
    const pcfg = this.cfg.game.paddle;
    const halfW = (pcfg.width / 2) * paddle.scale.x;
    const limitX = this.cfg.walls.innerX - halfW - 0.15;
    const prevX = this.paddleX;
    const prevZ = this.paddleZ;

    const followRate =
      this.cfg.game.physics.paddleFollow * (this.stunTimer > 0 ? 0.28 : 1);
    const k = 1 - Math.exp(-followRate * dt);
    if (this.input.targetX !== null) {
      const clamped = Math.max(-limitX, Math.min(limitX, this.input.targetX));
      this.paddleX += (clamped - this.paddleX) * k;
    }
    if (this.input.targetZ !== null) {
      const clamped = Math.max(pcfg.zoneZMin, Math.min(pcfg.zoneZMax, this.input.targetZ));
      this.paddleZ += (clamped - this.paddleZ) * k;
    }

    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.paddleX = Math.max(-limitX, Math.min(limitX, this.paddleX + this.dashVx * dt));
      this.paddleZ = Math.max(
        pcfg.zoneZMin,
        Math.min(pcfg.zoneZMax, this.paddleZ + this.dashVz * dt)
      );
    }
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);

    this.paddleVx = dt > 0 ? (this.paddleX - prevX) / dt : 0;
    this.paddleVz = dt > 0 ? (this.paddleZ - prevZ) / dt : 0;
  }

  private stepPhysics(dt: number): void {
    const cfg = this.cfg;
    const physics = cfg.game.physics;
    const paddle = this.objects.paddle;
    const rearWallZ = -cfg.court.length / 2 + 0.15 + cfg.rear.blockD;
    const heavy = cfg.game.powerups.heavy;
    const isHeavy = this.powerups.isHeavy;
    const radius = cfg.game.ball.radius * THREE.MathUtils.lerp(1, heavy.radiusScale, this.heavyT);
    const ballY = paddleTopY(cfg) + cfg.game.ball.radius * 0.9;

    for (const unit of [...this.units]) {
      // A brick kill or ball loss can end the state mid-step (win/lifeLost);
      // remaining balls must not act on a state that is already over.
      if (this.state !== 'playing') break;
      const env: PhysicsEnv = {
        radius,
        minX: -(cfg.walls.innerX - radius),
        maxX: cfg.walls.innerX - radius,
        minZ: rearWallZ + radius,
        lossZ: physics.lossZ,
        paddle: {
          x: this.paddleX,
          z: this.paddleZ,
          halfW: (cfg.game.paddle.width / 2) * (paddle?.scale.x ?? 1),
          halfD: cfg.game.paddle.depth / 2,
          vx: this.paddleVx,
          vz: this.paddleVz,
        },
        maxSpeed: physics.maxSpeed,
        bricks: this.objects.brickStates,
        maxBounceAngle: THREE.MathUtils.degToRad(physics.maxBounceAngleDeg),
        minForwardRatio: physics.minForwardRatio,
        pierceBricks: isHeavy,
        shieldZ: this.powerups.isShieldActive ? cfg.game.powerups.shieldZ : null,
      };

      const events = stepBall(unit.body, dt, env);
      const fx = unit.visual;

      if (events.hitBrick) {
        const destroyed = this.applyBrickHit(events.hitBrick, isHeavy);
        fx.pulse(destroyed ? (isHeavy ? 1.4 : 1.0) : 0.4);
        if (destroyed) {
          this.feel.impact(isHeavy ? 'HEAVY' : 'NORMAL');
          this.audio.brick(isHeavy);
        }
      } else if (events.hitPaddle) {
        if (this.powerups.consumePowerShot()) {
          unit.body.speed = physics.maxSpeed * 1.15;
          fx.pulse(1.5);
          this.feel.impact('HEAVY');
          this.audio.powerShot();
        } else {
          fx.pulse(0.6);
          this.feel.impact('TINY');
          this.audio.paddle();
        }
        this.impactPos.set(unit.body.x, ballY, this.paddleZ - cfg.game.paddle.depth / 2);
        this.vfx.paddleImpact(this.impactPos);
      } else if (events.hitShield) {
        fx.pulse(0.8);
        this.feel.impact('TINY');
        this.audio.shield();
        this.impactPos.set(unit.body.x, ballY, cfg.game.powerups.shieldZ);
        this.vfx.paddleImpact(this.impactPos);
      } else if (events.hitWall) {
        fx.pulse(0.35);
        this.feel.impact('TINY');
        this.audio.wall();
        this.impactPos.set(unit.body.x, ballY, unit.body.z);
        this.vfx.wallImpact(this.impactPos);
      }

      if (events.lost) this.loseBall(unit);
    }
  }

  private loseBall(unit: BallUnit): void {
    if (this.state !== 'playing') return;
    const index = this.units.indexOf(unit);
    if (index === -1) return;
    this.units.splice(index, 1);
    this.combo.onBallLost();
    this.difficulty.onBallLost();
    this.hud.setCombo(0, 1, '#f3efe2', false);
    const lostX = unit.body.x;
    const lostZ = Math.min(unit.body.z, this.cfg.game.physics.lossZ);
    if (unit.extra) {
      this.objects.removeExtraBall(unit.visual, unit.trail);
    } else {
      unit.visual.root.visible = false;
      unit.trail?.update(0, unit.visual.root.position, 0, false);
    }

    if (this.units.length === 0) {
      // ── Life-lost cinematic ─────────────────────────────────────────
      this.lives -= 1;
      this.livesLostThisLevel += 1;
      this.pendingKills = []; // in-flight chains fizzle with the ball
      this.feel.impact('CRITICAL');
      this.feel.damagePulse();

      // The cinematic ball: park the primary visual at the loss point and
      // let it dissolve there (its trail is already collapsed).
      const visual = this.objects.ballVisual;
      if (visual) {
        visual.root.visible = true;
        visual.root.position.set(
          lostX,
          paddleTopY(this.cfg) + this.cfg.game.ball.radius * 0.9,
          lostZ
        );
        visual.dissolve = 0;
      }

      this.impactPos.set(lostX, 0.5, lostZ);
      this.vfx.lifeLostCinematic(this.impactPos);
      this.audio.lifeLostImpact();
      this.audio.duck(1.0);
      this.audio.lifeLost();
      this.setState('lifeLost');
      this.hud.breakLife(this.lives);
      this.hud.powerupFlash('LIFE LOST', '#ff5a4a');
    }
  }

  /**
   * A ball or beam hit lands on a brick. Armour may soak it; a destroyed
   * EXPLOSIVE chains to its neighbours. Returns true if the brick died.
   */
  private applyBrickHit(brick: BrickState, heavy: boolean): boolean {
    const field = this.objects.brickField;
    if (!field) return false;
    if (heavy) {
      // Heavy balls smash through armour — but only chip the boss faster.
      if (brick.type === 'BOSS') brick.health = Math.max(1, brick.health - 1);
      else brick.health = 1;
    }
    const result = field.hit(brick);
    if (brick.type === 'BOSS') {
      if (result.destroyed) this.onBossDefeated?.();
      else this.onBossHit?.();
    }
    if (!result.destroyed) {
      this.audio.armor();
      this.feel.impact('TINY');
      this.impactPos.set(brick.x, 0.4, brick.z);
      this.vfx.paddleImpact(this.impactPos); // small metallic sparks
      return false;
    }
    this.destroyBrick(brick, result.neighbors, heavy);
    return true;
  }

  private destroyBrick(brick: BrickState, neighbors: BrickState[], heavy: boolean): void {
    const def = BRICK_TYPES[brick.type];

    // Combo: multiplier is read BEFORE this hit's tier changes apply.
    const events = this.combo.registerHit();
    const tiers = this.cfg.game.combo.tiers;
    if (events.overdriveEntered) {
      this.feel.slowmo(0.35);
      this.feel.impact('HEAVY');
      this.audio.overdrive();
      this.hud.powerupFlash('OVERDRIVE', '#ffd21e');
      this.onOverdrive?.();
    } else if (events.tierEntered && events.tierIndex >= 0) {
      const tier = tiers[events.tierIndex];
      this.audio.comboTier(events.tierIndex);
      this.hud.powerupFlash(`${tier.name} ×${tier.mult}`, tier.color);
    }
    const comboColor = this.combo.overdriveActive
      ? '#ffd21e'
      : events.tierIndex >= 0
        ? tiers[events.tierIndex].color
        : '#f3efe2';
    this.hud.setCombo(
      this.combo.combo,
      this.combo.multiplier,
      comboColor,
      this.combo.overdriveActive
    );

    const points = Math.round(
      this.cfg.game.rules.brickScore * def.scoreMult * this.combo.multiplier
    );
    this.score += points;
    for (const unit of this.units) {
      unit.body.speed = Math.min(
        this.cfg.game.physics.maxSpeed,
        unit.body.speed + this.cfg.game.physics.speedUpPerBrick
      );
    }
    this.dying.push({ brick, t: 0 });
    if (brick.type === 'POWERUP') this.powerups.maybeDrop(brick.x, brick.z, true);
    else this.powerups.maybeDrop(brick.x, brick.z, false, this.difficulty.dropChanceScale);
    this.hud.setScore(this.score);
    this.difficulty.onBrickDestroyed(
      this.objects.brickField?.aliveCount() ?? 0,
      this.combo.combo
    );

    const explosive = brick.type === 'EXPLOSIVE';
    this.impactPos.set(brick.x, 0.4, brick.z);
    // Combo heat drives burst energy; the level's spectacle target raises
    // the floor so climax levels feel bigger even at low combo.
    const burstEnergy = Math.min(1, this.combo.energy + this.spectacleTargets.visual * 0.25);
    this.vfx.brickImpact(this.impactPos, `+${points}`, heavy || explosive, burstEnergy);
    if (explosive) {
      this.feel.impact('HEAVY');
      this.audio.explosion();
      neighbors.forEach((victim, i) => {
        if (this.pendingKills.some((k) => k.brick === victim)) return; // no duplicates
        this.pendingKills.push({ brick: victim, delay: 0.05 + i * 0.04, pierce: true });
      });
    }

    this.checkFieldCleared();
  }

  /** Squash + white-hot flash, then shrink away. */
  private updateDyingBricks(dt: number): void {
    const field = this.objects.brickField;
    if (!field || this.dying.length === 0) return;

    const dirty = new Set<THREE.InstancedMesh>();
    for (const entry of this.dying) {
      const mesh = field.meshFor(entry.brick.type);
      if (!mesh) continue;
      dirty.add(mesh);
      entry.t += dt;
      const progress = Math.min(1, entry.t / DEATH_DURATION);
      const squash = progress < 0.35 ? 1 + progress * 0.5 : 1;
      const shrink = progress < 0.35 ? 1 : 1 - (progress - 0.35) / 0.65;
      const isBoss = entry.brick.type === 'BOSS';
      const bx = isBoss ? BOSS_SCALE.x : 1;
      const by = isBoss ? BOSS_SCALE.y : 1;
      const bz = isBoss ? BOSS_SCALE.z : 1;
      this.dummy.position.set(entry.brick.x, 0.01, entry.brick.z);
      this.dummy.scale.set(
        bx * squash * shrink,
        Math.max(0.0001, by * shrink * 0.8),
        bz * squash * shrink
      );
      this.dummy.updateMatrix();
      mesh.setMatrixAt(entry.brick.meshIndex, this.dummy.matrix);

      const flash = Math.max(0, 1 - progress / 0.4);
      this.flashColor.setRGB(1 + 1.8 * flash, 1 + 1.8 * flash, 1 + 1.2 * flash);
      mesh.setColorAt(entry.brick.meshIndex, this.flashColor);
    }
    for (const mesh of dirty) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.dying = this.dying.filter((d) => d.t < DEATH_DURATION);
  }

  private syncVisuals(dt: number): void {
    const { paddle } = this.objects;
    const ballY = paddleTopY(this.cfg) + this.cfg.game.ball.radius * 0.9;

    if (paddle) {
      paddle.position.x = this.paddleX;
      paddle.position.z = this.paddleZ;
      // Subtle bank/pitch with movement — visual only, never physics.
      const targetBank = THREE.MathUtils.clamp(-this.paddleVx * 0.018, -0.2, 0.2);
      const targetPitch = THREE.MathUtils.clamp(this.paddleVz * 0.012, -0.14, 0.14);
      const tiltK = 1 - Math.exp(-10 * dt);
      paddle.rotation.z += (targetBank - paddle.rotation.z) * tiltK;
      paddle.rotation.x += (targetPitch - paddle.rotation.x) * tiltK;
    }

    if (this.state === 'levelClear') {
      // Balls park where they are, glowing through the cinematic.
      for (const unit of this.units) {
        unit.visual.update(dt);
        unit.trail?.update(dt, unit.visual.root.position, 0, false);
      }
      return;
    }
    if (this.state === 'playing') {
      const countFactor = 1 / Math.sqrt(Math.max(1, this.units.length));
      const energy = this.combo.energy;
      for (const unit of this.units) {
        unit.visual.root.position.set(unit.body.x, ballY, unit.body.z);
        unit.visual.heavyFactor = this.heavyT;
        unit.visual.countFactor = countFactor;
        unit.visual.energy = energy;
        unit.visual.update(dt);
        const speedRatio = Math.min(1, unit.body.speed / this.cfg.game.physics.maxSpeed);
        unit.trail?.update(
          dt,
          unit.visual.root.position,
          Math.max(0.5, speedRatio) * (1 + energy * 0.3),
          true
        );
      }
    } else {
      const ball = this.objects.ball;
      const visual = this.objects.ballVisual;
      if (ball && visual) {
        if (this.state === 'countdown' || this.state === 'intro' || this.state === 'bonuses') {
          // Respawn-in: the dissolve left over from a lost life fades away.
          visual.dissolve = Math.max(0, visual.dissolve - dt * 3);
          ball.visible = true;
          ball.position.set(this.paddleX, ballY, this.paddleZ - 0.05);
        } else if (this.state === 'lifeLost') {
          // The parked cinematic ball disintegrates in place.
          const t = Math.min(1, this.stateTimer / this.cfg.game.feel.ballDissolveTime);
          visual.dissolve = t;
          ball.visible = t < 1;
        }
        visual.heavyFactor = this.heavyT;
        visual.countFactor = 1;
        visual.update(dt);
      }
      this.objects.trail?.update(dt, ball?.position ?? this.impactPos, 0, false);
    }
  }
}
