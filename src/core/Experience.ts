import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AudioFx } from '../audio/AudioFx';
import { MusicEngine } from '../audio/Music';
import {
  VISUAL_CONFIG,
  type CameraStateName,
  type VisualConfig,
} from '../config/visual.config';
import { GameFeelManager } from '../effects/GameFeel';
import { LightningDirector } from '../effects/LightningDirector';
import { PostProcessing } from '../effects/PostProcessing';
import { Vfx } from '../effects/Vfx';
import { WeatherManager } from '../effects/Weather';
import { WetSurfaceController } from '../effects/WetSurfaceController';
import { EnvironmentDirector } from '../environment/EnvironmentDirector';
import { disposeSubtree } from '../environment/materials';
import { Stadium } from '../environment/Stadium';
import { Game } from '../game/Game';
import { GameObjects } from '../game/GameObjects';
import { Input } from '../game/Input';
import { LevelDirector } from '../game/LevelDirector';
import { PowerupManager } from '../game/Powerups';
import { Hud } from '../ui/Hud';
import { Screens } from '../ui/Screens';
import { CameraRig } from './CameraRig';
import { createDebugGui } from './DebugGui';
import {
  AdaptiveQuality,
  detectInitialTier,
  QUALITY_TIERS,
  type GraphicsMode,
  type QualityTier,
} from './Quality';
import { LightingDirector, type LightingState } from './Lighting';

/** Dev hotkey ('l') cycles these — every state must stay readable. */
const LIGHT_DEBUG_STATES: Array<{ name: string; state: LightingState }> = [
  { name: 'LIGHT: NORMAL', state: { heavy: 0, weather: 0 } },
  { name: 'LIGHT: DARK', state: { heavy: 0, weather: 1 } },
  { name: 'LIGHT: STORM', state: { heavy: 0, weather: 0.8 } },
  { name: 'LIGHT: HEAVY BALL', state: { heavy: 1, weather: 0 } },
  { name: 'LIGHT: STORM+HEAVY', state: { heavy: 1, weather: 0.8 } },
];

const TONE_MAPPINGS = {
  ACES: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
  Neutral: THREE.NeutralToneMapping,
} as const;

export class Experience {
  readonly cfg: VisualConfig = VISUAL_CONFIG;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly lighting: LightingDirector;
  private lightDebugIndex = -1;
  readonly stadium: Stadium;
  readonly levels: LevelDirector;
  readonly game: GameObjects;
  post: PostProcessing; // reassigned by quality-tier changes
  readonly input: Input;
  readonly hud: Hud;
  readonly screens: Screens;
  readonly vfx: Vfx;
  readonly powerups: PowerupManager;
  readonly audio = new AudioFx();
  readonly music = new MusicEngine(this.audio);
  readonly feel: GameFeelManager;
  readonly env: EnvironmentDirector;
  readonly weather: WeatherManager;
  readonly lightning: LightningDirector;
  readonly wetSurface = new WetSurfaceController();
  readonly loop: Game;
  private weatherBase = 0;
  private smoothedDarkening = 0;
  /** The one debug GUI instance — shared by ?debug=1 and Settings→Developer. */
  private debugGui: ReturnType<typeof createDebugGui> | null = null;
  private graphicsMode: GraphicsMode = 'AUTO';
  private qualityTier: QualityTier = 'HIGH';
  /** Frame-time watchdog — only active in AUTO mode; only steps DOWN. */
  private adaptive: AdaptiveQuality | null = null;
  private readonly clock = new THREE.Clock();
  private readonly shakeQuat = new THREE.Quaternion();
  private controls: OrbitControls | null = null;
  private ready = false;

