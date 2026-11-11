import {
  TILE,
  WALL_ROWS,
  defaultLayout,
  getTier,
  homeCollision,
  homeEntryTile,
  homeMapSize,
} from '@study/shared';
import type { Tileset } from '../tiles/tileset';
import { MapBuilder } from './builder';

/**
 * The empty room of one home tier. Coordinates are described in
 * shared/src/home.ts: room column x is map tile x + 1; the back wall is rows
 * 0..2; the door is at the bottom-left (map tiles 1..2 of the last row).
 * There are no seats and no furniture: those come from the owner's layout.
 */
export function buildHomeMap(tiles: Tileset, tier: number): MapBuilder {
  const t = getTier(tier);
  const { tilesW, tilesH } = homeMapSize(t.tier);
  const m = new MapBuilder(tilesW, tilesH, tiles);

  m.fill('ground', 1, WALL_ROWS, t.floorW, t.floorH, 'hm_floor');
  for (let tx = 1; tx < tilesW - 1; tx++) {
    m.set('walls', tx, 0, 'hm_wall_a');
    m.set('walls', tx, 1, 'hm_wall_b');
    m.set('walls', tx, 2, 'hm_wall_c');
  }
  for (let ty = 0; ty < tilesH; ty++) {
    m.set('walls', 0, ty, 'hm_side_l');
    m.set('walls', tilesW - 1, ty, 'hm_side_r');
  }
  for (let tx = 1; tx < tilesW - 1; tx++) m.set('walls', tx, tilesH - 1, 'hm_bottom');
  m.block('walls', 1, tilesH - 1, 'hm_door', 2, 1);

  const entryTile = homeEntryTile({ ...defaultLayout(), tier: t.tier });
  // Arrive just inside the door (between its two tiles), facing into the room.
  m.spawn('entrance', entryTile.tx + 1, entryTile.ty, 'up');
  // Dynamic door: the server replaces the target with the real street page and house.
  m.door('exit', 1 * TILE, (tilesH - 1) * TILE, 2 * TILE, 12, 'street', 'from-house-1');
  m.zone('home', 'Home', 1, WALL_ROWS, t.floorW, t.floorH, false);

  assertCollisionMatches(m, t.tier);
  return m;
}

/** The generated collision layer must equal the shared rule the server and client use. */
function assertCollisionMatches(m: MapBuilder, tier: number): void {
  const tiled = m.toTiled('x') as { layers: { name: string; data?: number[] }[] };
  const data = tiled.layers.find((l) => l.name === 'collision')!.data!;
  const expected = homeCollision({ ...defaultLayout(), tier }).blocked;
  for (let i = 0; i < expected.length; i++) {
    if ((data[i]! > 0 ? 1 : 0) !== expected[i]) {
      const w = homeMapSize(tier).tilesW;
      throw new Error(`home_${tier}: collision differs from homeCollision at tile ${i % w},${Math.floor(i / w)}`);
    }
  }
}
