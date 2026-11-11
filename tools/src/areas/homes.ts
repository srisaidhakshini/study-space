import { buildHomeMap } from '../maps/home';
import { buildStreet } from '../maps/street';
import { buildHomeTileset } from '../tiles/home';
import { extendTownForStreet } from '../tiles/street';
import type { Tileset } from '../tiles/tileset';
import type { AreaDef } from './types';

/**
 * Player homes and the residential street: three room sizes (one per home
 * tier, ids `home_1`..`home_3`) and the street that leads to them. The street
 * is painted with the town tileset, which gains a few appended tiles.
 */
export function buildHomeAreas(town: Tileset): AreaDef[] {
  const home = buildHomeTileset();
  extendTownForStreet(town);
  const rooms: AreaDef[] = [1, 2, 3].map((tier) => ({
    id: `home_${tier}`,
    name: 'Home',
    tileset: home,
    map: buildHomeMap(home, tier),
    indoor: true,
    ambientTint: '#ffe9cc',
  }));
  const street: AreaDef = {
    id: 'street',
    name: 'Residential Street',
    tileset: town,
    map: buildStreet(town),
    indoor: false,
    ambientTint: null,
  };
  return [...rooms, street];
}
