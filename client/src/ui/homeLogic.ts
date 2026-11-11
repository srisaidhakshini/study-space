import {
  FURNITURE,
  HOME_TIERS,
  SURFACES,
  footprint,
  getFurniture,
  getTier,
  maxRotation,
  placeError,
  type FurnitureCategory,
  type FurnitureItem,
  type HomeInfoMessage,
  type HomeTier,
  type InventoryMessage,
  type PlaceError,
  type PlacedItem,
  type SurfaceItem,
} from '@study/shared';

/** Pure helpers behind the Home panel: no DOM, so they can be checked from a script. */

export const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  desk: 'Desks',
  bed: 'Beds',
  shelf: 'Shelves',
  seating: 'Seating',
  table: 'Tables',
  storage: 'Storage',
  plant: 'Plants',
  rug: 'Rugs',
  poster: 'Posters',
  window: 'Windows',
  lamp: 'Lamps',
  decor: 'Decor',
};

/** The order categories are listed in. */
export const CATEGORY_ORDER: readonly FurnitureCategory[] = [
  'desk',
  'bed',
  'seating',
  'table',
  'storage',
  'shelf',
  'plant',
  'rug',
  'poster',
  'window',
  'lamp',
  'decor',
];

export interface CategoryGroup<T> {
  category: FurnitureCategory;
  label: string;
  entries: T[];
}

/** Splits entries by their item's category, in display order, skipping empty groups. */
export function groupByCategory<T>(entries: readonly T[], categoryOf: (entry: T) => FurnitureCategory): CategoryGroup<T>[] {
  const groups: CategoryGroup<T>[] = [];
  for (const category of CATEGORY_ORDER) {
    const inGroup = entries.filter((entry) => categoryOf(entry) === category);
    if (inGroup.length > 0) groups.push({ category, label: CATEGORY_LABELS[category], entries: inGroup });
  }
  return groups;
}

export function placedCount(items: readonly PlacedItem[], itemId: string): number {
  let n = 0;
  for (const placed of items) if (placed.itemId === itemId) n += 1;
  return n;
}

export interface OwnedCard {
  item: FurnitureItem;
  owned: number;
  placed: number;
  /** Copies still in storage (owned minus placed, never negative). */
  free: number;
}

/** The furniture you own, with how many copies are in the room. */
export function ownedCards(inventory: InventoryMessage | null, placed: readonly PlacedItem[]): OwnedCard[] {
  const out: OwnedCard[] = [];
  for (const item of FURNITURE) {
    const owned = inventory?.owned[item.id] ?? 0;
    if (owned <= 0) continue;
    const inRoom = placedCount(placed, item.id);
    out.push({ item, owned, placed: inRoom, free: Math.max(0, owned - inRoom) });
  }
  return out;
}

export interface Affordability {
  total: number;
  canBuy: boolean;
  /** Coins still missing (0 when you can afford it). */
  missing: number;
}

export function affordability(coins: number, unitPrice: number, quantity: number): Affordability {
  const qty = Math.max(1, Math.floor(quantity));
  const total = Math.max(0, Math.floor(unitPrice)) * qty;
  const have = Math.max(0, Math.floor(coins));
  return { total, canBuy: have >= total, missing: Math.max(0, total - have) };
}

export interface ShopEntry {
  kind: 'furniture' | 'surface';
  id: string;
  name: string;
  price: number;
  owned: number;
  furniture?: FurnitureItem;
  surface?: SurfaceItem;
}

/** Ids of the wallpapers and floors you can use: the ones you bought and the free ones. */
export function ownedSurfaceIds(inventory: InventoryMessage | null): Set<string> {
  const ids = new Set<string>(inventory?.surfaces ?? []);
  for (const surface of SURFACES) if (surface.price === 0) ids.add(surface.id);
  return ids;
}

/** Everything worth buying: furniture with a price (you may want more) and surfaces you do not own yet. */
export function shopEntries(inventory: InventoryMessage | null): ShopEntry[] {
  const entries: ShopEntry[] = [];
  for (const item of FURNITURE) {
    if (item.price <= 0) continue;
    entries.push({ kind: 'furniture', id: item.id, name: item.name, price: item.price, owned: inventory?.owned[item.id] ?? 0, furniture: item });
  }
  const mine = ownedSurfaceIds(inventory);
  for (const surface of SURFACES) {
    if (mine.has(surface.id)) continue;
    entries.push({ kind: 'surface', id: surface.id, name: surface.name, price: surface.price, owned: 0, surface });
  }
  return entries;
}

/** The tier you would upgrade to, or null at the biggest size. */
export function nextTier(currentTier: number): HomeTier | null {
  const current = getTier(currentTier).tier;
  return HOME_TIERS.find((t) => t.tier === current + 1) ?? null;
}

/** The next rotation for an item that may be turned (wraps to 0), or the same one if it is fixed. */
export function nextRotation(item: FurnitureItem, rotation: number): number {
  const max = maxRotation(item);
  if (max <= 0) return 0;
  return rotation >= max ? 0 : rotation + 1;
}

export interface RotateResult {
  ok: boolean;
  placed: PlacedItem;
  error: PlaceError | null;
}

/**
 * What turning a placed item a quarter turn would do, checked with the same
 * rules the server uses. Like the R key in the room, it first tries to turn
 * the item around its centre and falls back to keeping its top-left corner.
 */
export function rotateInPlace(info: Pick<HomeInfoMessage, 'tier' | 'wallpaper' | 'floor' | 'items'>, index: number): RotateResult | null {
  const placed = info.items[index];
  const item = placed ? getFurniture(placed.itemId) : undefined;
  if (!placed || !item) return null;
  const rotation = nextRotation(item, placed.rotation);
  const same: PlacedItem = { ...placed, rotation };
  if (maxRotation(item) <= 0) return { ok: false, placed: same, error: 'bad-rotation' };
  const before = footprint(item, placed.rotation);
  const after = footprint(item, rotation);
  const centred: PlacedItem = {
    ...placed,
    rotation,
    x: placed.x + Math.floor((before.w - after.w) / 2),
    y: placed.y + Math.floor((before.h - after.h) / 2),
  };
  const layout = { tier: info.tier, wallpaper: info.wallpaper, floor: info.floor, items: info.items };
  let firstError: PlaceError | null = null;
  for (const candidate of [centred, same]) {
    const error = placeError(layout, candidate, index);
    if (error === null) return { ok: true, placed: candidate, error: null };
    firstError ??= error;
  }
  return { ok: false, placed: same, error: firstError };
}

export function canTurn(item: FurnitureItem): boolean {
  return maxRotation(item) > 0;
}
