import { layoutError, type HomeLayout, type PlacedItem } from '@study/shared';

/**
 * What a brand-new home looks like: the starter desk, bed, rug, plant, window
 * and poster, placed in valid spots of the first room (floor 10 x 6).
 * Room coordinates; the back wall is rows 0-2 and the door is at the bottom left.
 */
export const STARTER_ITEMS: readonly PlacedItem[] = [
  { itemId: 'bed_single', x: 7, y: 3, rotation: 0 },
  { itemId: 'desk_basic', x: 3, y: 3, rotation: 0 },
  { itemId: 'rug_small', x: 4, y: 6, rotation: 0 },
  { itemId: 'plant_small', x: 9, y: 7, rotation: 0 },
  { itemId: 'window_small', x: 5, y: 0, rotation: 0 },
  { itemId: 'poster_stars', x: 2, y: 1, rotation: 0 },
];

export function starterLayout(): HomeLayout {
  const layout: HomeLayout = { tier: 1, wallpaper: 'wp_cream', floor: 'fl_oak', items: STARTER_ITEMS.map((i) => ({ ...i })) };
  const problem = layoutError(layout);
  if (problem) {
    throw new Error(`The starter home layout is invalid (item ${problem.index}: ${problem.error}). Fix server/src/homes/starter.ts.`);
  }
  return layout;
}
