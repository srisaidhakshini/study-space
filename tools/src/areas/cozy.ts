import { buildCafe } from '../maps/cafe';
import { buildKitchen } from '../maps/kitchen';
import { verifyReachable } from '../maps/verifyRoom';
import { buildCafeTileset } from '../tiles/cafe';
import { buildKitchenTileset } from '../tiles/kitchen';
import type { AreaDef } from './types';

/** Cozy interiors: the cafe and the kitchen / common room. */
export function buildCozyAreas(): AreaDef[] {
  const cafeTiles = buildCafeTileset();
  const cafe = buildCafe(cafeTiles);
  verifyReachable('cafe', cafe, { openZones: ['cafe-counter'] });

  const kitchenTiles = buildKitchenTileset();
  const kitchen = buildKitchen(kitchenTiles);
  verifyReachable('kitchen', kitchen);

  return [
    { id: 'cafe', name: 'Cafe', tileset: cafeTiles, map: cafe, indoor: true, ambientTint: '#ffd9b0' },
    { id: 'kitchen', name: 'Common Room', tileset: kitchenTiles, map: kitchen, indoor: true, ambientTint: '#ffe2c6' },
  ];
}
