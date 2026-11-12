import { createGrid, isBlocked, type CollisionGrid } from './collision';
import type { Direction } from './constants';
import { DEFAULT_FLOOR, DEFAULT_WALLPAPER, getFurniture, getSurface, maxRotation, type FurnitureItem } from './furniture';
import type { SeatDef } from './mapSchema';
import { findPath } from './pathfinding';

/**
 * Player homes: room sizes, layout rules and the derived collision grid and
 * seats. Pure functions used by the client for live previews and by the
 * server as the authority on what may be placed.
 *
 * Room coordinates: (0, 0) is the top-left of the inner room, excluding the
 * left and right border tiles. Rows 0..WALL_ROWS-1 are the back wall; the
 * floor starts at row WALL_ROWS. A room tile (x, y) is map tile (x + 1, y).
 * Upgrading a room only adds floor to the right and bottom, so saved
 * coordinates never move, and the door stays at the bottom-left.
 */

export const WALL_ROWS = 3;
/** Floor columns where the door is, in room coordinates. */
export const DOOR_COLUMNS = [0, 1] as const;

export interface HomeTier {
  tier: 1 | 2 | 3;
  name: string;
  floorW: number;
  floorH: number;
  /** Coins to upgrade to this tier from the one before. */
  price: number;
}

export const HOME_TIERS: readonly HomeTier[] = [
  { tier: 1, name: 'Cozy room', floorW: 10, floorH: 6, price: 0 },
  { tier: 2, name: 'Roomy flat', floorW: 14, floorH: 8, price: 600 },
  { tier: 3, name: 'Grand loft', floorW: 18, floorH: 10, price: 1800 },
];

export function getTier(tier: number): HomeTier {
  return HOME_TIERS[Math.min(Math.max(1, Math.floor(tier)), HOME_TIERS.length) - 1]!;
}

/** Size of the tile map of a tier: border columns on both sides, wall rows, floor, and the bottom border. */
export function homeMapSize(tier: number): { tilesW: number; tilesH: number } {
  const t = getTier(tier);
  return { tilesW: t.floorW + 2, tilesH: WALL_ROWS + t.floorH + 1 };
}

export type Visibility = 'private' | 'friends' | 'open';
export const VISIBILITIES: readonly Visibility[] = ['private', 'friends', 'open'];

export interface PlacedItem {
  itemId: string;
  /** Room coordinates of the footprint's top-left corner. */
  x: number;
  y: number;
  rotation: number;
}

export interface HomeLayout {
  tier: number;
  wallpaper: string;
  floor: string;
  items: PlacedItem[];
}

/** How many items one home may hold, to keep rooms and messages bounded. */
export const MAX_PLACED_ITEMS = 120;

// ---- Rotation ---------------------------------------------------------------

const FACINGS_CW: readonly Direction[] = ['down', 'left', 'up', 'right'];

export function rotateFacing(facing: Direction, rotation: number): Direction {
  const i = FACINGS_CW.indexOf(facing);
  return FACINGS_CW[(i + rotation) % 4]!;
}

/** Footprint of an item at a rotation. */
export function footprint(item: FurnitureItem, rotation: number): { w: number; h: number } {
  return rotation % 2 === 1 ? { w: item.h, h: item.w } : { w: item.w, h: item.h };
}

/** Maps a cell of the rotation-0 footprint to its place in the rotated footprint. */
export function rotateCell(item: FurnitureItem, dx: number, dy: number, rotation: number): { dx: number; dy: number } {
  switch (((rotation % 4) + 4) % 4) {
    case 1:
      return { dx: item.h - 1 - dy, dy: dx };
    case 2:
      return { dx: item.w - 1 - dx, dy: item.h - 1 - dy };
    case 3:
      return { dx: dy, dy: item.w - 1 - dx };
    default:
      return { dx, dy };
  }
}

