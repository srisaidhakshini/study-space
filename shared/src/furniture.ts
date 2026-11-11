import type { Direction } from './constants';

/**
 * The furniture and surface catalog for player homes. This file is the single
 * source of truth: the art generator draws exactly these items, the server
 * validates against them and the client shop lists them.
 *
 * Rotation is 0..3, clockwise as seen from above. Rotation 0 faces down
 * (towards the viewer). Footprints are given for rotation 0; rotations 1 and 3
 * swap width and height.
 */

/** floor: solid furniture on the floor. rug: flat, walkable, on the floor. wall: on the wall rows. */
export type Placement = 'floor' | 'rug' | 'wall';

export type FurnitureCategory =
  | 'desk'
  | 'bed'
  | 'shelf'
  | 'seating'
  | 'table'
  | 'storage'
  | 'plant'
  | 'rug'
  | 'poster'
  | 'window'
  | 'lamp'
  | 'decor';

/** A place to sit, relative to the item's top-left at rotation 0. */
export interface SeatSpec {
  dx: number;
  dy: number;
  facing: Direction;
}

export interface FurnitureItem {
  id: string;
  name: string;
  category: FurnitureCategory;
  placement: Placement;
  /** Footprint at rotation 0, in tiles. */
  w: number;
  h: number;
  /**
   * Extra tiles of picture above the footprint (tall furniture). The sprite is
   * (w) x (h + lift) tiles; the footprint is its bottom w x h tiles.
   */
  lift: number;
  /** How many distinct views are drawn: 1 (same from every side), 2 (0 and 1), or 4. */
  rotations: 1 | 2 | 4;
  /** Price in focus coins. Items with `starter` are also given free to every new home. */
  price: number;
  starter?: number;
  seats: SeatSpec[];
  /** Lights the room at night: glow radius in pixels. */
  glow?: number;
  blurb: string;
}

export type SurfaceKind = 'wallpaper' | 'floor';

export interface SurfaceItem {
  id: string;
  name: string;
  kind: SurfaceKind;
  price: number;
  /** Representative colour for swatches. */
  color: string;
}

const item = (i: Omit<FurnitureItem, 'seats' | 'lift' | 'rotations'> & Partial<Pick<FurnitureItem, 'seats' | 'lift' | 'rotations'>>): FurnitureItem => ({
  seats: [],
  lift: 0,
  rotations: 4,
  ...i,
});

