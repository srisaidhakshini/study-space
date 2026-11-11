import {
  DOOR_COLUMNS,
  FEET_ANCHOR,
  HOME_TIERS,
  HOUSES_PER_STREET,
  TILE,
  createGrid,
  defaultLayout,
  homeCollision,
  homeEntryTile,
  homeMapSize,
  type DoorDef,
  type MapObjects,
  type SpawnDef,
  type ZoneDef,
} from '@study/shared';
import type { ServerMap } from './maps';

/**
 * Plain placeholder maps for the home rooms and the residential street, used
 * only when the asset manifest does not contain the real ones yet (the
 * Tiled maps are drawn by the asset generator). They have the same doors,
 * spawns and sizes as the contract in docs/HOMES.md, so the server logic is
 * identical either way; only the pictures are missing.
 */

function toServerMap(id: string, width: number, height: number, collision: ReturnType<typeof createGrid>, objects: MapObjects): ServerMap {
  return {
    id,
    width,
    height,
    collision,
    objects,
    seats: new Map(objects.seats.map((s) => [s.id, s])),
    doors: new Map(objects.doors.map((d) => [d.id, d])),
    spawns: new Map(objects.spawns.map((s) => [s.id, s])),
  };
}

const spawnAt = (id: string, tx: number, ty: number, facing: SpawnDef['facing']): SpawnDef => ({
  id,
  x: Math.round(tx * TILE),
  y: ty * TILE + FEET_ANCHOR.y,
  facing,
});

/** The room of one home tier, empty of furniture. */
export function stubHomeMap(tier: number): ServerMap {
  const layout = { ...defaultLayout(), tier };
  const { tilesW, tilesH } = homeMapSize(tier);
  const entry = homeEntryTile(layout);
  const door: DoorDef = {
    id: 'exit',
    rect: { x: (DOOR_COLUMNS[0] + 1) * TILE, y: (tilesH - 1) * TILE + 4, width: DOOR_COLUMNS.length * TILE, height: 12 },
    targetMap: 'street',
    targetSpawn: 'from-west',
  };
  const zone: ZoneDef = { id: 'home', name: 'Home', rect: { x: 0, y: 0, width: tilesW * TILE, height: tilesH * TILE }, silent: false, subject: '' };
  const objects: MapObjects = {
    seats: [],
    doors: [door],
    spawns: [spawnAt('entrance', entry.tx + 0.5, entry.ty, 'up')],
    zones: [zone],
    lamps: [],
    lights: [],
  };
  return toServerMap(`home_${tier}`, tilesW, tilesH, homeCollision(layout), objects);
}

/** A straight street: houses along the top, a road below, the town to the west and the next street to the east. */
export function stubStreetMap(): ServerMap {
  const width = 40;
  const height = 14;
  const grid = createGrid(width, height);
  const block = (tx: number, ty: number): void => {
    grid.blocked[ty * width + tx] = 1;
  };
  for (let tx = 0; tx < width; tx++) for (let ty = 0; ty < 5; ty++) block(tx, ty);
  for (let tx = 0; tx < width; tx++) block(tx, height - 1);
  for (let ty = 0; ty < height; ty++) {
    block(0, ty);
    block(width - 1, ty);
  }

  const doors: DoorDef[] = [];
  const spawns: SpawnDef[] = [];
  for (let slot = 1; slot <= HOUSES_PER_STREET; slot++) {
    const tx = 2 + (slot - 1) * 3;
    doors.push({
      id: `house-${slot}`,
      rect: { x: tx * TILE, y: 5 * TILE + 2, width: 2 * TILE, height: 12 },
      targetMap: 'street',
      targetSpawn: 'entrance',
    });
    spawns.push(spawnAt(`from-house-${slot}`, tx + 1, 7, 'down'));
  }
  doors.push({ id: 'west', rect: { x: TILE, y: 6 * TILE, width: 12, height: 3 * TILE }, targetMap: 'hub', targetSpawn: 'from-street' });
  doors.push({ id: 'east', rect: { x: (width - 2) * TILE + 4, y: 6 * TILE, width: 12, height: 3 * TILE }, targetMap: 'street', targetSpawn: 'from-west' });
  spawns.push(spawnAt('entrance', 3, 7, 'right'), spawnAt('from-west', 3, 7, 'right'), spawnAt('from-east', width - 4, 7, 'left'));

  const zone: ZoneDef = { id: 'street', name: 'Residential street', rect: { x: 0, y: 0, width: width * TILE, height: height * TILE }, silent: false, subject: '' };
  return toServerMap('street', width, height, grid, { seats: [], doors, spawns, zones: [zone], lamps: [], lights: [] });
}

/** Base map ids the home feature needs. */
export const HOME_BASE_MAP_IDS: readonly string[] = ['street', ...HOME_TIERS.map((t) => `home_${t.tier}`)];

export function stubBaseMap(id: string): ServerMap | null {
  if (id === 'street') return stubStreetMap();
  const match = /^home_(\d)$/.exec(id);
  return match ? stubHomeMap(Number(match[1])) : null;
}
