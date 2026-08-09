import GUI from 'lil-gui';
import type { Vec3 } from '../config/visual.config';
import type { Experience } from './Experience';

/**
 * Development-only tuning panel. Cheap values (camera, light, fog, bloom)
 * apply live; structural values rebuild the stadium on release.
 */
export function createDebugGui(exp: Experience): GUI {
  const gui = new GUI({ title: 'Breaking Bad Brick — Stadium' });
  const cfg = exp.cfg;
  const rebuild = (): void => exp.rebuildStadium();

  const vec3Folder = (
    parent: GUI,
    label: string,
    arr: Vec3,
    min: number,
    max: number,
    onChange: () => void
  ): void => {
    const proxy = { x: arr[0], y: arr[1], z: arr[2] };
    const folder = parent.addFolder(label);
    (['x', 'y', 'z'] as const).forEach((axis, i) => {
      folder.add(proxy, axis, min, max, 0.05).onChange((v: number) => {
        arr[i] = v;
        onChange();
      });
    });
    folder.close();
  };

  // ── Camera ────────────────────────────────────────────────────────────
  const camF = gui.addFolder('Camera');
  camF
    .add(cfg.camera, 'state', ['gameplay', 'intro'])
    .listen() // keyboard shortcuts (1/2) mutate this behind the GUI's back
    .onChange(() => exp.rig.syncFromConfig());
  for (const name of ['gameplay', 'intro'] as const) {
    const state = cfg.camera.states[name];
    const folder = camF.addFolder(name);
    folder.add(state, 'fov', 15, 70, 0.5).onChange(() => exp.rig.syncFromConfig());
    vec3Folder(folder, 'position', state.position, -45, 45, () => exp.rig.syncFromConfig());
    vec3Folder(folder, 'target', state.target, -45, 45, () => exp.rig.syncFromConfig());
    if (name !== cfg.camera.state) folder.close();
  }

  // ── Gameplay objects (rebuilds) ───────────────────────────────────────
  const gameRebuild = (): void => exp.rebuildGame();
  const gameF = gui.addFolder('Game objects (rebuilds)');
  const paddleF = gameF.addFolder('Paddle');
  paddleF.add(cfg.game.paddle, 'width', 1.4, 4.5, 0.05).onFinishChange(gameRebuild);
  paddleF.add(cfg.game.paddle, 'depth', 0.4, 1.2, 0.02).onFinishChange(gameRebuild);
  paddleF.add(cfg.game.paddle, 'height', 0.15, 0.7, 0.01).onFinishChange(gameRebuild);
  paddleF.add(cfg.game.paddle, 'z', 5, 10.5, 0.05).onFinishChange(gameRebuild);
  paddleF.add(cfg.game.paddle, 'zoneZMin', 0, 6, 0.1); // live
  paddleF.add(cfg.game.paddle, 'zoneZMax', 5, 8, 0.1); // live
  paddleF.add(cfg.game.paddle.dash, 'speed', 10, 40, 1); // live
  paddleF.add(cfg.game.paddle.dash, 'cooldown', 0.3, 3, 0.05); // live
  paddleF.addColor(cfg.game.paddle, 'bodyColor').onFinishChange(gameRebuild);
  paddleF.close();
  const ballF = gameF.addFolder('Ball');
  ballF.add(cfg.game.ball, 'radius', 0.1, 0.45, 0.01).onFinishChange(gameRebuild);
  ballF.add(cfg.game.ball, 'emissiveIntensity', 0, 6, 0.05).onFinishChange(gameRebuild);
  ballF.add(cfg.game.ball, 'lightIntensity', 0, 30, 0.5).onFinishChange(gameRebuild);
  ballF.add(cfg.game.ball, 'lightDistance', 2, 15, 0.5).onFinishChange(gameRebuild);
  ballF.close();
  gui
    .add(cfg.accessibility, 'screenShake', ['FULL', 'REDUCED', 'OFF'])
    .name('screen shake'); // proper Settings screen arrives in Phase 29
  const powerF = gameF.addFolder('Powerups (live)');
  powerF.add(cfg.game.powerups, 'dropChance', 0, 1, 0.01);
  powerF.add(cfg.game.powerups, 'fallSpeed', 2, 8, 0.1);
  powerF.add(cfg.game.powerups, 'xlScale', 1.2, 2.5, 0.05);
  powerF.close();
  const physF = gameF.addFolder('Physics (live)');
  physF.add(cfg.game.physics, 'baseSpeed', 4, 16, 0.1);
  physF.add(cfg.game.physics, 'maxSpeed', 8, 24, 0.1);
  physF.add(cfg.game.physics, 'speedUpPerBrick', 0, 0.6, 0.01);
  physF.add(cfg.game.physics, 'maxBounceAngleDeg', 30, 75, 1);
  physF.add(cfg.game.physics, 'paddleFollow', 4, 30, 0.5);
  physF.close();
  const brickF = gameF.addFolder('Bricks');
  brickF.add(cfg.game.bricks, 'width', 0.5, 1.6, 0.01).onFinishChange(gameRebuild);
  brickF.add(cfg.game.bricks, 'height', 0.3, 1, 0.01).onFinishChange(gameRebuild);
  brickF.add(cfg.game.bricks, 'depth', 0.4, 1.4, 0.01).onFinishChange(gameRebuild);
  brickF.add(cfg.game.bricks, 'topZ', -10, -4, 0.05).onFinishChange(gameRebuild);
  brickF.addColor(cfg.game.bricks, 'color').onFinishChange(gameRebuild);
  brickF.close();
  gameF.close();

  // ── Lighting ──────────────────────────────────────────────────────────
  const lightF = gui.addFolder('Lighting');
  lightF
    .add(cfg.lighting, 'toneMapping', ['ACES', 'AgX', 'Neutral'])
    .onChange(() => exp.applyLighting());
  lightF.addColor(cfg.lighting, 'sunColor').onChange(() => exp.applyLighting());
  lightF.add(cfg.lighting, 'sunIntensity', 0, 10, 0.05).onChange(() => exp.applyLighting());
  vec3Folder(lightF, 'sunPosition', cfg.lighting.sunPosition, -45, 45, () => exp.applyLighting());
  lightF.add(cfg.lighting, 'fillIntensity', 0, 3, 0.01).onChange(() => exp.applyLighting());
  lightF.add(cfg.lighting, 'hemiIntensity', 0, 3, 0.01).onChange(() => exp.applyLighting());
  lightF.add(cfg.lighting, 'exposure', 0.2, 2.5, 0.01).onChange(() => exp.applyLighting());
  lightF.close();

  // ── Fog / background ─────────────────────────────────────────────────
  const fogF = gui.addFolder('Fog');
  fogF.addColor(cfg.fog, 'color').onChange(() => exp.applyEnvironment());
  fogF.addColor(cfg.fog, 'background').onChange(() => exp.applyEnvironment());
  fogF.add(cfg.fog, 'near', 0, 120, 0.5).onChange(() => exp.applyEnvironment());
  fogF.add(cfg.fog, 'far', 0, 220, 0.5).onChange(() => exp.applyEnvironment());
  fogF.close();

  // ── Bloom / post ──────────────────────────────────────────────────────
  const postF = gui.addFolder('Bloom / Post');
  postF.add(cfg.bloom, 'strength', 0, 3, 0.01).onChange(() => exp.post.applyConfig(cfg));
  postF.add(cfg.bloom, 'radius', 0, 2, 0.01).onChange(() => exp.post.applyConfig(cfg));
  postF.add(cfg.bloom, 'threshold', 0, 1.5, 0.01).onChange(() => exp.post.applyConfig(cfg));
  postF.add(cfg.vignette, 'offset', 0, 2, 0.01).onChange(() => exp.post.applyConfig(cfg));
  postF.add(cfg.vignette, 'darkness', 0, 2.5, 0.01).onChange(() => exp.post.applyConfig(cfg));
  postF.close();

  // ── Structure (rebuilds the stadium) ─────────────────────────────────
  const structF = gui.addFolder('Structure (rebuilds)');
  const courtF = structF.addFolder('Court');
  courtF.add(cfg.court, 'width', 8, 20, 0.1).onFinishChange(rebuild);
  courtF.add(cfg.court, 'length', 12, 32, 0.1).onFinishChange(rebuild);
  courtF.add(cfg.court, 'playWidth', 6, 18, 0.1).onFinishChange(rebuild);
  courtF.add(cfg.court, 'playLength', 10, 30, 0.1).onFinishChange(rebuild);
  courtF.addColor(cfg.court, 'clayBase').onFinishChange(rebuild);
  courtF.close();

  const wallF = structF.addFolder('Walls');
  wallF.add(cfg.walls, 'innerX', 5, 12, 0.05).onFinishChange(rebuild);
  wallF.add(cfg.walls, 'height', 1, 5, 0.05).onFinishChange(rebuild);
  wallF.add(cfg.walls, 'lean', 0, 3, 0.05).onFinishChange(rebuild);
  wallF.add(cfg.walls, 'topWidth', 0.2, 3, 0.05).onFinishChange(rebuild);
  wallF.addColor(cfg.walls, 'color').onFinishChange(rebuild);
  wallF.close();

  const railF = structF.addFolder('Rails');
  railF.add(cfg.rails, 'intensity', 0, 12, 0.1).onFinishChange(rebuild);
  railF.add(cfg.rails, 'count', 1, 6, 1).onFinishChange(rebuild);
  railF.add(cfg.rails, 'spacing', 0.1, 0.8, 0.01).onFinishChange(rebuild);
  railF.close();

  const standF = structF.addFolder('Stands');
  standF.add(cfg.stands, 'rows', 4, 20, 1).onFinishChange(rebuild);
  standF.add(cfg.stands, 'rowRise', 0.2, 1, 0.01).onFinishChange(rebuild);
  standF.add(cfg.stands, 'rowDepth', 0.3, 1.5, 0.01).onFinishChange(rebuild);
  standF.add(cfg.stands, 'firstRowTop', 1, 5, 0.05).onFinishChange(rebuild);
  standF.addColor(cfg.stands, 'riserColor').onFinishChange(rebuild);
  standF.close();

  const seatF = structF.addFolder('Seats');
  seatF.add(cfg.seats, 'spacing', 0.3, 0.9, 0.01).onFinishChange(rebuild);
  seatF.addColor(cfg.seats, 'color').onFinishChange(rebuild);
  seatF.add(cfg.seats, 'topDarken', 0.1, 1, 0.01).onFinishChange(rebuild);
  seatF.close();
  structF.close();

  return gui;
}
