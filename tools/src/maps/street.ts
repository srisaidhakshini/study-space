import { HOUSES_PER_STREET, TILE } from '@study/shared';
import { makeRng } from '../png';
import { HOUSE_COLOURS } from '../tiles/street';
import type { Tileset } from '../tiles/tileset';
import { MapBuilder } from './builder';

const W = 60;
const H = 31;

/** Rows of the street, top to bottom. Doors face south onto the road or the promenade. */
const NORTH = { roof: 3, doorRow: 8, front: 9, fence: 10 };
const SOUTH = { roof: 18, doorRow: 23, front: 24, fence: 25 };
const WALK_N = [11, 12] as const;
const ROAD_TOP = 13;
const ROAD_ROWS = 4;
const WALK_MID = 17;
const WALK_S = [26, 27] as const;

const HOUSE_W = 6;
const FIRST_X = 6;
const SPACING = 8;

interface HouseSlot {
  number: number;
  x: number;
  side: typeof NORTH;
}

function slots(): HouseSlot[] {
  const out: HouseSlot[] = [];
  for (let i = 0; i < HOUSES_PER_STREET / 2; i++) out.push({ number: i + 1, x: FIRST_X + i * SPACING, side: NORTH });
  for (let i = 0; i < HOUSES_PER_STREET / 2; i++) out.push({ number: HOUSES_PER_STREET / 2 + i + 1, x: FIRST_X + i * SPACING, side: SOUTH });
  return out;
}

function house(m: MapBuilder, slot: HouseSlot): void {
  const k = (slot.number - 1) % HOUSE_COLOURS.length;
  const { x, side } = slot;
  const last = x + HOUSE_W - 1;
  const wallTop = side.roof + 3;
  for (let tx = x; tx <= last; tx++) {
    const col = tx === x ? 'l' : tx === last ? 'r' : 'm';
    const edge = tx === x ? '_l' : tx === last ? '_r' : '';
    m.set('walls', tx, side.roof, `st_roof_${k}_t${col}`);
    m.set('walls', tx, side.roof + 1, `st_roof_${k}_m${col}`);
    m.set('walls', tx, side.roof + 2, `st_roof_${k}_b${col}`);
    // Top wall row stays plain so the client can draw a name plate over the door.
    m.set('walls', tx, wallTop, `st_wall${edge}_${k}`);
    m.set('walls', tx, wallTop + 1, tx === x + 1 || tx === last - 1 ? `st_win_${k}` : `st_wall${edge}_${k}`);
    m.set('walls', tx, wallTop + 2, `st_base${edge}_${k}`);
  }
  const doorX = x + 2;
  m.block('walls', doorX, side.doorRow - 1, 'door', 2, 2);

  // Front garden: a path from the door through a gap in the fence.
  for (let tx = x; tx <= last; tx++) {
    const onPath = tx === doorX || tx === doorX + 1;
    if (onPath) {
      m.set('ground', tx, side.front, 'st_gpath');
      m.set('ground', tx, side.fence, 'st_gpath');
    } else {
      m.set('furniture', tx, side.fence, 'st_fence');
    }
  }
  m.set('walls', x, side.front, 'flowers_1');
  m.set('walls', x + 1, side.front, 'flowers_0');
  m.set('furniture', x + 4, side.front, 'st_mailbox');
  m.set('furniture', x + 5, side.front, 'bush');

  m.door(`house-${slot.number}`, doorX * TILE, side.doorRow * TILE, 2 * TILE, 12, '', '');
  m.spawn(`from-house-${slot.number}`, doorX + 1, side.front, 'down');
}

