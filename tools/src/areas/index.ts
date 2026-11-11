import { buildHub } from '../maps/hub';
import { buildLibrary } from '../maps/library';
import { buildLibraryTileset } from '../tiles/library';
import { buildTownTileset } from '../tiles/town';
import { buildCozyAreas } from './cozy';
import { buildOutdoorAreas } from './outdoor';
import { buildWorldAreas } from './worlds';
import type { AreaDef } from './types';

/**
 * Every map in the game. The hub and the library come first, then the
 * areas grouped by file: cozy interiors (cafe, kitchen), outdoor areas
 * (garden, riverside) and the portal room with the two other worlds.
 */
export function buildAllAreas(): AreaDef[] {
  const town = buildTownTileset();
  const library = buildLibraryTileset();
  return [
    { id: 'hub', name: 'Town Square', tileset: town, map: buildHub(town), indoor: false, ambientTint: null },
    { id: 'library', name: 'Library', tileset: library, map: buildLibrary(library), indoor: true, ambientTint: '#ffe6c4' },
    ...buildCozyAreas(),
    ...buildOutdoorAreas(town),
    ...buildWorldAreas(),
  ];
}