export const FURNITURE: readonly FurnitureItem[] = [
  // Desks: each set includes the chair (the seat) and a drawer or side piece.
  item({ id: 'desk_basic', name: 'Study desk', category: 'desk', placement: 'floor', w: 2, h: 2, price: 0, starter: 1, seats: [{ dx: 0, dy: 1, facing: 'up' }], blurb: 'A tidy desk with a chair and a drawer.' }),
  item({ id: 'desk_wide', name: 'Wide desk', category: 'desk', placement: 'floor', w: 3, h: 2, price: 250, seats: [{ dx: 1, dy: 1, facing: 'up' }], blurb: 'Room for books, a lamp and a mug.' }),
  item({ id: 'desk_pair', name: 'Buddy desk', category: 'desk', placement: 'floor', w: 4, h: 2, price: 450, seats: [{ dx: 1, dy: 1, facing: 'up' }, { dx: 2, dy: 1, facing: 'up' }], blurb: 'Two chairs side by side for studying together.' }),
  // Beds
  item({ id: 'bed_single', name: 'Single bed', category: 'bed', placement: 'floor', w: 2, h: 3, price: 0, starter: 1, blurb: 'Soft pillow, patchwork quilt.' }),
  item({ id: 'bed_double', name: 'Double bed', category: 'bed', placement: 'floor', w: 3, h: 3, price: 300, blurb: 'Plenty of space for naps.' }),
  // Shelves
  item({ id: 'shelf_low', name: 'Low shelf', category: 'shelf', placement: 'floor', w: 2, h: 1, lift: 1, price: 80, blurb: 'Books and little treasures.' }),
  item({ id: 'shelf_tall', name: 'Tall shelf', category: 'shelf', placement: 'floor', w: 1, h: 1, lift: 2, price: 70, blurb: 'Narrow but tall.' }),
  item({ id: 'bookcase_wide', name: 'Wide bookcase', category: 'shelf', placement: 'floor', w: 3, h: 1, lift: 2, price: 180, blurb: 'A whole wall of books.' }),
  // Seating
  item({ id: 'sofa', name: 'Sofa', category: 'seating', placement: 'floor', w: 3, h: 1, lift: 1, price: 260, seats: [{ dx: 0, dy: 0, facing: 'down' }, { dx: 1, dy: 0, facing: 'down' }, { dx: 2, dy: 0, facing: 'down' }], blurb: 'Seats three. Great for breaks.' }),
  item({ id: 'armchair', name: 'Armchair', category: 'seating', placement: 'floor', w: 1, h: 1, lift: 1, price: 120, seats: [{ dx: 0, dy: 0, facing: 'down' }], blurb: 'Deep and cosy.' }),
  item({ id: 'beanbag', name: 'Beanbag', category: 'seating', placement: 'floor', w: 1, h: 1, price: 90, rotations: 1, seats: [{ dx: 0, dy: 0, facing: 'down' }], blurb: 'Squishy.' }),
  // Tables
  item({ id: 'table_round', name: 'Round table', category: 'table', placement: 'floor', w: 2, h: 2, price: 110, rotations: 1, blurb: 'For tea and snacks.' }),
  item({ id: 'table_coffee', name: 'Coffee table', category: 'table', placement: 'floor', w: 2, h: 1, price: 70, rotations: 2, blurb: 'Low and wide.' }),
  // Storage
  item({ id: 'dresser', name: 'Dresser', category: 'storage', placement: 'floor', w: 2, h: 1, lift: 1, price: 140, blurb: 'Three deep drawers.' }),
  item({ id: 'wardrobe', name: 'Wardrobe', category: 'storage', placement: 'floor', w: 2, h: 1, lift: 2, price: 200, blurb: 'Tall double doors.' }),
  item({ id: 'tv_stand', name: 'TV stand', category: 'storage', placement: 'floor', w: 2, h: 1, lift: 1, price: 150, blurb: 'A little TV for lo-fi videos.' }),
  // Plants
  item({ id: 'plant_small', name: 'Little plant', category: 'plant', placement: 'floor', w: 1, h: 1, price: 0, starter: 1, rotations: 1, blurb: 'A friendly sprout.' }),
  item({ id: 'plant_tall', name: 'Tall plant', category: 'plant', placement: 'floor', w: 1, h: 1, lift: 1, price: 45, rotations: 1, blurb: 'Reaches for the light.' }),
  item({ id: 'plant_big', name: 'Big leafy plant', category: 'plant', placement: 'floor', w: 2, h: 1, lift: 2, price: 90, rotations: 1, blurb: 'A proper indoor jungle.' }),
  // Rugs
  item({ id: 'rug_small', name: 'Small rug', category: 'rug', placement: 'rug', w: 2, h: 2, price: 0, starter: 1, rotations: 1, blurb: 'A warm little square.' }),
  item({ id: 'rug_round', name: 'Round rug', category: 'rug', placement: 'rug', w: 3, h: 3, price: 100, rotations: 1, blurb: 'Soft and circular.' }),
  item({ id: 'rug_rect', name: 'Big rug', category: 'rug', placement: 'rug', w: 3, h: 2, price: 120, rotations: 2, blurb: 'Ties the room together.' }),
  item({ id: 'rug_runner', name: 'Runner', category: 'rug', placement: 'rug', w: 1, h: 3, price: 60, rotations: 2, blurb: 'For long hallways.' }),
  // Wall: posters
  item({ id: 'poster_stars', name: 'Star poster', category: 'poster', placement: 'wall', w: 1, h: 1, price: 0, starter: 1, rotations: 1, blurb: 'Night sky, in print.' }),
  item({ id: 'poster_cat', name: 'Cat poster', category: 'poster', placement: 'wall', w: 1, h: 1, price: 30, rotations: 1, blurb: 'Judging you gently.' }),
  item({ id: 'poster_map', name: 'World map', category: 'poster', placement: 'wall', w: 2, h: 1, price: 45, rotations: 1, blurb: 'Places to go after exams.' }),
  item({ id: 'poster_art', name: 'Framed art', category: 'poster', placement: 'wall', w: 2, h: 1, price: 40, rotations: 1, blurb: 'Hills and a setting sun.' }),
  // Wall: windows, clock, lamp
  item({ id: 'window_small', name: 'Small window', category: 'window', placement: 'wall', w: 1, h: 2, price: 0, starter: 1, rotations: 1, blurb: 'Shows the sky outside.' }),
  item({ id: 'window_wide', name: 'Wide window', category: 'window', placement: 'wall', w: 2, h: 2, price: 90, rotations: 1, blurb: 'A big bright view.' }),
  item({ id: 'clock_wall', name: 'Wall clock', category: 'decor', placement: 'wall', w: 1, h: 1, price: 35, rotations: 1, blurb: 'Tick, tick.' }),
  item({ id: 'lamp_wall', name: 'Wall lamp', category: 'lamp', placement: 'wall', w: 1, h: 1, price: 40, rotations: 1, glow: 56, blurb: 'A warm glow after dark.' }),
  item({ id: 'lamp_floor', name: 'Floor lamp', category: 'lamp', placement: 'floor', w: 1, h: 1, lift: 1, price: 55, rotations: 1, glow: 64, blurb: 'Soft light for late study.' }),
];

