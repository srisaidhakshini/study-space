import { TILE } from '@study/shared';
import { makeRng } from '../png';
import type { Tileset } from '../tiles/tileset';
import { MapBuilder } from './builder';

const W = 40;
const H = 30;

const inRect = (x: number, y: number, rx: number, ry: number, rw: number, rh: number): boolean =>
  x >= rx && y >= ry && x < rx + rw && y < ry + rh;

interface Building {
  id: string;
  /** Left edge and top row of the roof. */
  x: number;
  y: number;
  w: number;
  roofRows: number;
  /** Wall rows below the roof; the last one is the stone base. */
  wallRows: number;
  /** Left column of the 2x2 door, which fills the bottom two wall rows. */
  doorX: number;
  windows: number[];
  plaqueX?: number;
  awning?: boolean;
}

const LIBRARY: Building = { id: 'library', x: 13, y: 2, w: 14, roofRows: 4, wallRows: 3, doorX: 19, windows: [15, 17, 22, 24], plaqueX: 18, awning: true };
const CAFE: Building = { id: 'cafe', x: 28, y: 8, w: 8, roofRows: 4, wallRows: 3, doorX: 31, windows: [29, 34], plaqueX: 30, awning: true };
const KITCHEN: Building = { id: 'kitchen', x: 3, y: 8, w: 8, roofRows: 4, wallRows: 3, doorX: 6, windows: [4, 9], plaqueX: 5 };
const GATE: Building = { id: 'garden', x: 30, y: 3, w: 6, roofRows: 2, wallRows: 2, doorX: 32, windows: [] };
const PORTAL: Building = { id: 'portal', x: 28, y: 18, w: 8, roofRows: 4, wallRows: 3, doorX: 31, windows: [29, 34], plaqueX: 30 };

const BUILDINGS = [LIBRARY, CAFE, KITCHEN, GATE, PORTAL];

/** Row of the door's lower half, where the trigger sits. */
const doorRow = (b: Building): number => b.y + b.roofRows + b.wallRows - 1;
/** Row of tiles just outside the door. */
const frontRow = (b: Building): number => doorRow(b) + 1;

const inPlaza = (x: number, y: number): boolean => inRect(x, y, 14, 13, 12, 8);
const inPath = (x: number, y: number): boolean =>
  !inPlaza(x, y) &&
  (inRect(x, y, 19, 9, 2, 18) || // library door to the south end
    inRect(x, y, 3, 16, 37, 2) || // east-west road, out to the riverside
    inRect(x, y, 32, 7, 2, 9) || // garden gate down to the road
    inRect(x, y, 6, 15, 2, 1) || // kitchen door
    inRect(x, y, 31, 15, 2, 1) || // cafe door
    inRect(x, y, 19, 25, 15, 2)); // south road to the portal room
const inDoorway = (x: number, y: number): boolean => BUILDINGS.some((b) => inRect(x, y, b.doorX, doorRow(b), 2, 1));
const inPond = (x: number, y: number): boolean =>
  inRect(x, y, 5, 21, 6, 5) && !((x === 5 || x === 10) && (y === 21 || y === 25));

function building(m: MapBuilder, b: Building): void {
  const last = b.x + b.w - 1;
  const wallTop = b.y + b.roofRows;
  for (let x = b.x; x <= last; x++) {
    const col = x === b.x ? 'l' : x === last ? 'r' : 'm';
    const side = x === b.x ? '_l' : x === last ? '_r' : '';
    for (let r = 0; r < b.roofRows; r++) {
      const row = r === 0 ? 't' : r === b.roofRows - 1 ? 'b' : 'm';
      m.set('walls', x, b.y + r, `roof_${row}${col}`);
    }
    for (let r = 0; r < b.wallRows; r++) {
      m.set('walls', x, wallTop + r, r === b.wallRows - 1 ? `wall_base${side}` : `wall${side}`);
    }
  }
  const windowRow = wallTop + (b.wallRows > 2 ? 1 : 0);
  for (const x of b.windows) m.set('walls', x, windowRow, 'wall_window');
  if (b.plaqueX !== undefined) m.set('walls', b.plaqueX, windowRow, 'wall_plaque');
  m.block('walls', b.doorX, doorRow(b) - 1, 'door', 2, 2);
  if (b.awning) {
    ['awning_0', 'awning_1', 'awning_1', 'awning_2'].forEach((tile, i) =>
      m.set('above', b.doorX - 1 + i, doorRow(b) - 2, tile),
    );
  }
}

