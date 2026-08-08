/**
 * Graphics quality tiers for small/integrated GPUs. The dominant costs in
 * this renderer are fill-rate — the MSAA half-float composer target at
 * device pixel ratio, the UnrealBloom mip chain, and PCF-soft shadows —
 * so the tiers scale exactly those. AUTO picks a starting tier from
 * device hints and then only ever steps DOWN when the measured frame
 * time stays bad (never up — no oscillation).
 */

export type QualityTier = 'LOW' | 'MEDIUM' | 'HIGH';
export type GraphicsMode = 'AUTO' | QualityTier;

export interface QualityCaps {
  /** Cap applied to window.devicePixelRatio. */
  pixelRatioCap: number;
  /** Composer render-target MSAA samples (0 = none). */
  msaaSamples: number;
  /** UnrealBloom internal resolution = CSS size × this. */
  bloomScale: number;
  /** Sun shadow map edge; 0 disables shadows entirely. */
  shadowMapSize: number;
  /** true = PCFSoft, false = plain PCF (cheaper). */
  softShadows: boolean;
  rainQuality: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Multiplies spark/burst particle counts. */
  particleScale: number;
}

export const QUALITY_TIERS: Record<QualityTier, QualityCaps> = {
  HIGH: {
    pixelRatioCap: 2,
    msaaSamples: 4,
    bloomScale: 1,
    shadowMapSize: 2048,
    softShadows: true,
    rainQuality: 'HIGH',
    particleScale: 1,
  },
  MEDIUM: {
    pixelRatioCap: 1.5,
    msaaSamples: 2,
    bloomScale: 0.6,
    shadowMapSize: 1024,
    softShadows: false,
    rainQuality: 'MEDIUM',
    particleScale: 0.8,
  },
  LOW: {
    pixelRatioCap: 1,
    msaaSamples: 0,
    bloomScale: 0.45,
    shadowMapSize: 0,
    softShadows: false,
    rainQuality: 'LOW',
    particleScale: 0.5,
  },
};

/** Best guess before any frames have been measured. */
export function detectInitialTier(): QualityTier {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  if (coarse || cores <= 4 || memory <= 4) return 'MEDIUM';
  return 'HIGH';
}

const STEP_DOWN: Record<QualityTier, QualityTier | null> = {
  HIGH: 'MEDIUM',
  MEDIUM: 'LOW',
  LOW: null,
};

/**
 * Frame-time watchdog for AUTO mode. Feeds on real (wall-clock) frame
 * deltas; when the smoothed frame time stays above ~26ms (≈38fps) for two
 * seconds, it steps the tier down once and cools off before judging again.
 */
export class AdaptiveQuality {
  private emaMs = 16;
  private badSeconds = 0;
  private cooldown = 3; // let startup shaders compile before judging

  constructor(
    public tier: QualityTier,
    private onStepDown: (tier: QualityTier) => void
  ) {}

  frame(dtMs: number): void {
    // Spikes (tab switch, stadium rebuild, shader compile) are not a
    // sustained-load signal — ignore them.
    if (dtMs > 100) return;
    this.emaMs += (dtMs - this.emaMs) * 0.05;
    const dt = dtMs / 1000;
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return;
    }
    if (this.emaMs > 26) this.badSeconds += dt;
    else this.badSeconds = Math.max(0, this.badSeconds - dt * 2);

    if (this.badSeconds > 2) {
      const next = STEP_DOWN[this.tier];
      this.badSeconds = 0;
      this.cooldown = 6;
      if (next) {
        this.tier = next;
        this.emaMs = 16; // fresh judgement at the new tier
        this.onStepDown(next);
      }
    }
  }
}
