# Ace Breaker

A production-quality, browser-based 3D brick-breaker inspired by the Lacoste
"Ace Breaker" Roland-Garros experience — rebuilt **entirely procedurally in
Three.js**. No Blender, no GLTF/GLB, no downloaded assets: every piece of the
stadium (clay court, markings, leaning side walls, light rails, stepped
stands, instanced seats, rear structure) is generated in code.

## Status

- ✅ **Phase 1 — Procedural static environment**: court slab with procedural
  clay shader, real line geometry, extruded side walls, emissive gold trim
  rails, stepped stands, ~1,200 instanced seats, rear block wall + raked rear
  structure, replacement wordmark branding, wavy net line.
- ✅ **Phase 2 — Camera matching**: locked, config-driven PerspectiveCamera
  with `gameplay` and `intro` states, tuned against reference screenshots via
  a headless-browser screenshot loop. The court is deliberately
  depth-compressed vs a real tennis court, matching the reference's framing.
- ✅ **Phase 3 — Materials & lighting**: procedural clay/wall/seat materials
  tuned against the reference; live tone-mapping comparison (ACES/AgX/Neutral)
  in the GUI.
- ✅ **Phase 4 — Game objects (static)**: rounded extruded paddle (lid + rim
  materials), BallRoot (emissive sphere + additive glow sprites + dynamic
  PointLight) resting on the paddle, and instanced bevelled bricks laid out
  from declarative level matrices (`src/game/levels.ts`).
- ✅ **Phase 5 — Physics & gameplay**: deterministic arcade physics on the
  X/Z plane at a fixed 1/120 s timestep — wall/rear/brick/paddle collisions,
  hit-position-steered paddle bounces (edge hits send the ball up to ~58°),
  forward-motion floor to kill horizontal loops, per-brick speed-up, lives,
  score, and a state machine (ready → playing → lifeLost → gameOver/win).
  Click & hold to move the paddle, click or Space to serve/restart. Bricks
  die with a squash-and-shrink (full impact VFX come in Phase 7). Minimal
  DOM HUD (lives/score/messages) stands in until the Phase 9 UI.
- ✅ **Phase 6 — The moving sun**: collision-reactive ball light (brick >
  paddle > wall pulse strengths with exponential decay), idle shimmer,
  speed-reactive pooled sprite trail, bloom rebalance. All live-tunable —
  `BallVisual.update` re-reads config every frame.
- ✅ **Phase 7 — Collision VFX**: the full impact grammar — pooled GPU spark
  particles (one `THREE.Points` draw call, zero per-hit allocations),
  per-instance white-hot brick flash before the squash, pooled short-lived
  impact point lights, trauma-based camera micro-shake (brick > paddle >
  wall > life-lost), and floating "+100" score pops projected to screen
  space. `src/effects/Vfx.ts` is the facade — gameplay reports what
  happened, VFX decides how it looks.
- ✅ **Phase 8 — Power-ups**: the reference's six bonuses, dropped as
  colour-coded glowing capsules (22% per brick) and caught with the paddle:
  RACKET XL (smooth width lerp, no model swap), MULTIBALL (true multi-ball
  physics — a life is lost only when the last ball drops), HEAVY BALL
  (pierces bricks, 1.8× scale, and the whole arena eases into the red state
  — lights, fog, background), DEFENSIVE WALL (glowing barrier behind the
  paddle), SMASH (light beam wipes the nearest brick row, staggered), and
  POWER SHOT (next paddle hit at 115% max speed). HUD announcements flash in
  each bonus's colour.
- ✅ **Phase 9 — UI**: full HTML/CSS screen flow over the canvas, matching
  the reference's layout language — start screen (serif + yellow title,
  PLAY pill), 6-bonuses explainer (dashed colour rings + inline-SVG icons,
  START GAME), 3-2-1 countdown with auto-serve, pause (button / P / Esc),
  and results with REPLAY. HUD lives are tennis-ball dots. The screenshot
  harness (`?shot=1`) runs a "silent" mode that skips the overlays.