/** The hub town: a plaza with a fountain and doors to every other place. */
export function buildHub(tiles: Tileset): MapBuilder {
  const m = new MapBuilder(W, H, tiles);
  const rand = makeRng(2024);

  m.fill('ground', 0, 0, W, H, () => {
    const r = rand();
    return r < 0.62 ? 'grass_0' : r < 0.84 ? 'grass_1' : r < 0.94 ? 'grass_2' : 'grass_3';
  });
  m.fill('ground', 14, 13, 12, 8, (x, y) => ((x * 3 + y) % 4 === 0 ? 'plaza_1' : 'plaza_0'));
  m.autotile('ground', 'path', inPath, (x, y) => inPlaza(x, y) || inDoorway(x, y));
  m.autotile('ground', 'water', inPond);

  for (const b of BUILDINGS) building(m, b);

  // A ring of trees keeps everyone inside the town; gaps are left at the exits.
  for (let x = 0; x < W; x += 2) {
    if (x < 12 || x > 26) m.block('furniture', x, 0, 'tree', 2, 3);
    m.block('furniture', x, 27, 'tree', 2, 3);
  }
  for (let y = 3; y <= 24; y += 3) {
    m.block('furniture', 0, y, 'tree', 2, 3);
    if (y !== 15) m.block('furniture', 38, y, 'tree', 2, 3);
  }
  m.fill('furniture', 12, 0, 16, 2, 'bush');
  for (const [x, y] of [[5, 4], [9, 5], [3, 19], [13, 23], [36, 4], [24, 23]] as const) {
    if (m.isEmpty('furniture', x, y)) m.block('furniture', x, y, 'tree', 2, 3);
  }

  m.fill('furniture', 14, 9, 4, 1, 'bush');
  m.fill('furniture', 22, 9, 4, 1, 'bush');
  m.set('furniture', 18, 10, 'sign');
  m.block('furniture', 19, 16, 'fountain', 2, 2);
  for (const [x, y] of [[13, 11], [26, 11], [13, 20], [26, 20]] as const) m.block('furniture', x, y, 'lamppost', 1, 2);

  const bench = (x: number, y: number, facing: 'down' | 'up'): void => {
    m.block('furniture', x, y, `bench_${facing}`, 2, 1);
    m.seat(x, y, facing, 'hub', 'bench');
    m.seat(x + 1, y, facing, 'hub', 'bench');
  };
  bench(15, 12, 'down');
  bench(23, 12, 'down');
  bench(15, 21, 'up');
  bench(23, 21, 'up');
  bench(7, 19, 'down');

  const open = (x: number, y: number): boolean =>
    !inPlaza(x, y) && !inPath(x, y) && !inPond(x, y) && m.isEmpty('furniture', x, y) && m.isEmpty('walls', x, y);
  for (let i = 0; i < 70; i++) {
    const x = 2 + Math.floor(rand() * 36);
    const y = 3 + Math.floor(rand() * 24);
    if (open(x, y)) m.set('walls', x, y, rand() < 0.5 ? 'flowers_0' : 'flowers_1');
  }
  for (const [x, y] of [[6, 14], [27, 24], [33, 15], [11, 7]] as const) {
    if (open(x, y) && m.isEmpty('walls', x, y)) m.set('furniture', x, y, 'rock');
  }

  m.zone('hub', 'Town Square', 0, 0, W, H, false);
  m.spawn('start', 20, 22, 'down');

  // Doors. Each building's trigger sits on the lower half of its door.
  for (const b of BUILDINGS) {
    m.door(`to-${b.id}`, b.doorX * TILE, doorRow(b) * TILE, 2 * TILE, 12, b.id, 'entrance');
    m.spawn(`from-${b.id}`, b.doorX + 1, frontRow(b), 'down');
  }
  m.spawn('library-door', 20, 9, 'down');
  // The riverside lies off the east end of the road.
  m.door('to-riverside', 38 * TILE, 16 * TILE, 2 * TILE, 2 * TILE, 'riverside', 'entrance');
  m.spawn('from-riverside', 36.5, 16, 'left');
  return m;
}
