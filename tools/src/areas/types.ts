import type { MapBuilder } from '../maps/builder';
import type { Tileset } from '../tiles/tileset';

/** One walkable map plus the tileset it is painted with. */
export interface AreaDef {
  /** Map id, used in door targets and the manifest, e.g. "cafe". */
  id: string;
  /** Name shown in the HUD. */
  name: string;
  /** Tilesets may be shared between areas (pass the same instance). */
  tileset: Tileset;
  map: MapBuilder;
  indoor: boolean;
  /** Multiply tint over the whole map (hex), or null. */
  ambientTint: string | null;
}