- ✅ **Phase 10 — Audio**: fully procedural Web Audio (`src/audio/AudioFx.ts`
  — oscillators + filtered noise, zero sample files, honouring the
  no-external-assets rule). Distinct voices for paddle/wall/brick (heavy
  brick is a low sawtooth thump), shield, power-up arpeggio, power shot,
  serve swoosh, life-lost/win/game-over stingers, and UI clicks. The
  context unlocks on the first user gesture; `M` toggles mute.
- ✅ **Phase 11 — Mobile**: pointer events already unified, plus
  `touch-action: none`/no-zoom viewport/no text-select hygiene; a
  coarse-pointer performance tier (pixel ratio capped at 1.5, 1024 shadow
  map); responsive HUD type via `clamp()`; and portrait-aware FOV — narrow
  aspects widen the camera FOV partway toward preserving the horizontal
  view, so the side walls stay on-screen on phones. Verified via emulated
  iPhone (tier detection, touch-drag paddle, full UI flow).
- ✅ **Phase 12 — Final matching pass**: all eight game states captured and
  reviewed by a multi-agent adversarial workflow. Confirmed + applied: ball
  glow rescaled to a compact yellow hot spot (was an orange fireball), wavy
  net line dropped below the bloom threshold, per-ball glow/light
  attenuation (1/√count) so multiball reads as distinct balls, capsules
  only catchable mid-rally, screen backdrops made translucent over the live
  stadium with film grain (matching the reference title screen), pause
  screen brought into the screen system, rails re-tuned to three thin gold
  lines, rear tiers lifted out of the murk, state-machine hardening
  (idempotent endGame, mid-step win guards), and full teardown (composer,
  audio context, listeners).

**All 12 core phases complete.** Arcade expansion (13–24) in progress:

- ✅ **Phase 13 — Advanced paddle control**: free X/Z movement inside a
  player zone (closest ~28% of the court, clamped), smooth damped 2D chase,
  tracked paddle velocity on both axes — forward motion transfers energy
  into the ball, sideways motion steers it. Dash (Shift / right-click /
  mobile double-tap): a 0.16 s burst toward the pointer with cooldown,
  green streak burst, camera impulse, and whoosh. Subtle bank/pitch tilt
  with movement (visual only). The paddle's collision face is swept by its
  own Z velocity so a dash into the ball can never phase through it.
- ✅ **Phase 17 — Life-lost cinematic**: losing a ball is now an event —
  90 ms hitstop into 0.3× slow-motion recovery, deep sub-bass impact, music
  duck through a master low-pass, red screen-edge grading + desaturation +
  chromatic aberration pulse (new LDR grading pass, all impulse-decayed to
  neutral), red impact light and ember burst at the loss point, the ball
  dissolving in place, the HUD life breaking away, LIFE LOST flash, then a
  respawn countdown with the ball re-materialising on the paddle. Hitstop /
  time-scale infrastructure lands here for Phase 16 to generalise.
- ✅ **Phase 16 — GameFeelManager**: one central owner of every feel impulse
  — hitstop, time scale, camera shake, FOV punch, screen flash, vignette /
  bloom / chromatic-aberration pulses, damage grading, UI score punch, bass
  transients. Data-driven presets (TINY / NORMAL / HEAVY / CRITICAL / BOSS)
  in `cfg.game.feel.impacts`; every collision maps to one (wall/paddle/dash
  TINY, brick NORMAL, heavy-brick / power-shot / SMASH HEAVY, life-lost and
  final-brick CRITICAL). Impulses compose with clamps and decay to exact
  neutral; the manager is the only writer of camera FOV and post values.
  (Also removed: the wavy court line.)
- ✅ **Phase 14 — LevelDirector + advanced bricks**: seeded deterministic
  levels (same number → same layout, no two levels alike) from 11 formation
  templates (PYRAMID, DIAMOND, SPIRAL, TUNNEL, FORTRESS, WINGS, SNAKE,
  RINGS, COLUMNS, CHECKERBOARD, RANDOM_CLUSTER). Seven brick types with
  readable visuals and real behaviour: NORMAL, ARMORED (3 hits, steel,
  flashes + darkens per hit), EXPLOSIVE (pulsing orange core, chains to
  neighbours), MOVING (whole rows oscillate), GHOST (phases translucent ↔
  intangible), MULTIPLIER (gold, 3× score), POWERUP (teal, guaranteed
  capsule). Type variety unlocks progressively (L1 pure NORMAL … L4+ full
  mix); levels 3+ get a second reinforcement wave; clearing a level keeps
  score/lives and advances (`NEXT LEVEL`), game over restarts at level 1.
  One InstancedMesh per brick type; the type union already reserves
  SHIELDED / MAGNETIC / TELEPORT / CHAIN / REGENERATOR / LASER / BOSS.
