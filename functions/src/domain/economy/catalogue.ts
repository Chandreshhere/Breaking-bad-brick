import { col } from '../../utils/firestore';

/**
 * Server-held prices.
 *
 * The client ships its own copy in src/game/Cosmetics.ts for rendering the
 * shop offline, but that copy is advisory. A purchase always prices the item
 * from here, because a client that names its own price is not a shop, it is
 * a gift shop.
 *
 * Firestore `catalogue/cosmetics` overrides these when present, so prices can
 * be changed in a live ops pass without a deploy. The built-in table is the
 * fallback so the economy still works before that document is seeded.
 */

export interface CatalogueEntry {
  id: string;
  price: number;
}

const BUILTIN_BALLS: CatalogueEntry[] = [
  { id: 'CLASSIC', price: 0 },
  { id: 'EMBER', price: 150 },
  { id: 'ICE', price: 150 },
  { id: 'TOXIC', price: 300 },
  { id: 'PLASMA', price: 300 },
  { id: 'VOID', price: 600 },
  { id: 'SOLAR', price: 1000 },
];

const BUILTIN_PADDLES: CatalogueEntry[] = [
  { id: 'CLASSIC', price: 0 },
  { id: 'CARBON', price: 150 },
  { id: 'CIRCUIT', price: 250 },
  { id: 'INFERNO', price: 400 },
  { id: 'ARCADE', price: 600 },
  { id: 'GOLD', price: 1200 },
];

export interface Catalogue {
  balls: CatalogueEntry[];
  paddles: CatalogueEntry[];
  version: number;
}

let cache: { at: number; value: Catalogue } | null = null;
const CACHE_MS = 60_000;

export async function loadCatalogue(): Promise<Catalogue> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  let value: Catalogue = { balls: BUILTIN_BALLS, paddles: BUILTIN_PADDLES, version: 0 };
  try {
    const snap = await col.catalogue().doc('cosmetics').get();
    if (snap.exists) {
      const d = snap.data() as Partial<Catalogue>;
      if (Array.isArray(d.balls) && Array.isArray(d.paddles)) {
        value = { balls: d.balls, paddles: d.paddles, version: d.version ?? 1 };
      }
    }
  } catch {
    /* fall back to the built-in table rather than failing a purchase */
  }
  cache = { at: Date.now(), value };
  return value;
}

export function priceOf(cat: Catalogue, kind: 'ball' | 'paddle', id: string): number | null {
  const list = kind === 'ball' ? cat.balls : cat.paddles;
  const entry = list.find((e) => e.id === id);
  return entry ? entry.price : null;
}