/** The residential street: twelve numbered houses along a road, two benches parks and a gate at each end. */
export function buildStreet(tiles: Tileset): MapBuilder {
  const m = new MapBuilder(W, H, tiles);
  const rand = makeRng(5150);

  m.fill('ground', 0, 0, W, H, () => {
    const r = rand();
    return r < 0.62 ? 'grass_0' : r < 0.84 ? 'grass_1' : r < 0.94 ? 'grass_2' : 'grass_3';
  });

  // Pavement, road and promenade.
  const pave = (x: number, y: number): string => ((x + y) % 3 === 0 ? 'st_pave_1' : 'st_pave_0');
  m.fill('ground', 0, WALK_N[0], W, 2, (x, y) => pave(x, y));
  m.fill('ground', 0, ROAD_TOP, W, 1, 'st_curb_n');
  m.fill('ground', 0, ROAD_TOP + 1, W, 1, (x) => (x % 2 === 0 ? 'st_road_dash' : 'st_road'));
  m.fill('ground', 0, ROAD_TOP + 2, W, 1, (x) => (x % 2 === 0 ? 'st_road_dash_b' : 'st_road'));
  m.fill('ground', 0, ROAD_TOP + ROAD_ROWS - 1, W, 1, 'st_curb_s');
  m.fill('ground', 0, WALK_MID, W, 1, (x, y) => pave(x, y));
  m.fill('ground', 2, WALK_S[0], W - 4, 2, (x, y) => pave(x, y));
  // Narrow corridors down the sides link the road to the south promenade.
  m.fill('ground', 2, WALK_MID + 1, 2, WALK_S[0] - WALK_MID - 1, (x, y) => pave(x, y));
  m.fill('ground', W - 4, WALK_MID + 1, 2, WALK_S[0] - WALK_MID - 1, (x, y) => pave(x, y));

  for (const slot of slots()) house(m, slot);

  // Side yards between and beside the houses: trees above, a lamp post and a bush on the fence line.
  const gaps: number[] = [];
  for (let i = 0; i < HOUSES_PER_STREET / 2 - 1; i++) gaps.push(FIRST_X + i * SPACING + HOUSE_W);
  for (const gx of gaps) {
    for (const side of [NORTH, SOUTH]) {
      m.block('furniture', gx, side.roof, 'tree', 2, 3);
      m.block('furniture', gx, side.front, 'lamppost', 1, 2);
      m.set('furniture', gx + 1, side.fence, 'bush');
      m.set('walls', gx + 1, side.front, 'flowers_1');
    }
  }
  const lastGap = FIRST_X + (HOUSES_PER_STREET / 2 - 1) * SPACING + HOUSE_W;
  for (const side of [NORTH, SOUTH]) {
    for (const gx of side === NORTH ? [lastGap, 54] : [lastGap]) m.block('furniture', gx, side.roof, 'tree', 2, 3);
    for (const gx of [2, 4]) if (side === NORTH) m.block('furniture', gx, side.roof, 'tree', 2, 3);
    m.set('furniture', lastGap, side.fence, 'bush');
    m.set('furniture', lastGap + 1, side.fence, 'bush');
  }
  for (const gx of [2, 4, 56]) m.block('furniture', gx, NORTH.roof, 'tree', 2, 3);
  // Seal the north yards at x = 2..5 and 54..57 below the trees.
  for (const x of [2, 3, 4, 5, 54, 55, 56, 57]) {
    m.set('furniture', x, NORTH.front, 'bush');
    m.set('furniture', x, NORTH.fence, 'bush');
  }

  // Borders: a row of trees along the top and the bottom, and at both sides outside the road gates.
  for (let x = 0; x < W; x += 2) {
    m.block('furniture', x, 0, 'tree', 2, 3);
    m.block('furniture', x, 28, 'tree', 2, 3);
  }
  for (const x of [0, W - 2]) {
    for (const y of [3, 6]) m.block('furniture', x, y, 'tree', 2, 3);
    for (const y of [9, 10]) {
      m.set('furniture', x, y, 'bush');
      m.set('furniture', x + 1, y, 'bush');
    }
    for (const y of [18, 21, 24]) m.block('furniture', x, y, 'tree', 2, 3);
    m.set('furniture', x, 27, 'bush');
    m.set('furniture', x + 1, 27, 'bush');
  }

  // Pocket parks beside the corridors.
  for (const px of [4, 54]) {
    m.block('furniture', px, 19, 'bench_down', 2, 1);
    m.seat(px, 19, 'down', 'street', 'bench');
    m.seat(px + 1, 19, 'down', 'street', 'bench');
    m.block('furniture', px, 23, 'bench_up', 2, 1);
    m.seat(px, 23, 'up', 'street', 'bench');
    m.seat(px + 1, 23, 'up', 'street', 'bench');
    m.set('walls', px, 21, 'flowers_0');
    m.set('walls', px + 1, 21, 'flowers_1');
    m.set('walls', px, 22, 'flowers_1');
    m.set('walls', px + 1, 22, 'flowers_0');
    m.set('furniture', px, 18, 'bush');
    m.set('furniture', px + 1, 18, 'bush');
  }

  // Gates at the two ends of the road. Their targets depend on the street page, so the server decides.
  m.door('west', 0, ROAD_TOP * TILE, 2 * TILE, ROAD_ROWS * TILE, '', '');
  m.door('east', (W - 2) * TILE, ROAD_TOP * TILE, 2 * TILE, ROAD_ROWS * TILE, '', '');
  m.spawn('entrance', 3, ROAD_TOP + 1, 'right');
  m.spawn('from-west', 3, ROAD_TOP + 2, 'right');
  m.spawn('from-east', W - 3, ROAD_TOP + 1, 'left');

  m.zone('street', 'Residential Street', 0, 0, W, H, false);
  return m;
}