- ✅ **Phase 15 — Combo + Overdrive**: data-driven tier ladder
  (5 hits → HOT ×2, 12 → ON FIRE ×3, 25 → BLAZING ×4, 40 → OVERDRIVE ×5
  for 8 s) with a 6 s decay timer; ball loss resets, paddle contact does
  not. Combo emits a 0..1 energy value consumed everywhere: hotter/faster
  ball shimmer, longer trails, bigger spark bursts, sustained bloom during
  overdrive — never ball speed. Live HUD combo counter that pulses per
  hit, tier announcement flashes with rising stings, and an overdrive
  moment (brief slow-mo, HEAVY impact, sawtooth riser, gold OVERDRIVE).
- ✅ **Phase 23 — Level-clear cinematic**: the final brick triggers
  CRITICAL/BOSS impact + slow-mo, balls park and glow, LEVEL CLEAR flash,
  then an animated results screen — score counts up with easing, best
  combo shown, NEXT LEVEL button; biome transitions flash white.
- ✅ **Phase 18 — Environments**: `EnvironmentDirector` cycles CLAY →
  NEON (black court, cyan neon lines/rails, cool blue light) → HELL
  (volcanic red, lava-orange trim, ember light) every three levels by
  rewriting themable config fields and rebuilding the stadium.
- ✅ **Phases 19+20 — Weather + lightning**: `WeatherManager` (independent
  of biomes) with recycled GPU particles — rain streaks (NEON storms) and
  rising embers (HELL) — density scaled by `intensity`; THUNDERSTORM adds
  procedural lightning: a jagged additive bolt behind the arena rebuilt
  per strike, flicker, screen flash through the GameFeelManager, and
  distance-delayed thunder. Overdrive entry forces a strike.
- ✅ **Phase 22 — Dynamic difficulty**: `DifficultyDirector` — tension
  waves (INTRO→BUILD→PRESSURE→CLIMAX→RELEASE from field-cleared fraction)
  feeding music and weather, plus gentle rubber-banding: struggling
  players get slower serves and 1.5× capsule drops, dominating players
  the opposite. Never a linear speed ramp.