/** Every room cell an item covers. */
export function itemCells(item: FurnitureItem, x: number, y: number, rotation: number): { x: number; y: number }[] {
  const { w, h } = footprint(item, rotation);
  const cells: { x: number; y: number }[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells.push({ x: x + dx, y: y + dy });
  return cells;
}

// ---- Validation ---------------------------------------------------------------

export type PlaceError =
  | 'unknown-item'
  | 'bad-rotation'
  | 'out-of-room'
  | 'not-on-wall'
  | 'not-on-floor'
  | 'overlap'
  | 'blocks-door'
  | 'blocks-room';

export function defaultLayout(): HomeLayout {
  return { tier: 1, wallpaper: DEFAULT_WALLPAPER, floor: DEFAULT_FLOOR, items: [] };
}

export function isValidSurface(kind: 'wallpaper' | 'floor', id: string): boolean {
  return getSurface(id)?.kind === kind;
}

/** Bounds and kind checks for one item, ignoring other items. */
function shapeError(layout: HomeLayout, placed: PlacedItem): PlaceError | null {
  const item = getFurniture(placed.itemId);
  if (!item) return 'unknown-item';
  if (!Number.isInteger(placed.x) || !Number.isInteger(placed.y) || !Number.isInteger(placed.rotation)) return 'out-of-room';
  if (placed.rotation < 0 || placed.rotation > maxRotation(item)) return 'bad-rotation';
  const tier = getTier(layout.tier);
  const roomH = WALL_ROWS + tier.floorH;
  for (const c of itemCells(item, placed.x, placed.y, placed.rotation)) {
    if (c.x < 0 || c.x >= tier.floorW || c.y < 0 || c.y >= roomH) return 'out-of-room';
    if (item.placement === 'wall' && c.y >= WALL_ROWS) return 'not-on-wall';
    if (item.placement !== 'wall' && c.y < WALL_ROWS) return 'not-on-floor';
  }
  return null;
}

/** Items overlap when they share a cell on the same layer (floor and rugs share a floor, rugs sit under floor items). */
function sameLayer(a: FurnitureItem, b: FurnitureItem): boolean {
  if (a.placement === 'wall' || b.placement === 'wall') return a.placement === b.placement;
  if (a.placement === 'rug' || b.placement === 'rug') return a.placement === b.placement;
  return true;
}

/**
 * Whether `placed` may be added to the layout. `ignoreIndex` skips one existing
 * item (the one being moved). Also keeps the door entrance clear and the room
 * walkable: every seat must stay reachable from the door.
 */
export function placeError(layout: HomeLayout, placed: PlacedItem, ignoreIndex = -1): PlaceError | null {
  const shape = shapeError(layout, placed);
  if (shape) return shape;
  const item = getFurniture(placed.itemId)!;
  const cells = new Set(itemCells(item, placed.x, placed.y, placed.rotation).map((c) => `${c.x},${c.y}`));
  for (let i = 0; i < layout.items.length; i++) {
    if (i === ignoreIndex) continue;
    const other = layout.items[i]!;
    const otherItem = getFurniture(other.itemId);
    if (!otherItem || !sameLayer(item, otherItem)) continue;
    for (const c of itemCells(otherItem, other.x, other.y, other.rotation)) {
      if (cells.has(`${c.x},${c.y}`)) return 'overlap';
    }
  }
  if (item.placement === 'floor') {
    const entryRow = WALL_ROWS + getTier(layout.tier).floorH - 1;
    for (const col of DOOR_COLUMNS) if (cells.has(`${col},${entryRow}`)) return 'blocks-door';
    const next: HomeLayout = {
      ...layout,
      items: layout.items.filter((_, i) => i !== ignoreIndex).concat(placed),
    };
    if (!roomIsUsable(next)) return 'blocks-room';
  }
  return null;
}

/** First problem in a whole layout (used on load and on upgrade), or null. */
export function layoutError(layout: HomeLayout): { index: number; error: PlaceError } | null {
  if (layout.items.length > MAX_PLACED_ITEMS) return { index: MAX_PLACED_ITEMS, error: 'overlap' };
  const built: HomeLayout = { ...layout, items: [] };
  for (let i = 0; i < layout.items.length; i++) {
    const error = placeError(built, layout.items[i]!);
    if (error) return { index: i, error };
    built.items.push(layout.items[i]!);
  }
  return null;
}

// ---- Collision, seats, reachability ---------------------------------------------

/** The tile collision grid of a home: borders, back wall and every solid item. Door tiles stay open. */
export function homeCollision(layout: HomeLayout): CollisionGrid {
  const { tilesW, tilesH } = homeMapSize(layout.tier);
  const grid = createGrid(tilesW, tilesH);
  const block = (tx: number, ty: number): void => {
    if (tx >= 0 && ty >= 0 && tx < tilesW && ty < tilesH) grid.blocked[ty * tilesW + tx] = 1;
  };
  for (let ty = 0; ty < tilesH; ty++) {
    block(0, ty);
    block(tilesW - 1, ty);
  }
  for (let ty = 0; ty < WALL_ROWS; ty++) for (let tx = 0; tx < tilesW; tx++) block(tx, ty);
  for (let tx = 0; tx < tilesW; tx++) {
    const isDoor = DOOR_COLUMNS.some((c) => c + 1 === tx);
    if (!isDoor) block(tx, tilesH - 1);
  }
  for (const placed of layout.items) {
    const item = getFurniture(placed.itemId);
    if (!item || item.placement !== 'floor') continue;
    for (const c of itemCells(item, placed.x, placed.y, placed.rotation)) block(c.x + 1, c.y);
  }
  return grid;
}

/** Seat id: stable while the item stays where it is. */
export function homeSeatId(placed: PlacedItem, index: number): string {
  return `${placed.x},${placed.y}:${index}`;
}

/** Seats provided by furniture, as map objects in tile coordinates. */
export function homeSeats(layout: HomeLayout): SeatDef[] {
  const seats: SeatDef[] = [];
  for (const placed of layout.items) {
    const item = getFurniture(placed.itemId);
    if (!item) continue;
    const { w, h } = footprint(item, placed.rotation);
    const bedArea = item.category === 'bed' ? { x: placed.x + 1, y: placed.y, width: w, height: h } : undefined;
    item.seats.forEach((spec, index) => {
      const cell = rotateCell(item, spec.dx, spec.dy, placed.rotation);
      seats.push({
        id: homeSeatId({ ...placed, x: placed.x + cell.dx, y: placed.y + cell.dy }, index),
        tx: placed.x + cell.dx + 1,
        ty: placed.y + cell.dy,
        facing: rotateFacing(spec.facing, placed.rotation),
        zoneId: 'home',
        ...(bedArea ? { bedArea } : {}),
        kind: bedArea ? 'bed' : item.category === 'seating' && item.id !== 'armchair' && item.id !== 'beanbag' ? 'bench' : 'chair',
      });
    });
  }
  return seats;
}

/** Tile where visitors arrive and leave: just inside the door. */
export function homeEntryTile(layout: HomeLayout): { tx: number; ty: number } {
  const { tilesH } = homeMapSize(layout.tier);
  return { tx: DOOR_COLUMNS[0] + 1, ty: tilesH - 2 };
}

/** Every seat has a free neighbouring tile that can be reached from the entry. */
export function roomIsUsable(layout: HomeLayout): boolean {
  const grid = homeCollision(layout);
  const entry = homeEntryTile(layout);
  if (isBlocked(grid, entry.tx, entry.ty)) return false;
  for (const seat of homeSeats(layout)) {
    // Beds were decorative in existing layouts. An obstructed bed must not invalidate a room.
    if (seat.kind === 'bed') continue;
    let reachable = false;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const tx = seat.tx + dx;
      const ty = seat.ty + dy;
      if (!isBlocked(grid, tx, ty) && findPath(grid, { x: entry.tx, y: entry.ty }, { x: tx, y: ty })) {
        reachable = true;
        break;
      }
    }
    if (!reachable) return false;
  }
  return true;
}

