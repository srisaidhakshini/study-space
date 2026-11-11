import Phaser from 'phaser';
import {
  createGrid,
  LAYERS,
  parseMapObjects,
  TILE,
  TILE_PROP_SORT_OFFSET,
  TREE_PLOT,
  type CollisionGrid,
  type MapEntry,
  type MapObjects,
  type RawTiledObject,
} from '@study/shared';
import { app } from '../../app';
import { DEPTH } from '../depths';

export interface LoadedMap {
  id: string;
  entry: MapEntry;
  widthPx: number;
  heightPx: number;
  grid: CollisionGrid;
  objects: MapObjects;
  treeTiles: Phaser.GameObjects.Image[];
}

/** Turns every furniture tile into its own image so it can depth-sort with characters. */
function buildFurniture(scene: Phaser.Scene, map: Phaser.Tilemaps.Tilemap, entry: MapEntry, id: string): Phaser.GameObjects.Image[] {
  const treeTiles: Phaser.GameObjects.Image[] = [];
  const layer = map.getLayer(LAYERS.furniture);
  if (!layer) return treeTiles;
  for (const row of layer.data) {
    for (const tile of row) {
      if (!tile || tile.index <= 0) continue;
      const tileset = map.tilesets.find((ts) => ts.containsTileIndex(tile.index));
      if (!tileset) continue;
      const texture = entry.tilesets[tileset.name];
      if (!texture) continue;
      const props = tileset.getTileProperties(tile.index) as Record<string, unknown> | null | undefined;
      const sortOffset = Number(props?.[TILE_PROP_SORT_OFFSET] ?? 0) || 0;
      const image = scene.add
        .image(tile.x * TILE, tile.y * TILE, texture, tile.index - tileset.firstgid)
        .setOrigin(0, 0)
        .setDepth((tile.y + 1 + sortOffset) * TILE);
      const { x, y, size } = TREE_PLOT;
      if (id === 'garden' && tile.x >= x && tile.x < x + size && tile.y >= y && tile.y < y + size) {
        treeTiles.push(image);
      }
    }
  }
  return treeTiles;
}

function buildGrid(map: Phaser.Tilemaps.Tilemap): CollisionGrid {
  const grid = createGrid(map.width, map.height);
  const layer = map.getLayer(LAYERS.collision);
  if (!layer) return grid;
  for (const row of layer.data) {
    for (const tile of row) {
      if (tile && tile.index > 0) grid.blocked[tile.y * map.width + tile.x] = 1;
    }
  }
  return grid;
}

/**
 * Builds a Tiled map in the scene: static tile layers, y-sorted furniture,
 * the collision grid and the typed objects.
 */
export function loadMap(scene: Phaser.Scene, id: string): LoadedMap {
  const entry = app.manifest.maps[id];
  if (!entry) throw new Error(`Map "${id}" is not in the asset manifest`);
  const map = scene.make.tilemap({ key: id });

  const tilesets: Phaser.Tilemaps.Tileset[] = [];
  for (const [tiledName, textureKey] of Object.entries(entry.tilesets)) {
    const tileset = map.addTilesetImage(tiledName, textureKey);
    if (tileset) tilesets.push(tileset);
  }

  const staticLayers: [string, number][] = [
    [LAYERS.ground, DEPTH.ground],
    [LAYERS.walls, DEPTH.walls],
    [LAYERS.above, DEPTH.above],
  ];
  for (const [name, depth] of staticLayers) {
    if (map.getLayerIndex(name) === null) continue;
    map.createLayer(name, tilesets, 0, 0)?.setDepth(depth);
  }
  const treeTiles = buildFurniture(scene, map, entry, id);

  const raw = (map.getObjectLayer(LAYERS.objects)?.objects ?? []) as unknown as RawTiledObject[];
  const widthPx = map.widthInPixels;
  const heightPx = map.heightInPixels;

  if (entry.ambientTint) {
    const tint = Phaser.Display.Color.HexStringToColor(entry.ambientTint).color;
    scene.add
      .rectangle(0, 0, widthPx, heightPx, tint)
      .setOrigin(0, 0)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(DEPTH.ambient);
  }

  return { id, entry, widthPx, heightPx, grid: buildGrid(map), objects: parseMapObjects(raw), treeTiles };
}

/**
 * Sets an integer zoom for crisp pixels and bounds the camera to the map,
 * centring maps that are smaller than the view.
 */
export function fitCamera(camera: Phaser.Cameras.Scene2D.Camera, viewW: number, viewH: number, map: LoadedMap): void {
  const zoom = Phaser.Math.Clamp(Math.floor(Math.min(viewW / 480, viewH / 300)), 2, 6);
  camera.setSize(viewW, viewH);
  camera.setZoom(zoom);
  const visibleW = viewW / zoom;
  const visibleH = viewH / zoom;
  const x = map.widthPx < visibleW ? -(visibleW - map.widthPx) / 2 : 0;
  const y = map.heightPx < visibleH ? -(visibleH - map.heightPx) / 2 : 0;
  camera.setBounds(x, y, Math.max(map.widthPx, visibleW), Math.max(map.heightPx, visibleH));
}