export const SURFACES: readonly SurfaceItem[] = [
  { id: 'wp_cream', name: 'Cream', kind: 'wallpaper', price: 0, color: '#f3e4c0' },
  { id: 'wp_sage', name: 'Sage stripes', kind: 'wallpaper', price: 60, color: '#b9c99a' },
  { id: 'wp_blush', name: 'Blush', kind: 'wallpaper', price: 60, color: '#ebbdb8' },
  { id: 'wp_sky', name: 'Sky blue', kind: 'wallpaper', price: 80, color: '#a8c9d6' },
  { id: 'wp_navy', name: 'Navy dots', kind: 'wallpaper', price: 100, color: '#4a5a86' },
  { id: 'wp_wood', name: 'Wood panels', kind: 'wallpaper', price: 120, color: '#a07a58' },
  { id: 'fl_oak', name: 'Oak planks', kind: 'floor', price: 0, color: '#c8975f' },
  { id: 'fl_dark', name: 'Dark wood', kind: 'floor', price: 80, color: '#73503e' },
  { id: 'fl_checker', name: 'Checkerboard', kind: 'floor', price: 100, color: '#e3d6bd' },
  { id: 'fl_grey', name: 'Grey carpet', kind: 'floor', price: 60, color: '#9a98a2' },
  { id: 'fl_tile', name: 'White tile', kind: 'floor', price: 80, color: '#ddd9d2' },
  { id: 'fl_stone', name: 'Stone', kind: 'floor', price: 120, color: '#8f8a82' },
];

export const DEFAULT_WALLPAPER = 'wp_cream';
export const DEFAULT_FLOOR = 'fl_oak';

const BY_ID = new Map(FURNITURE.map((f) => [f.id, f]));
const SURFACE_BY_ID = new Map(SURFACES.map((s) => [s.id, s]));

export function getFurniture(id: string): FurnitureItem | undefined {
  return BY_ID.get(id);
}

export function getSurface(id: string): SurfaceItem | undefined {
  return SURFACE_BY_ID.get(id);
}

/** What every new home starts with: item id -> quantity. */
export function starterInventory(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of FURNITURE) if (f.starter) out[f.id] = f.starter;
  return out;
}

/**
 * Rotations an item may be placed at: 1 view means fixed (rotation 0 only),
 * 2 views means 0 or 1 (a quarter turn swaps width and height), 4 views means
 * all four. Wall items are always fixed.
 */
export function maxRotation(f: FurnitureItem): number {
  if (f.placement === 'wall') return 0;
  return f.rotations - 1;
}

/** Manifest image key for the picture of an item at a rotation. Art exists for views 0 .. rotations-1. */
export function furnitureImageKey(itemId: string, rotation: number): string {
  const f = BY_ID.get(itemId);
  const view = f ? Math.min(Math.max(0, rotation), f.rotations - 1) : 0;
  return `furn_${itemId}_${view}`;
}

/** Manifest image key for a wallpaper or floor tile (16x16, tiles seamlessly). */
export function surfaceImageKey(id: string): string {
  return `surf_${id}`;
}
