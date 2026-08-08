import type { VisualConfig } from '../config/visual.config';

export type BiomeName = 'CLAY' | 'NEON' | 'HELL' | 'LOTUS_OS' | 'NEON_ARCADE' | 'COMIC_IMPACT';
export type WeatherModeName = 'CLEAR' | 'RAIN' | 'THUNDERSTORM' | 'EMBERS' | 'DATA' | 'CONFETTI';
export type WorldKind = 'STADIUM' | 'LOTUS' | 'ARCADE' | 'COMIC';

/** Every themable field. CLAY is captured from the live config at startup. */
interface BiomeSpec {
  clayBase: string;
  lineColor: string;
  wallColor: string;
  railColor: string;
  railEmissive: string;
  railIntensity: number;
  riserColor: string;
  upperWallColor: string;
  seatColor: string;
  blockColor: string;
  backWallColor: string;
  standColor: string;
  sunColor: string;
  sunIntensity: number;
  fillColor: string;
  fillIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  background: string;
  brandingColor: string;
  weather: { mode: WeatherModeName; intensity: number };
  worldKind: WorldKind;
  courtRoughness: number;
}

const NEON: BiomeSpec = {
  clayBase: '#14171d',
  lineColor: '#3ce8c8',
  wallColor: '#0a1418',
  railColor: '#49f2d2',
  railEmissive: '#6dfce0',
  railIntensity: 2.2,
  riserColor: '#1a2030',
  upperWallColor: '#05080c',
  seatColor: '#23384d',
  blockColor: '#0e2230',
  backWallColor: '#060d12',
  standColor: '#0a1520',
  sunColor: '#b8d8ff',
  sunIntensity: 1.6,
  fillColor: '#4a7dff',
  fillIntensity: 0.3,
  hemiSky: '#22364a',
  hemiGround: '#0a0f1c',
  hemiIntensity: 0.9,
  fogColor: '#050a10',
  fogNear: 18,
  fogFar: 46,
  background: '#02060a',
  brandingColor: '#7df7e2',
  weather: { mode: 'THUNDERSTORM', intensity: 0.6 },
  worldKind: 'STADIUM',
  courtRoughness: 0.92,
};

const HELL: BiomeSpec = {
  clayBase: '#2e0f08',
  lineColor: '#ff9a5a',
  wallColor: '#1c0805',
  railColor: '#ff5a2a',
  railEmissive: '#ff7a30',
  railIntensity: 2.4,
  riserColor: '#300d06',
  upperWallColor: '#120402',
  seatColor: '#571c0c',
  blockColor: '#240a05',
  backWallColor: '#120402',
  standColor: '#1a0603',
  sunColor: '#ff6a3c',
  sunIntensity: 2.4,
  fillColor: '#ff3a1a',
  fillIntensity: 0.3,
  hemiSky: '#401510',
  hemiGround: '#160404',
  hemiIntensity: 0.8,
  fogColor: '#180402',
  fogNear: 16,
  fogFar: 40,
  background: '#0c0201',
  brandingColor: '#ffb08a',
  weather: { mode: 'EMBERS', intensity: 0.55 },
  worldKind: 'STADIUM',
  courtRoughness: 0.92,
};

// Phase 30 — holographic operating-system court.
const LOTUS_OS: BiomeSpec = {
  clayBase: '#05070c', lineColor: '#35e0ff', wallColor: '#060a12',
  railColor: '#35e0ff', railEmissive: '#66eaff', railIntensity: 2.4,
  riserColor: '#0a1420', upperWallColor: '#04080e', seatColor: '#0e2230',
  blockColor: '#0a2230', backWallColor: '#04080e', standColor: '#081420',
  sunColor: '#9fd4ff', sunIntensity: 1.5, fillColor: '#3a86ff', fillIntensity: 0.3,
  hemiSky: '#16283a', hemiGround: '#05070c', hemiIntensity: 1.0,
  fogColor: '#030608', fogNear: 20, fogFar: 50, background: '#010304',
  brandingColor: '#66eaff',
  weather: { mode: 'DATA', intensity: 0.5 },
  worldKind: 'LOTUS',
  courtRoughness: 0.5,
};

// Phase 31 — dark arcade hall.
const NEON_ARCADE: BiomeSpec = {
  clayBase: '#08070d', lineColor: '#ff3ad8', wallColor: '#0c0714',
  railColor: '#ffd21e', railEmissive: '#ffd21e', railIntensity: 2.2,
  riserColor: '#141020', upperWallColor: '#060410', seatColor: '#241a38',
  blockColor: '#141026', backWallColor: '#060410', standColor: '#0e0a1c',
  sunColor: '#cfd6ff', sunIntensity: 1.4, fillColor: '#b04aff', fillIntensity: 0.35,
  hemiSky: '#241a38', hemiGround: '#0a0612', hemiIntensity: 1.0,
  fogColor: '#060409', fogNear: 18, fogFar: 46, background: '#030204',
  brandingColor: '#ff3ad8',
  weather: { mode: 'CONFETTI', intensity: 0.4 },
  worldKind: 'ARCADE',
  courtRoughness: 0.3,
};

