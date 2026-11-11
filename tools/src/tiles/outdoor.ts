import { addGardenTiles } from './gardenTiles';
import { addRiverTiles } from './riverTiles';
import type { Tileset } from './tileset';

/**
 * Adds the garden and riverside tiles to the town tileset. New tiles are
 * appended, so every existing tile keeps its id. Safe to call twice.
 */
export function extendTownTileset(town: Tileset): void {
  if (town.has('garden_hedge_0')) return;
  addGardenTiles(town);
  addRiverTiles(town);
}
