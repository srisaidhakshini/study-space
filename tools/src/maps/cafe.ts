import { TILE } from '@study/shared';
import type { Tileset } from '../tiles/tileset';
import { MapBuilder } from './builder';

const W = 26;
const H = 20;

const inRect = (x: number, y: number, rx: number, ry: number, rw: number, rh: number): boolean =>
  x >= rx && y >= ry && x < rx + rw && y < ry + rh;

const inRug = (x: number, y: number): boolean => inRect(x, y, 10, 8, 6, 5) || inRect(x, y, 17, 15, 6, 4);

/** The cafe: a counter at the back, window bar stools, cosy tables and a sofa corner. */
export function buildCafe(tiles: Tileset): MapBuilder {
  const m = new MapBuilder(W, H, tiles);

  // Floor: cream and sand checker, with wood planks in the sofa corner.
  m.fill('ground', 0, 0, W, H, (x, y) => {
    if (inRect(x, y, 16, 14, 9, 5)) return (x + y) % 2 === 0 ? 'floor_wood_0' : 'floor_wood_1';
    return (x + y) % 2 === 0 ? 'floor_a' : 'floor_b';
  });

  // Walls.
  m.fill('walls', 0, 0, W, H, 'wall_cap');
  m.fill('walls', 1, 1, W - 2, 1, 'wall_upper');
  m.fill('walls', 1, 2, W - 2, 1, 'wall_lower');
  for (const x of [17, 19, 21, 23]) {
    m.set('walls', x, 1, 'wall_window');
    m.set('walls', x, 2, 'wall_window_sill');
  }
  for (let x = 3; x <= 10; x++) m.set('walls', x, 1, x % 2 === 0 ? 'wall_shelf_cups' : 'wall_shelf_jars');
  m.block('walls', 13, 1, 'chalk', 3, 2);
  m.fill('walls', 1, 3, W - 2, H - 4, () => null);
  m.set('walls', 12, H - 1, 'doorway');
  m.set('walls', 13, H - 1, 'doorway');
  m.set('walls', 12, H - 2, 'mat');
  m.set('walls', 13, H - 2, 'mat');
  m.autotile('walls', 'rug', inRug);

  // Back counter with the espresso machine, till and cakes.
  const counterTops: Record<number, string> = {
    2: 'counter_top_l',
    4: 'counter_cups',
    5: 'counter_till',
    6: 'counter_top_m',
    7: 'counter_cake_a',
    8: 'counter_cake_b',
    9: 'counter_top_m',
    10: 'counter_pastry',
    11: 'counter_top_r',
  };
  for (let x = 2; x <= 11; x++) {
    if (x === 3) {
      m.block('furniture', 3, 2, 'espresso', 1, 2);
    } else {
      m.set('furniture', x, 3, counterTops[x]!);
    }
    m.set('furniture', x, 4, x === 2 ? 'counter_front_l' : x === 11 ? 'counter_front_r' : 'counter_front_m');
  }

  // Window bar with four stools.
  m.set('furniture', 17, 3, 'counter_top_l');
  for (let x = 18; x <= 22; x++) m.set('furniture', x, 3, 'counter_top_m');
  m.set('furniture', 23, 3, 'counter_top_r');
  for (const x of [17, 19, 21, 23]) {
    m.set('furniture', x, 4, 'stool');
    m.seat(x, 4, 'up', 'cafe', 'chair');
  }

  // Small tables with two chairs facing each other across them.
  const tableItems = ['table_cup', 'table_flower', 'table_cake'];
  let n = 0;
  const pair = (x: number, y: number): void => {
    m.set('furniture', x, y, 'chair_right');
    m.set('furniture', x + 1, y, tableItems[n++ % tableItems.length]!);
    m.set('furniture', x + 2, y, 'chair_left');
    m.seat(x, y, 'right', 'cafe', 'chair');
    m.seat(x + 2, y, 'left', 'cafe', 'chair');
  };
  for (const [x, y] of [[2, 8], [6, 8], [2, 12], [6, 12], [18, 8], [18, 12]] as const) pair(x, y);

  // Two tables on the central rug, chairs above and below.
  for (const x of [11, 14]) {
    m.set('furniture', x, 9, 'chair_g_down');
    m.set('furniture', x, 10, tableItems[n++ % tableItems.length]!);
    m.set('furniture', x, 11, 'chair_g_up');
    m.seat(x, 9, 'down', 'cafe', 'chair');
    m.seat(x, 11, 'up', 'cafe', 'chair');
  }

  // Sofa corner: a two-seat sofa, a coffee table and two armchairs.
  m.set('furniture', 19, 15, 'sofa_back_l');
  m.set('furniture', 20, 15, 'sofa_back_r');
  m.set('furniture', 19, 16, 'sofa_seat_l');
  m.set('furniture', 20, 16, 'sofa_seat_r');
  m.seat(19, 16, 'down', 'cafe', 'bench');
  m.seat(20, 16, 'down', 'cafe', 'bench');
  m.set('furniture', 19, 17, 'coffee_table_l');
  m.set('furniture', 20, 17, 'coffee_table_r');
  m.set('furniture', 18, 17, 'armchair_right');
  m.set('furniture', 21, 17, 'armchair_left');
  m.seat(18, 17, 'right', 'cafe', 'chair');
  m.seat(21, 17, 'left', 'cafe', 'chair');

  // Plants in the corners.
  for (const [x, y] of [[12, 3], [1, 6], [24, 6], [1, 17], [24, 17]] as const) m.block('furniture', x, y, 'plant', 1, 2);

  // Pendant lamps hang over the wall rows.
  for (const x of [5, 9, 18, 20, 22]) m.set('above', x, 2, 'pendant');

  m.zone('cafe', 'Cafe', 0, 0, W, H, false);
  m.zone('cafe-counter', 'Counter', 2, 5, 10, 2, false);
  m.spawn('entrance', 13, H - 3, 'up');
  m.door('to-hub', 12 * TILE, (H - 1) * TILE + 4, 2 * TILE, 12, 'hub', 'from-cafe');
  return m;
}
