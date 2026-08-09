/**
 * Central visual configuration — every number that shapes the stadium lives
 * here so the scene can be tuned screenshot-by-screenshot against the
 * reference recording. All values are initial reconstruction guesses, not
 * final measurements.
 *
 * Coordinate system:
 *   X = left/right, Y = up, Z = near(+)/far(-). Court centre is the origin,
 *   court top surface is Y = 0. The camera sits at +Z looking toward -Z.
 */

export type Vec3 = [number, number, number];

export interface CameraStateConfig {
  position: Vec3;
  target: Vec3;
  fov: number;
}

export type CameraStateName = 'gameplay' | 'intro';

export const VISUAL_CONFIG = {
  camera: {
    near: 0.1,
    far: 160,
    state: 'gameplay' as CameraStateName,
    states: {
      gameplay: {
        position: [0, 12.0, 15.0] as Vec3,
        target: [0, 0.3, 1.0] as Vec3,
        fov: 40,
      },
      intro: {
        position: [0, 8.5, 16.5] as Vec3,
        target: [0, 1.0, -1.0] as Vec3,
        fov: 34,
      },
    } satisfies Record<CameraStateName, CameraStateConfig>,

    /**
     * Portrait framing. A phone screen is far taller than it is wide, and a
     * fixed vertical FOV handles that badly in both directions: leave it
     * alone and the side walls crop away, widen it and the court shrinks to
     * a small band with dead stands above and an empty void below. So
     * portrait gets its own camera station — higher and pitched further
     * down-court, which pulls the near baseline to the bottom of the frame —
     * and the FOV is *solved* so the court fills the screen width exactly
     * rather than being multiplied by a guess.
     */
    portrait: {
      startAspect: 1.15, // blend begins once the viewport is this narrow
      fullAspect: 0.62, // …and is fully portrait by here
      position: [0, 18.2, 10.6] as Vec3,
      target: [0, 0.3, -1.6] as Vec3,
      // Slack beyond the inner wall face that the fit must also keep on
      // screen. The solver works from the paddle's real travel limits, so
      // this is a comfort margin, not the framing itself.
      fitMargin: 0.35,
      maxFov: 82,
    },
  },

  // The reference court is deliberately depth-compressed versus a real
  // tennis court — a shorter court is what lets paddle, baseline, and net
  // line all fit in frame under the strong gameplay perspective.
  court: {
    width: 13.2, // full slab width (X)
    length: 16.0, // full slab length (Z)
    thickness: 0.18,
    playWidth: 11.0, // outer line-to-line width
    playLength: 14.0, // baseline-to-baseline length
    clayBase: '#b4602a',
    roughness: 0.92, // themable — arcade worlds go glossy
    lineColor: '#f4f1e6',
    lineWidth: 0.07,
    singlesInset: 1.35, // singles sideline inset from doubles sideline
    serviceLineZ: 3.2, // |Z| of the two service lines
    centerMarkLength: 0.35,
  },

  walls: {
    innerX: 6.8, // where the inner wall face meets the ground
    height: 2.6,
    lean: 1.55, // outward lean of the inner face over its height
    topWidth: 1.6, // flat ledge on top of the wall
    length: 17.5,
    color: '#1e5636',
  },

  rails: {
    color: '#c8a84b',
    emissive: '#f5c86a',
    intensity: 0.9,
    count: 3, // rails on the top ledge (plus one bright inner-edge rail)
    spacing: 0.22,
    thickness: 0.035,
  },

  stands: {
    offset: 0.4, // gap between wall outer edge and first riser (negative overlaps)
    rows: 10,
    rowRise: 0.42,
    rowDepth: 0.62,
    firstRowTop: 2.75,
    length: 19.0,
    riserColor: '#542a10',
    upperWallColor: '#0b2113',
    upperWallHeight: 2.6,
  },

  seats: {
    spacing: 0.5,
    color: '#9c491a',
    colorJitter: 0.05,
    topDarken: 0.3, // brightness multiplier reached by the top rows (lower = darker)
  },

  rear: {
    blockColor: '#144024',
    blockW: 1.3,
    blockH: 0.95,
    blockD: 0.9,
    blockGap: 0.01,
    backWallColor: '#071c0f',
    standColor: '#1a4a2b',
  },

  game: {
    paddle: {
      width: 2.6,
      depth: 0.72,
      height: 0.34,
      z: 6.2, // starting Z of the paddle centre
      zoneZMin: 3.2, // player control zone — roughly the closest 28% of the court
      zoneZMax: 7.4,
      dash: {
        speed: 26, // burst velocity (world units/s)
        duration: 0.16,
        cooldown: 1.1,
      },
      bodyColor: '#12452a',
      rimColor: '#256b3c',
      rimEmissive: '#86b13e',
      rimEmissiveIntensity: 0.35,
    },
    ball: {
      radius: 0.19,
      color: '#ffe94a',
      emissive: '#ffd52e',
      emissiveIntensity: 1.6,
      lightColor: '#ffd44a',
      lightIntensity: 10,
      lightDistance: 7,
      innerGlowScale: 2.6, // sprite scale in ball radii
      outerGlowScale: 5.0,
      pulseDecay: 7, // how fast collision pulses fade (per second)
      trail: {
        count: 14,
        spacing: 0.028, // seconds between history samples
        maxOpacity: 0.32,
        startScale: 2.3, // freshest ghost, in ball radii
        endScale: 0.5,
      },
    },
    levels: {
      baseSeed: 20260808, // deterministic — same level number, same layout
    },
    combo: {
      decaySeconds: 6, // combo drains if no brick falls within this window
      tiers: [
        { hits: 5, mult: 2, name: 'HOT', color: '#ffb347' },
        { hits: 12, mult: 3, name: 'ON FIRE', color: '#ff7a2e' },
        { hits: 25, mult: 4, name: 'BLAZING', color: '#ff4a4a' },
      ],
      overdriveHits: 40,
      overdriveDuration: 8,
      overdriveMult: 5,
    },
    bricks: {
      width: 0.95,
      height: 0.55,
      depth: 0.8,
      gapX: 0.1,
      gapZ: 0.15,
      topZ: -5.7, // Z of the farthest brick row (leaves a ball-width lane behind)
      color: '#1d5e34',
    },
    physics: {
      baseSpeed: 8.5, // units/second at serve
      maxSpeed: 14,
      speedUpPerBrick: 0.15,
      maxBounceAngleDeg: 58, // paddle edge sends the ball this far off vertical
      minForwardRatio: 0.35, // |vz|/speed floor — prevents near-horizontal loops
      paddleFollow: 14, // exponential damping rate toward the pointer
      lossZ: 8.4, // ball Z past which a life is lost
    },
    rules: {
      lives: 3,
      brickScore: 100,
    },
    powerups: {
      dropChance: 0.22, // per destroyed brick
      fallSpeed: 4.2,
      capsuleColors: {
        RACKET_XL: '#b06aff',
        MULTIBALL: '#ff8c3a',
        HEAVY_BALL: '#ff5fd2',
        DEFENSIVE_WALL: '#4aa3ff',
        SMASH: '#7dff6a',
        POWER_SHOT: '#ff6a6a',
      },
      durations: {
        racketXl: 10,
        heavyBall: 8,
        defensiveWall: 8,
      },
      xlScale: 1.65,
      heavy: {
        radiusScale: 1.8,
        lightScale: 1.7,
      },
      multiballCount: 2,
      /**
       * Hard cap on simultaneous extra balls. Also the size of the pooled
       * ball pool — stacked MULTIBALL pickups previously grew the ball count
       * (and the scene's light count) without limit.
       */
      maxExtraBalls: 5,
      /** Pooled capsule meshes; also caps how many can fall at once. */
      maxCapsules: 14,
      shieldZ: 7.9, // behind the paddle zone, in front of the loss line
    },
    feel: {
      lifeLostDuration: 1.4, // seconds before respawn countdown / game over
      ballDissolveTime: 0.55,
      // Impact presets — every collision maps to one of these. All values
      // are impulses that decay to neutral; nothing stays on.
      // slowmo: time scale dips to (1 - slowmo) then recovers.
      impacts: {
        TINY: { hitstop: 0, slowmo: 0, shake: 0.05, flash: 0.04, fov: 0, aberration: 0, bloom: 0.08, vignette: 0, ui: 0, bass: 0 },
        NORMAL: { hitstop: 0.025, slowmo: 0, shake: 0.16, flash: 0.1, fov: 0.5, aberration: 0.12, bloom: 0.22, vignette: 0.08, ui: 0.5, bass: 0 },
        HEAVY: { hitstop: 0.05, slowmo: 0, shake: 0.32, flash: 0.22, fov: 1.6, aberration: 0.35, bloom: 0.45, vignette: 0.18, ui: 0.8, bass: 0.5 },
        CRITICAL: { hitstop: 0.08, slowmo: 0.7, shake: 0.5, flash: 0.45, fov: 2.6, aberration: 0.7, bloom: 0.7, vignette: 0.35, ui: 1, bass: 0.8 },
        BOSS: { hitstop: 0.11, slowmo: 0.55, shake: 0.7, flash: 0.65, fov: 3.5, aberration: 1, bloom: 0.9, vignette: 0.5, ui: 1, bass: 1 },
      },
    },
    lightning: {
      gameplayChance: 0.45, // storm strikes that target actual bricks
      strikeRadius: 1.9, // splash damage radius around the hit brick
      directDamage: 3, // armour may survive; boss takes controlled damage
      splashDamage: 1,
    },
    vfx: {
      sparkCount: 14,
      sparkSpeed: 5,
      shake: {
        brick: 0.22,
        paddle: 0.1,
        wall: 0.06,
        loss: 0.45,
        amplitude: 0.09, // world units at full trauma
        decay: 2.4, // trauma decay per second
      },
    },
  },

  lighting: {
    sunColor: '#ffd9a8',
    sunIntensity: 3.4,
    sunPosition: [-1.5, 18, 11] as Vec3,
    fillColor: '#dfa070',
    fillIntensity: 0.15,
    fillPosition: [6, 8, 14] as Vec3,
    hemiSky: '#4a4a3a',
    hemiGround: '#2a1508',
    hemiIntensity: 1.3,
    exposure: 1.15,
    toneMapping: 'ACES' as 'ACES' | 'AgX' | 'Neutral',
    // Readability floors — weather/power-ups may darken the scene but can
    // NEVER push lighting below these. Gameplay stays readable, always.
    floors: {
      minExposure: 0.85,
      minSunIntensity: 0.9,
      minFillIntensity: 0.55,
      gameplaySpotIntensity: 1.7, // camera-side spot guaranteeing brick faces
    },
  },

  fog: {
    color: '#08170d',
    near: 20,
    far: 55,
    background: '#04120a',
  },

  bloom: {
    strength: 0.5,
    radius: 0.3,
    threshold: 0.9,
  },

  // Stock VignetteShader blends corners toward the colour (1 - darkness), so
  // darkness must be >= 1 to actually darken; < 1 adds a grey haze instead.
  vignette: {
    offset: 1.0,
    darkness: 1.0,
  },

  weatherFx: {
    quality: 'HIGH' as 'LOW' | 'MEDIUM' | 'HIGH', // rain density tier
  },

  graphics: {
    /** AUTO detects a tier and steps down if the frame rate stays low. */
    mode: 'AUTO' as 'AUTO' | 'LOW' | 'MEDIUM' | 'HIGH',
  },

  performance: {
    /** Set by the quality tier — multiplies VFX burst particle counts. */
    particleScale: 1,
  },

  /** Which world architecture the stadium builds — set by the EnvironmentDirector. */
  worldKind: 'STADIUM' as 'STADIUM' | 'LOTUS' | 'ARCADE' | 'COMIC',

  accessibility: {
    screenShake: 'FULL' as 'FULL' | 'REDUCED' | 'OFF',
  },

  audioSettings: {
    musicVolume: 0.7,
    sfxVolume: 0.7,
  },

  branding: {
    text: 'ACE BREAKER',
    color: '#e6d6a3',
  },
};

export type VisualConfig = typeof VISUAL_CONFIG;