  constructor(private container: HTMLElement) {
    const params = new URLSearchParams(location.search);
    const isShot = params.get('shot') === '1';
    const camParam = params.get('cam');
    if (camParam === 'intro' || camParam === 'gameplay') {
      this.cfg.camera.state = camParam;
    }

    // Graphics tier: persisted choice or device detection. AUTO also steps
    // itself down at runtime when the measured frame rate stays low — the
    // fill-rate knobs (pixel ratio, MSAA, bloom resolution, shadows) are
    // what kill small/integrated GPUs.
    const savedSettings = this.loadSettings();
    this.graphicsMode = this.cfg.graphics.mode;
    this.qualityTier = this.graphicsMode === 'AUTO' ? detectInitialTier() : this.graphicsMode;
    const caps = QUALITY_TIERS[this.qualityTier];
    this.cfg.performance.particleScale = caps.particleScale;

    // No canvas MSAA — anti-aliasing comes from the composer's multisampled
    // render target; a multisampled default framebuffer would be dead weight.
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, caps.pixelRatioCap));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = caps.shadowMapSize > 0;
    this.renderer.shadowMap.type = caps.softShadows
      ? THREE.PCFSoftShadowMap
      : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.cfg.lighting.exposure;
    this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    container.appendChild(this.renderer.domElement);

    this.rig = new CameraRig(this.cfg, container.clientWidth / container.clientHeight);
    this.applyEnvironment();
    this.lighting = new LightingDirector(this.scene, this.cfg, caps.shadowMapSize || 1024);
    this.lighting.setShadowMapSize(caps.shadowMapSize);
    this.env = new EnvironmentDirector(this.cfg); // captures the CLAY base
    this.stadium = new Stadium(this.scene, this.cfg);
    this.stadium.build();
    this.levels = new LevelDirector(this.cfg);
    this.game = new GameObjects(this.scene, this.cfg, this.levels);
    this.game.build();
    this.post = new PostProcessing(this.renderer, this.scene, this.rig.camera, this.cfg, {
      msaaSamples: caps.msaaSamples,
      bloomScale: caps.bloomScale,
    });

    container.style.position = 'relative';
    this.hud = new Hud(container);
    this.screens = new Screens(container);
    this.input = new Input(this.renderer.domElement, this.rig);
    this.vfx = new Vfx(
      this.cfg,
      this.rig,
      this.renderer.domElement,
      this.hud,
      this.renderer.getPixelRatio()
    );
    this.scene.add(this.vfx.group);
    this.powerups = new PowerupManager(this.cfg);
    this.scene.add(this.powerups.group);
    this.feel = new GameFeelManager(
      this.cfg,
      this.rig,
      this.post,
      this.hud,
      this.audio,
      this.vfx.shake
    );
    this.weather = new WeatherManager(this.audio);
    // The tier picks the rain density unless the player explicitly saved one.
    if (savedSettings['rainQuality'] === undefined) {
      this.cfg.weatherFx.quality = caps.rainQuality;
    }
    this.weather.setQuality(this.cfg.weatherFx.quality);
    this.scene.add(this.weather.group);
    this.lightning = new LightningDirector(this.cfg, this.feel, this.audio);
    this.scene.add(this.lightning.group);
    this.weather.onStrikeRequested = (force): void => this.lightning.requestStrike(force);
    this.wetSurface.attach(this.stadium.clayMaterial);
    this.loop = new Game(
      this.cfg,
      this.game,
      this.input,
      this.hud,
      this.vfx,
      this.powerups,
      this.screens,
      this.audio,
      this.feel,
      this.levels,
      isShot,
      () => this.game.build()
    );

    this.lightning.hooks = {
      getTargets: (): ReturnType<Game['lightningTargets']> => this.loop.lightningTargets(),
      telegraphTick: (brick): void => this.loop.lightningTelegraphTick(brick),
      strike: (brick): void => this.loop.lightningStrikeAt(brick),
    };

    // Level changes drive biome + weather swaps.
    const applyLevelEnvironment = (level: number): void => {
      const biome = this.env.biomeForLevel(level);
      if (this.env.apply(biome)) {
        this.stadium.build();
        this.wetSurface.attach(this.stadium.clayMaterial); // fresh clay material
        this.applyEnvironment();
        this.applyLighting();
        this.feel.flashPulse(0.6); // staged transition: white flash into the new world
      }
      const weather = this.env.spec(biome).weather;
      this.weatherBase = weather.intensity;
      this.weather.setMode(weather.mode, weather.intensity);
      this.vfx.comicMode = this.cfg.worldKind === 'COMIC';
    };
    this.loop.onLevelChanged = applyLevelEnvironment;

    // Arena picked from the menu: lock (or unlock) the biome and swap the
    // world immediately — the intro screen shows it as a live preview.
    this.loop.onMapSelected = (biome): void => {
      this.env.forcedBiome = biome;
      applyLevelEnvironment(this.levels.level);
    };
    this.loop.onOverdrive = (): void => this.weather.forceStrike();

    // Phase 34: the world itself celebrates a level clear — each world in
    // its own voice, always on the same beat of the sequence.
    this.loop.onLevelSignature = (): void => {
      this.feel.flashPulse(0.5);
      switch (this.cfg.worldKind) {
        case 'LOTUS':
          // Data surge: electric arcs crackle over the court.
          this.vfx.lightningImpact(new THREE.Vector3(0, 1.6, -4));
          break;
        case 'ARCADE':
          // Attract-mode flash: the whole cabinet wall pops.
          this.feel.impact('HEAVY');
          break;
        case 'COMIC':
          // Full-panel word slam.
          this.vfx.comicBurst(new THREE.Vector3(0, 2.2, -4));
          this.feel.impact('HEAVY');
          break;
        default:
          // Stadium biomes: real background lightning when storming.
          this.weather.forceStrike();
          this.feel.impact('HEAVY');
      }
    };

    // Player settings application.
    this.loop.onSettingChanged = (key, value): void => {
      if (key === 'musicVolume') {
        this.cfg.audioSettings.musicVolume = value as number;
        this.music.setVolume(value as number);
      } else if (key === 'sfxVolume') {
        this.cfg.audioSettings.sfxVolume = value as number;
        this.audio.setSfxVolume(value as number);
      } else if (key === 'screenShake') {
        this.cfg.accessibility.screenShake = value as 'FULL' | 'REDUCED' | 'OFF';
      } else if (key === 'bloom') {
        this.cfg.bloom.strength = value as number;
      } else if (key === 'rainQuality') {
        this.cfg.weatherFx.quality = value as 'LOW' | 'MEDIUM' | 'HIGH';
        this.weather.setQuality(this.cfg.weatherFx.quality);
      } else if (key === 'graphics') {
        const mode = value as GraphicsMode;
        this.cfg.graphics.mode = mode;
        this.graphicsMode = mode;
        if (mode === 'AUTO') {
          const tier = detectInitialTier();
          this.adaptive = new AdaptiveQuality(tier, (t): void => this.applyQuality(t));
          this.applyQuality(tier);
        } else {
          this.adaptive = null;
          this.applyQuality(mode);
        }
      }
      this.saveSetting(key, value);
    };
    if (import.meta.env.DEV) {
      this.loop.onOpenDevTools = (): void => {
        if (!this.debugGui) this.debugGui = createDebugGui(this);
      };
    }
    this.audio.setSfxVolume(this.cfg.audioSettings.sfxVolume);
    this.music.setVolume(this.cfg.audioSettings.musicVolume);

    if (this.graphicsMode === 'AUTO') {
      this.adaptive = new AdaptiveQuality(this.qualityTier, (tier): void =>
        this.applyQuality(tier)
      );
    }

    // Browsers only allow audio after a user gesture — unlock on the first.
    window.addEventListener('pointerdown', this.unlockAudio);

    // Phase 29: the debug panel no longer renders during normal play —
    // it lives behind Settings → Developer (dev builds), or ?debug=1.
    // One shared instance: ?debug=1 + Settings→Developer must not stack two.
    if (!isShot && params.get('debug') === '1') this.debugGui = createDebugGui(this);

    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    this.renderer.setAnimationLoop(this.tick);
  }

  applyEnvironment(): void {
    this.scene.background = new THREE.Color(this.cfg.fog.background);
    this.scene.fog = new THREE.Fog(this.cfg.fog.color, this.cfg.fog.near, this.cfg.fog.far);
  }

  applyLighting(): void {
    this.lighting.applyConfig(this.cfg);
    // MIN_EXPOSURE floor — no system may push exposure below readability.
    this.renderer.toneMappingExposure = Math.max(
      this.cfg.lighting.exposure,
      this.cfg.lighting.floors.minExposure
    );
    this.renderer.toneMapping = TONE_MAPPINGS[this.cfg.lighting.toneMapping];
  }

  rebuildStadium(): void {
    this.stadium.build();
    // The clay material is recreated by every build — re-attach or the
    // wet-surface controller keeps driving the disposed one.
    this.wetSurface.attach(this.stadium.clayMaterial);
  }

  /** Re-applies every quality knob for a tier. Rare (setting change or one
   * AUTO step-down), so rebuilding the composer outright is fine. */
  private applyQuality(tier: QualityTier): void {
    this.qualityTier = tier;
    const caps = QUALITY_TIERS[tier];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, caps.pixelRatioCap));
    this.renderer.shadowMap.enabled = caps.shadowMapSize > 0;
    this.renderer.shadowMap.type = caps.softShadows
      ? THREE.PCFSoftShadowMap
      : THREE.PCFShadowMap;
    this.lighting.setShadowMapSize(caps.shadowMapSize);
    // Shadow-map toggles only take effect once materials recompile.
    this.scene.traverse((obj) => {
      const material = (obj as THREE.Mesh).material as
        | THREE.Material
        | THREE.Material[]
        | undefined;
      if (!material) return;
      for (const m of Array.isArray(material) ? material : [material]) m.needsUpdate = true;
    });
    // The composer captures pixel ratio and target samples at construction —
    // rebuild it, and hand the fresh instance to the feel manager.
    this.post.dispose();
    this.post = new PostProcessing(this.renderer, this.scene, this.rig.camera, this.cfg, {
      msaaSamples: caps.msaaSamples,
      bloomScale: caps.bloomScale,
    });
    this.feel.setPost(this.post);
    this.vfx.setPixelRatio(this.renderer.getPixelRatio());
    this.cfg.performance.particleScale = caps.particleScale;
    this.cfg.weatherFx.quality = caps.rainQuality;
    this.weather.setQuality(caps.rainQuality);
    this.onResize();
  }

  /** Persisted player settings — applied to cfg before systems construct. */
  private loadSettings(): Record<string, unknown> {
    try {
      const raw = localStorage.getItem('acb-settings');
      if (!raw) return {};
      const s = JSON.parse(raw) as Record<string, unknown>;
      const cfg = this.cfg;
      if (typeof s['musicVolume'] === 'number') cfg.audioSettings.musicVolume = s['musicVolume'];
      if (typeof s['sfxVolume'] === 'number') cfg.audioSettings.sfxVolume = s['sfxVolume'];
      if (s['screenShake'] === 'FULL' || s['screenShake'] === 'REDUCED' || s['screenShake'] === 'OFF')
        cfg.accessibility.screenShake = s['screenShake'];
      if (typeof s['bloom'] === 'number') cfg.bloom.strength = s['bloom'];
      if (s['rainQuality'] === 'LOW' || s['rainQuality'] === 'MEDIUM' || s['rainQuality'] === 'HIGH')
        cfg.weatherFx.quality = s['rainQuality'];
      if (
        s['graphics'] === 'AUTO' ||
        s['graphics'] === 'LOW' ||
        s['graphics'] === 'MEDIUM' ||
        s['graphics'] === 'HIGH'
      )
        cfg.graphics.mode = s['graphics'];
      return s;
    } catch {
      return {}; // corrupt JSON or storage blocked — fall back to defaults
    }
  }

  private saveSetting(key: string, value: string | number): void {
    try {
      const raw = localStorage.getItem('acb-settings');
      const s = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      s[key] = value;
      localStorage.setItem('acb-settings', JSON.stringify(s));
    } catch {
      // Private mode / storage denied — settings just don't persist.
    }
  }

  rebuildGame(): void {
    this.game.build();
    this.loop.handleRebuild();
  }

  setCameraState(state: CameraStateName): void {
    // Orbit mode would fight the rig for the camera aim — leave it first.
    if (this.controls) this.toggleOrbit();
    this.cfg.camera.state = state;
    this.rig.syncFromConfig();
  }

  private onResize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.rig.setAspect(w / h);
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
  };

  private unlockAudio = (): void => {
    this.audio.unlock();
    this.music.start();
    window.removeEventListener('pointerdown', this.unlockAudio);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === '1') this.setCameraState('intro');
    else if (e.key === '2') this.setCameraState('gameplay');
    else if (e.key === 'p' || e.key === 'Escape') this.loop.togglePause();
    else if (e.key === 'm') this.audio.toggleMute();
    else if (e.key === 'l' && import.meta.env.DEV) this.cycleLightDebug();
    else if (e.key === 'o' && import.meta.env.DEV) this.toggleOrbit();
  };

  /** Dev: cycle the five lighting states; -1 returns to live lighting. */
  private cycleLightDebug(): void {
    this.lightDebugIndex += 1;
    if (this.lightDebugIndex >= LIGHT_DEBUG_STATES.length) this.lightDebugIndex = -1;
    this.hud.powerupFlash(
      this.lightDebugIndex === -1 ? 'LIGHT: LIVE' : LIGHT_DEBUG_STATES[this.lightDebugIndex].name,
      '#9fd6ff'
    );
  }

  /** Dev-only free camera for tuning; snaps back to the config state when closed. */
  private toggleOrbit(): void {
    if (!this.controls) {
      this.controls = new OrbitControls(this.rig.camera, this.renderer.domElement);
      this.controls.target.copy(this.rig.target);
    } else {
      this.controls.dispose();
      this.controls = null;
      this.rig.syncFromConfig();
    }
  }

  private tick = (): void => {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.1);
    // AUTO graphics: the watchdog needs the UNCLAMPED frame time — the
    // gameplay clamp above would disguise a 5fps grind as clean 100ms frames.
    this.adaptive?.frame(rawDt * 1000);
    this.loop.update(dt);
    this.vfx.update(dt);
    this.music.setIntensity(this.loop.musicIntensity);
    // Phase 33: the level's spectacle target scales the biome's weather,
    // and the in-level tension wave breathes on top of it.
    const weatherIntensity =
      this.weatherBase * (0.45 + this.loop.spectacleWeather * 0.45 + this.loop.tension * 0.5);
    this.weather.setIntensity(weatherIntensity);
    this.weather.update(dt);
    this.lightning.update(dt);
    const raining =
      this.weather.currentMode === 'RAIN' || this.weather.currentMode === 'THUNDERSTORM';
    this.wetSurface.update(dt, raining, weatherIntensity);
    // Rain lighting must be CONSISTENT — the tension wave and lightning
    // flicker feed the raw value, so smooth it hard before it touches the
    // lights: the storm settles into a steady dim, not a pulsing one.
    const darkTarget = Math.min(0.55, this.weather.darkening * weatherIntensity);
    this.smoothedDarkening += (darkTarget - this.smoothedDarkening) * (1 - Math.exp(-1.2 * dt));
    // Compose lighting layers (or hold a debug state for readability checks).
    const lightState: LightingState =
      this.lightDebugIndex >= 0
        ? LIGHT_DEBUG_STATES[this.lightDebugIndex].state
        : { heavy: this.loop.heavyTint, weather: this.smoothedDarkening };
    this.lighting.update(lightState, this.scene, this.cfg);
    this.vfx.shake.setting = this.cfg.accessibility.screenShake;
    const shakeOffset = this.vfx.shake.update(dt);
    if (!this.controls) {
      this.rig.camera.position.copy(this.rig.basePosition).add(shakeOffset);
      // Rotational shake multiplies onto the rig's base orientation.
      this.shakeQuat.setFromEuler(this.vfx.shake.rotationOffset);
      this.rig.camera.quaternion.copy(this.rig.baseQuaternion).multiply(this.shakeQuat);
      this.feel.applyFrame(dt); // impulse decay → camera FOV + post
    }
    this.controls?.update();
    this.post.render();
    if (!this.ready) {
      this.ready = true;
      (window as unknown as { __READY__: boolean }).__READY__ = true;
    }
  };

  /** Tears the experience down completely (HMR, tests, route unmount). */
  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pointerdown', this.unlockAudio);
    this.renderer.setAnimationLoop(null);
    this.input.dispose();
    this.hud.dispose();
    this.screens.dispose();
    this.vfx.dispose();
    this.powerups.dispose();
    disposeSubtree(this.weather.group);
    this.music.dispose();
    this.audio.dispose();
    this.controls?.dispose();
    this.debugGui?.destroy();
    this.debugGui = null;
    this.game.dispose();
    this.stadium.dispose();
    this.post.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
