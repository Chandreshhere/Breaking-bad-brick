import * as THREE from 'three';
import type { VisualConfig } from '../config/visual.config';
import { buildBrandingPlanes } from './BrandingPlanes';
import { buildCourt } from './Court';
import { buildCourtLines } from './CourtLines';
import { buildLightRails } from './LightRails';
import { disposeSubtree } from './materials';
import { buildRearStructure } from './RearStructure';
import { buildSeats } from './Seats';
import { buildSideWalls } from './SideWalls';
import { buildStands } from './Stands';
import { buildArcadeWorld, buildComicWorld, buildLotusWorld } from './Worlds';

/**
 * Composes the whole procedural arena. `build()` is idempotent — it tears
 * down and rebuilds from the current config, so the debug GUI can retune
 * structural values live.
 */
export class Stadium {
  private group: THREE.Group | null = null;
  /** The live clay material — rebuilt with the stadium; wet-surface hooks re-attach. */
  clayMaterial: THREE.MeshStandardMaterial | null = null;

  constructor(
    private scene: THREE.Scene,
    private cfg: VisualConfig
  ) {}

  build(): void {
    this.dispose();
    const group = new THREE.Group();
    // The gameplay space (court, walls, rails) is constant across worlds;
    // the surroundings are a completely different set per world kind.
    group.add(
      buildCourt(this.cfg),
      buildCourtLines(this.cfg),
      buildSideWalls(this.cfg),
      buildLightRails(this.cfg)
    );
    switch (this.cfg.worldKind) {
      case 'LOTUS':
        group.add(buildLotusWorld(this.cfg));
        break;
      case 'ARCADE':
        group.add(buildArcadeWorld(this.cfg));
        break;
      case 'COMIC':
        group.add(buildComicWorld(this.cfg));
        break;
      default:
        group.add(
          buildStands(this.cfg),
          buildSeats(this.cfg),
          buildRearStructure(this.cfg),
          buildBrandingPlanes(this.cfg)
        );
    }
    this.scene.add(group);
    this.group = group;

    this.clayMaterial = null;
    group.traverse((obj) => {
      const material = (obj as THREE.Mesh).material as THREE.Material | undefined;
      if (material?.name === 'clay-material') {
        this.clayMaterial = material as THREE.MeshStandardMaterial;
      }
    });
  }

  dispose(): void {
    if (!this.group) return;
    disposeSubtree(this.group);
    this.scene.remove(this.group);
    this.group = null;
  }
}