- ✅ **Phase 24 — Boss levels**: every 4th level is a boss arena — a giant
  pulsing purple brick (24 HP, scaled collision box) with an armoured
  guard ring and explosive flank columns. Three phases with announcements
  and BOSS-preset impacts; a telegraphed laser (red warning bar on the
  paddle's row for ~1 s, then the beam fires) briefly stuns the paddle if
  it doesn't move. Heavy balls chip the boss instead of piercing it.
- ✅ **Phase 21 — Adaptive music**: a fully synthesized 140 BPM trap loop
  (`src/audio/Music.ts`) — no audio files. Six conceptual stems on their own
  gain buses (detuned pad, kick/snare, gliding 808 subs, velocity hats with
  rolls, minor pluck arp, sawtooth overdrive stabs), scheduled on a 16-step
  grid by a look-ahead scheduler. `musicIntensity` (0–1, computed from
  state + combo energy + multiball + level + overdrive) gates stems with
  ramps applied **at bar boundaries** only. Routed through the master bus,
  so the life-lost duck/low-pass and mute govern music automatically.

Arcade roadmap 25–34 in progress:

- ✅ **Phase 25 — Lighting architecture rebuild**: `LightingDirector`
  composes five independent layers (base environment / gameplay
  readability / weather / power-up / impact) with hard floors
  (`cfg.lighting.floors`: MIN_EXPOSURE, sun/fill minimums). A camera-side
  no-shadow SpotLight guarantees readable brick front faces; bricks carry
  a faint inherent emissive. HEAVY BALL no longer paints the scene red —
  it warms the light within capped lerps while the ball itself carries
  the fire; storms darken within the floors only. Dev hotkey `L` cycles
  NORMAL / DARK / STORM / HEAVY / STORM+HEAVY — all verified readable.
- ✅ **Phase 26 — Real rain**: the point-sprite rain is gone. `RainSystem`
  renders elongated streaks (bright core, transparent edges) as ONE
  instanced draw call — all motion in the vertex shader (fall, per-streak
  length/speed/opacity variation, three depth layers, smoothed wind with
  gusts, seeded density gating so the curtain never looks uniform).
  `RainSplashSystem` adds pooled probabilistic ground rings;
  `WetSurfaceController` gradually drops the clay's roughness and darkens
  it while raining (never a mirror); layered synthesized rain audio (hiss +
  wash beds + close-drop plinks) follows weather intensity; LOW/MEDIUM/HIGH
  density tiers (mobile auto-LOW). Two bugs found and fixed during
  bring-up: a shared-Vector2 wind uniform compounding gusts exponentially,
  and NaN fragments from camera-adjacent streaks poisoning the bloom chain
  (screen-to-black) — normalizes are now guarded.
- ✅ **Smoothness pass** (user-reported jitter during heavy-ball chains +
  multiball): hitstop now has a 260 ms cooldown — chains keep every flash,
  shake, and spark but the clock stops at most ~4×/s (the freeze-spam WAS
  the perceived lag); score pops are budgeted (≤7 live DOM nodes); impact
  audio voices are rate-limited per type; per-burst `THREE.Color`
  allocations hoisted; combo gold-glow and sustained bloom toned down.
  No animation removed — verified under a 20-kill heavy+multiball stress.
- ✅ **Phase 27 — Lightning as gameplay**: `LightningBolt` (recursive
  midpoint-displacement main bolt + probabilistic branches, thin white core
  over a blue-violet glow, irregular flash-off-reflash-decay flicker,
  geometry unique per strike and disposed) and `LightningDirector`
  (background scenery strikes vs gameplay strikes by configurable chance).
  Gameplay strikes telegraph for 300–700 ms — electric crackle particles,
  blue flicker on the marked brick, rising charge tone — then the bolt
  lands: direct damage (armour may soak, boss takes controlled damage),
  radial splash as plain hits (never piercing armour — pending-kills now
  carry a `pierce` flag), HEAVY impact + flash + near-thunder. Overdrive
  still forces a targeted strike. Storm cadence unchanged; the old
  Weather-internal bolt is gone.
- ✅ **Phase 28 — Cinematic camera trauma**: the shake system now runs
  three separated channels from smooth summed-sine procedural noise (never
  per-frame random): positional (low-frequency body sway + a
  high-frequency micro-vibration rattle layer), rotational
  (roll-dominant, clamped so play stays readable, multiplied onto the
  rig's base quaternion), and sharp directional kicks that violent presets
  (HEAVY+) fire before decaying into ambient shake. Magnitude = trauma².
  Accessibility: `screenShake` FULL / REDUCED / OFF scales positional,
  rotational, AND FOV punches — OFF removes all motion while flashes,
  particles, and audio feedback remain.
- ✅ **Phase 29 — Settings & debug relocation**: the lil-gui panel no
  longer renders during normal play (only `?debug=1`, or dev builds via
  Settings → 3D SCENE CONTROLS). A proper Settings screen (gear on the
  intro and pause screens) exposes music/SFX volume, screen shake,
  bloom strength, and rain quality — applied live through
  `Game.onSettingChanged`.
- ✅ **Phases 30–32 — Three worlds**: every three levels the arena
  cycles CLAY → NEON → HELL → **LOTUS//OS** (holographic lotus
  centerpiece, grid walls, floating data panels, DATA-mote weather) →
  **NEON ARCADE** (procedural cabinets with pixel-art screens, neon
  strips, HI-SCORE marquee, confetti weather) → **COMIC IMPACT**
  (halftone comic panels, extruded stars, radial ray backdrop, and
  pooled 3D BAM!/POW!/SMASH! word slams on impacts). The gameplay
  space (court, lines, walls, rails) is constant; the surrounding
  world geometry is fully swapped in `Stadium.build()`, not retinted.
- ✅ **Phase 33 — SpectacleDirector**: each level carries independent
  0–1 spectacle targets staged inside its 3-level world block (build →
  pressure → climax, with deeper cycles raising the floor). They scale
  the biome's weather, raise the adaptive-music floor, and boost brick
  burst energy — so climax levels feel bigger even at low combo, and
  the show keeps peaks *and* valleys.
- ✅ **Phase 34 — Level-up sequence**: clearing a level runs a staged
  dopamine timeline — hitstop + boom + music duck at t0, a kinetic
  LEVEL COMPLETE slam at 0.35s, the world's signature reaction at 1.1s
  (stadium lightning, LOTUS data-surge arcs, arcade cabinet flash,
  comic word burst), then a results screen at 2.2s with a rapid score
  count-up and cascading stats: CLEAR TIME, MAX COMBO, and a +500
  NO-MISS BONUS for deathless clears.

- ✅ **Arena select**: the intro menu's ARENA button opens a picker with
  all six worlds (plus AUTO CYCLE, the default 3-level rotation).
  Picking one locks every level to that world — applied instantly as a
  live preview behind the menu. HUD announcements (waves, combo tiers,
  power-ups) now play through a single-slot queue with a minimum read
  time, so rapid events never overlap on screen.

- ✅ **Graphics quality tiers**: LOW / MEDIUM / HIGH scale exactly what
  hurts small and integrated GPUs — the pixel-ratio cap (1 / 1.5 / 2),
  composer MSAA samples (0 / 2 / 4), UnrealBloom internal resolution
  (0.45× / 0.6× / 1×), sun shadows (off / 1024 PCF / 2048 PCF-soft),
  rain density, and VFX particle counts. The default **AUTO** mode picks
  a starting tier from device hints (touch, cores, memory) and steps
  itself down when the smoothed frame time stays above ~26ms for two
  seconds — never up, so it can't oscillate. Player-facing GRAPHICS
  select lives in Settings, and all settings now persist in
  localStorage across sessions.

**All phases 1–34 complete.** A final 12-agent adversarial review of the
arcade expansion confirmed and fixed six bugs pre-release: a field-clear
softlock via stale pending kills, dying-brick animations corrupting the
next wave's instanced mesh, mute defeated by pending duck automation, a
music-scheduler burst after main-thread stalls, the SMASH beam clobbering
the boss telegraph (beams now carry priority), and lightning bolt material
leaks — plus chain-kills fizzling on death, difficulty baselines at
session/wave start, and boss telegraphs resetting across serves.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc --noEmit
npm run build
```

## Controls (dev)

- `1` — intro camera state, `2` — gameplay camera state
- `o` — toggle a dev-only OrbitControls free camera (snaps back on close)
- lil-gui panel (dev builds): camera, lighting, fog, bloom live; structural
  values rebuild the stadium on release
- URL params: `?cam=gameplay|intro` selects the camera state, `?shot=1`
  hides the GUI (used by the screenshot harness)

## Architecture

```
src/
├── config/visual.config.ts   # every visual number lives here (VISUAL_CONFIG)
├── core/                     # Experience (orchestrator), CameraRig, Lighting, DebugGui
├── environment/              # one module per stadium element, all procedural
│   ├── Stadium.ts            # composes + rebuilds/disposes everything
│   ├── ClayMaterial.ts       # onBeforeCompile noise-driven clay
│   ├── Court.ts / CourtLines.ts
│   ├── SideWalls.ts          # Shape + ExtrudeGeometry profile walls
│   ├── LightRails.ts         # emissive trim (bloom feeds on these)
│   ├── Stands.ts / Seats.ts  # stepped risers + InstancedMesh seats
│   ├── RearStructure.ts / BrandingPlanes.ts / NetLine.ts
│   └── materials.ts          # shared shader-injection helpers
└── effects/PostProcessing.ts # RenderPass → bloom → OutputPass → vignette (MSAA target)
```

Coordinate system: X = left/right, Y = up, Z = near(+)/far(−); court centre
at the origin, court surface at Y = 0. Gameplay will run on the X/Z plane.

Branding note: all wordmarks are replacement branding ("ACE BREAKER") —
proprietary Lacoste marks/assets are not reproduced.
