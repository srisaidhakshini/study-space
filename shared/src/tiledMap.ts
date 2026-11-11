import { createGrid, type CollisionGrid } from './collision';
import { LAYERS, parseMapObjects, type MapObjects, type RawTiledObject } from './mapSchema';

interface RawLayer {
  name: string;
  type: string;
  data?: number[];
  objects?: RawTiledObject[];
}

export interface RawTiledMap {
  width: number;
  height: number;
  layers: RawLayer[];
}

export interface ParsedMap {
  width: number;
  height: number;
  collision: CollisionGrid;
  objects: MapObjects;
}

/**
 * Reads the parts of a Tiled map that gameplay needs: the collision grid
 * (any non-empty tile on the `collision` layer blocks) and the typed objects.
 * Runs identically in the browser and on the server.
 */
export function parseTiledMap(json: unknown): ParsedMap {
  const raw = json as RawTiledMap;
  if (!raw || typeof raw.width !== 'number' || !Array.isArray(raw.layers)) {
    throw new Error('Not a Tiled map');
  }
  const collision = createGrid(raw.width, raw.height);
  const layer = raw.layers.find((l) => l.name === LAYERS.collision && l.type === 'tilelayer');
  if (layer?.data) layer.data.forEach((gid, i) => (collision.blocked[i] = gid > 0 ? 1 : 0));
  const objectLayer = raw.layers.find((l) => l.name === LAYERS.objects && l.type === 'objectgroup');
  return {
    width: raw.width,
    height: raw.height,
    collision,
    objects: parseMapObjects(objectLayer?.objects ?? []),
  };
}
