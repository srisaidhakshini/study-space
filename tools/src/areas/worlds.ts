import { buildDome } from '../maps/dome';
import { buildPortal } from '../maps/portal';
import { buildSkyIsland } from '../maps/skyisland';
import { buildDomeTileset } from '../tiles/dome';
import { buildPortalTileset } from '../tiles/portal';
import { buildSkyTileset } from '../tiles/sky';
import type { AreaDef } from './types';

/**
 * The portal room and the two other worlds. To add a world: write a map
 * file that builds a MapBuilder with an `entrance` spawn and a `to-portal`
 * door, add a portal arch to the portal room, and list it here.
 */
export function buildWorldAreas(): AreaDef[] {
  const portalTiles = buildPortalTileset();
  const skyTiles = buildSkyTileset();
  const domeTiles = buildDomeTileset();
  return [
    { id: 'portal', name: 'Portal Room', tileset: portalTiles, map: buildPortal(portalTiles), indoor: true, ambientTint: '#d9ccff' },
    { id: 'skyisland', name: 'Sky Island', tileset: skyTiles, map: buildSkyIsland(skyTiles), indoor: false, ambientTint: null },
    { id: 'dome', name: 'Glass Dome', tileset: domeTiles, map: buildDome(domeTiles), indoor: true, ambientTint: '#bfe6f2' },
  ];
}
