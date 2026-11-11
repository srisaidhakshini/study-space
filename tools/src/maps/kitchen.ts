import { TILE } from '@study/shared';
import type { Tileset } from '../tiles/tileset';
import { MapBuilder } from './builder';

const W = 22;
const H = 18;

const inRect = (x: number, y: number, rx: number, ry: number, rw: number, rh: number): boolean =>
  x >= rx && y >= ry && x < rx + rw && y < ry + rh;

/** The common room: a kitchenette and dining table on the left, a lounge on the right. */
export function buildKitchen(tiles: Tileset): MapBuilder {
  const m = new MapBuilder(W, H, tiles);

  // Floor: pale tile in the kitchenette, wood everywhere else.
  m.fill('ground', 0, 0, W, H, (x, y) => {
    if (inRect(x, y, 1, 3, 9, 7)) return (x + y) % 2 === 0 ? 'floor_tile_a' : 'floor_tile_b';
    return (x + y) % 2 === 0 ? 'floor_wood_0' : 'floor_wood_1';
  });

  // Walls and wall decor.
  m.fill('walls', 0, 0, W, H, 'wall_cap');
  m.fill('walls', 1, 1, W - 2, 1, 'wall_upper');
  m.fill('walls', 1, 2, W - 2, 1, 'wall_lower');
  m.fill('walls', 1, 3, W - 2, H - 4, () => null);
  for (let x = 2; x <= 8; x++) {
    m.set('walls', x, 1, x === 4 ? 'wall_hood' : 'wall_cabinet');
    m.set('walls', x, 2, 'wall_splash');
  }
  m.block('walls', 10, 1, 'notice', 2, 2);
  for (const x of [13, 17]) {
    m.set('walls', x, 1, 'wall_window');
    m.set('walls', x, 2, 'wall_window_sill');
  }
  m.set('walls', 14, 1, 'wall_frame');
  m.set('walls', 15, 1, 'wall_clock');
  m.set('walls', 10, H - 1, 'doorway');
  m.set('walls', 11, H - 1, 'doorway');
  m.set('walls', 10, H - 2, 'mat');
  m.set('walls', 11, H - 2, 'mat');
  m.autotile('walls', 'rug', (x, y) => inRect(x, y, 12, 6, 7, 6));

  // Kitchenette: fridge, then a run of counters against the wall.
  m.block('furniture', 1, 2, 'fridge', 1, 2);
  const run = ['sink', 'plates', 'stove', 'kettle', 'plain', 'toaster', 'micro'];
  run.forEach((item, i) => m.set('furniture', 2 + i, 3, `counter_${item}`));
  m.block('furniture', 9, 2, 'bookcase', 1, 2);

  // Dining table with a chair on every side.
  m.set('furniture', 3, 8, 'dtable_l');
  m.set('furniture', 4, 8, 'dtable_m');
  m.set('furniture', 5, 8, 'dtable_r');
  for (const x of [3, 4, 5]) {
    m.set('furniture', x, 7, 'chair_down');
    m.set('furniture', x, 9, 'chair_up');
    m.seat(x, 7, 'down', 'kitchen', 'chair');
    m.seat(x, 9, 'up', 'kitchen', 'chair');
  }
  m.set('furniture', 2, 8, 'chair_right');
  m.set('furniture', 6, 8, 'chair_left');
  m.seat(2, 8, 'right', 'kitchen', 'chair');
  m.seat(6, 8, 'left', 'kitchen', 'chair');

  // Lounge: a television, a coffee table, a four-seat sofa and two armchairs.
  m.block('furniture', 14, 2, 'tv', 2, 2);
  m.set('furniture', 14, 7, 'coffee_table_l');
  m.set('furniture', 15, 7, 'coffee_table_r');
  m.set('furniture', 13, 10, 'sofa_up_l');
  m.set('furniture', 14, 10, 'sofa_up_m');
  m.set('furniture', 15, 10, 'sofa_up_m');
  m.set('furniture', 16, 10, 'sofa_up_r');
  for (let x = 13; x <= 16; x++) m.seat(x, 10, 'up', 'kitchen', 'bench');
  for (const x of [11, 18]) {
    m.set('furniture', x, 8, 'armchair_up');
    m.seat(x, 8, 'up', 'kitchen', 'chair');
  }

  // A card table by the window side of the lounge.
  m.set('furniture', 13, 14, 'dtable_l');
  m.set('furniture', 14, 14, 'dtable_m');
  m.set('furniture', 15, 14, 'dtable_r');
  for (const x of [13, 14, 15]) {
    m.set('furniture', x, 13, 'chair_down');
    m.set('furniture', x, 15, 'chair_up');
    m.seat(x, 13, 'down', 'kitchen', 'chair');
    m.seat(x, 15, 'up', 'kitchen', 'chair');
  }

  // Reading nook: two bookcases against the wall and armchairs facing them.
  m.block('furniture', 1, 11, 'bookcase', 1, 2);
  m.block('furniture', 1, 13, 'bookcase', 1, 2);
  for (const y of [12, 14]) {
    m.set('furniture', 3, y, 'armchair_left');
    m.seat(3, y, 'left', 'kitchen', 'chair');
  }
  m.block('furniture', 19, 2, 'snacks', 1, 2);
  for (const [x, y] of [[20, 3], [20, 15], [7, 12]] as const) m.block('furniture', x, y, 'plant', 1, 2);

  m.zone('kitchen', 'Common Room', 0, 0, W, H, false);
  m.zone('kitchen-nook', 'Kitchenette', 1, 3, 9, 7, false);
  m.zone('kitchen-lounge', 'Lounge', 10, 4, 11, 13, false);
  m.spawn('entrance', 11, H - 3, 'up');
  m.door('to-hub', 10 * TILE, (H - 1) * TILE + 4, 2 * TILE, 12, 'hub', 'from-kitchen');
  return m;
}
