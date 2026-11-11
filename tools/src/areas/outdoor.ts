import { buildGarden } from '../maps/garden';
import { buildRiverside } from '../maps/riverside';
import { extendTownTileset } from '../tiles/outdoor';
import type { Tileset } from '../tiles/tileset';
import type { AreaDef } from './types';

/**
 * Outdoor areas: the garden and the riverside. They paint with the shared
 * town tileset, to which the garden and river tiles are appended first.
 */
export function buildOutdoorAreas(town: Tileset): AreaDef[] {
  extendTownTileset(town);
  return [
    { id: 'garden', name: 'Garden', tileset: town, map: buildGarden(town), indoor: false, ambientTint: null },
    { id: 'riverside', name: 'Riverside', tileset: town, map: buildRiverside(town), indoor: false, ambientTint: null },
  ];
}