// Phase 32 — manga pop-art world.
const COMIC_IMPACT: BiomeSpec = {
  clayBase: '#1a2350', lineColor: '#ffe14a', wallColor: '#232b66',
  railColor: '#ff3ad8', railEmissive: '#ff5fd2', railIntensity: 2.0,
  riserColor: '#232b66', upperWallColor: '#141a3a', seatColor: '#3a4488',
  blockColor: '#232b66', backWallColor: '#141a3a', standColor: '#1a2350',
  sunColor: '#fff2d8', sunIntensity: 2.6, fillColor: '#ff4aa0', fillIntensity: 0.4,
  hemiSky: '#4a3a66', hemiGround: '#1a1030', hemiIntensity: 1.2,
  fogColor: '#141a3a', fogNear: 22, fogFar: 55, background: '#0a0e24',
  brandingColor: '#ffe14a',
  weather: { mode: 'CLEAR', intensity: 0 },
  worldKind: 'COMIC',
  courtRoughness: 0.6,
};

/**
 * Swaps the arena between biomes by rewriting the themable config fields
 * and asking the host to rebuild. Levels cycle CLAY → NEON → HELL every
 * three levels, so the world visibly evolves as the player progresses.
 */
export class EnvironmentDirector {
  current: BiomeName = 'CLAY';
  private readonly claySpec: BiomeSpec;

  constructor(private cfg: VisualConfig) {
    // Capture the hand-tuned Roland-clay look as the CLAY biome.
    this.claySpec = {
      clayBase: cfg.court.clayBase,
      lineColor: cfg.court.lineColor,
      wallColor: cfg.walls.color,
      railColor: cfg.rails.color,
      railEmissive: cfg.rails.emissive,
      railIntensity: cfg.rails.intensity,
      riserColor: cfg.stands.riserColor,
      upperWallColor: cfg.stands.upperWallColor,
      seatColor: cfg.seats.color,
      blockColor: cfg.rear.blockColor,
      backWallColor: cfg.rear.backWallColor,
      standColor: cfg.rear.standColor,
      sunColor: cfg.lighting.sunColor,
      sunIntensity: cfg.lighting.sunIntensity,
      fillColor: cfg.lighting.fillColor,
      fillIntensity: cfg.lighting.fillIntensity,
      hemiSky: cfg.lighting.hemiSky,
      hemiGround: cfg.lighting.hemiGround,
      hemiIntensity: cfg.lighting.hemiIntensity,
      fogColor: cfg.fog.color,
      fogNear: cfg.fog.near,
      fogFar: cfg.fog.far,
      background: cfg.fog.background,
      brandingColor: cfg.branding.color,
      weather: { mode: 'CLEAR', intensity: 0 },
      worldKind: 'STADIUM',
      courtRoughness: cfg.court.roughness,
    };
  }

  /** Player-selected arena from the menu — null lets the level cycle decide. */
  forcedBiome: BiomeName | null = null;

  biomeForLevel(level: number): BiomeName {
    if (this.forcedBiome) return this.forcedBiome;
    const cycle: BiomeName[] = ['CLAY', 'NEON', 'HELL', 'LOTUS_OS', 'NEON_ARCADE', 'COMIC_IMPACT'];
    return cycle[Math.floor((level - 1) / 3) % cycle.length];
  }

  spec(name: BiomeName): BiomeSpec {
    if (name === 'NEON') return NEON;
    if (name === 'HELL') return HELL;
    if (name === 'LOTUS_OS') return LOTUS_OS;
    if (name === 'NEON_ARCADE') return NEON_ARCADE;
    if (name === 'COMIC_IMPACT') return COMIC_IMPACT;
    return this.claySpec;
  }

  /** Rewrites the themable config fields. Returns true if the biome changed. */
  apply(name: BiomeName): boolean {
    const changed = name !== this.current;
    this.current = name;
    const s = this.spec(name);
    const cfg = this.cfg;
    cfg.court.clayBase = s.clayBase;
    cfg.court.lineColor = s.lineColor;
    cfg.walls.color = s.wallColor;
    cfg.rails.color = s.railColor;
    cfg.rails.emissive = s.railEmissive;
    cfg.rails.intensity = s.railIntensity;
    cfg.stands.riserColor = s.riserColor;
    cfg.stands.upperWallColor = s.upperWallColor;
    cfg.seats.color = s.seatColor;
    cfg.rear.blockColor = s.blockColor;
    cfg.rear.backWallColor = s.backWallColor;
    cfg.rear.standColor = s.standColor;
    cfg.lighting.sunColor = s.sunColor;
    cfg.lighting.sunIntensity = s.sunIntensity;
    cfg.lighting.fillColor = s.fillColor;
    cfg.lighting.fillIntensity = s.fillIntensity;
    cfg.lighting.hemiSky = s.hemiSky;
    cfg.lighting.hemiGround = s.hemiGround;
    cfg.lighting.hemiIntensity = s.hemiIntensity;
    cfg.fog.color = s.fogColor;
    cfg.fog.near = s.fogNear;
    cfg.fog.far = s.fogFar;
    cfg.fog.background = s.background;
    cfg.branding.color = s.brandingColor;
    cfg.worldKind = s.worldKind;
    cfg.court.roughness = s.courtRoughness;
    return changed;
  }
}