// ---- Map ids ------------------------------------------------------------------------

/** Runtime map ids: shared places keep their manifest id; homes and street pages are instanced. */
export const HOME_MAP_PREFIX = 'home:';
export const STREET_MAP_PREFIX = 'street:';
/** Houses on one page of the residential street. */
export const HOUSES_PER_STREET = 12;

export function homeMapId(ownerId: string): string {
  return HOME_MAP_PREFIX + ownerId;
}
export function streetMapId(page: number): string {
  return STREET_MAP_PREFIX + Math.max(1, Math.floor(page));
}

export type ParsedMapId =
  | { kind: 'place'; id: string }
  | { kind: 'home'; ownerId: string }
  | { kind: 'street'; page: number };

export function parseMapId(mapId: string): ParsedMapId {
  if (mapId.startsWith(HOME_MAP_PREFIX)) return { kind: 'home', ownerId: mapId.slice(HOME_MAP_PREFIX.length) };
  if (mapId.startsWith(STREET_MAP_PREFIX)) {
    const page = Number.parseInt(mapId.slice(STREET_MAP_PREFIX.length), 10);
    return { kind: 'street', page: Number.isFinite(page) && page >= 1 ? page : 1 };
  }
  return { kind: 'place', id: mapId };
}

/** The manifest map a runtime map is drawn from. */
export function baseMapId(mapId: string, tier = 1): string {
  const parsed = parseMapId(mapId);
  if (parsed.kind === 'home') return `home_${getTier(tier).tier}`;
  if (parsed.kind === 'street') return 'street';
  return parsed.id;
}

/** House number (1-based, across all streets) of a slot on a street page. */
export function houseNumber(page: number, slot: number): number {
  return (page - 1) * HOUSES_PER_STREET + slot;
}
export function streetPageOf(number: number): number {
  return Math.floor((Math.max(1, number) - 1) / HOUSES_PER_STREET) + 1;
}
export function slotOf(number: number): number {
  return ((Math.max(1, number) - 1) % HOUSES_PER_STREET) + 1;
}
