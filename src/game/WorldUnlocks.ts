/**
 * Which arenas a player has earned.
 *
 * This table is a mirror of `WORLD_UNLOCKS` in
 * functions/src/domain/missions/missions.ts and the two must not drift — the
 * server recomputes `inventory.unlockedWorlds` on every accepted run, so a
 * client that offered a world the server does not grant would show a card
 * that silently reverts on the next sync.
 *
 * The client resolves unlocks from the *union* of two sources:
 *
 *  - the local best level, so a player with no network still progresses and
 *    still earns arenas; and
 *  - whatever the server last vouched for, so an entitlement granted another
 *    way (a promotion, a restored account, a purchase) is honoured even
 *    though no local run justifies it.
 *
 * Union rather than intersection is deliberate. Taking away an arena someone
 * has already been playing in is a far worse failure than briefly offering
 * one they were about to earn anyway.
 */

export interface WorldUnlock {
  world: string;
  atLevel: number;
}

export const WORLD_UNLOCKS: readonly WorldUnlock[] = [
  { world: 'CLAY', atLevel: 1 },
  { world: 'NEON', atLevel: 4 },
  { world: 'HELL', atLevel: 7 },
  { world: 'LOTUS_OS', atLevel: 10 },
  { world: 'NEON_ARCADE', atLevel: 13 },
  { world: 'COMIC_IMPACT', atLevel: 16 },
];

/** The level a world becomes available at, or 1 for anything unlisted. */
export function requiredLevel(world: string): number {
  return WORLD_UNLOCKS.find((w) => w.world === world)?.atLevel ?? 1;
}

/** Worlds earned purely by local progress. */
export function worldsUnlockedAt(bestLevel: number): string[] {
  return WORLD_UNLOCKS.filter((w) => bestLevel >= w.atLevel).map((w) => w.world);
}

/**
 * The set the arena picker should treat as playable.
 *
 * @param bestLevel  Highest level reached locally.
 * @param granted    `inventory.unlockedWorlds` from the last sync, if any.
 */
export function unlockedWorlds(bestLevel: number, granted?: readonly string[] | null): Set<string> {
  const set = new Set(worldsUnlockedAt(bestLevel));
  for (const w of granted ?? []) set.add(w);
  // The first arena is unconditional: a brand-new profile must have
  // somewhere to play even if every other source is empty.
  set.add('CLAY');
  return set;
}

/**
 * The next arena still to earn, for the "REACH LEVEL n" hint on the picker.
 * Null once everything is unlocked.
 */
export function nextUnlock(unlocked: ReadonlySet<string>): WorldUnlock | null {
  return WORLD_UNLOCKS.find((w) => !unlocked.has(w.world)) ?? null;
}
