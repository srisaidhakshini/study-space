import { TILE } from '@study/shared';
import { makeRng } from '../png';
import type { Tileset } from '../tiles/tileset';
import { MapBuilder } from './builder';

const W = 30;
const H = 23;

const inCarpet = (x: number, y: number): boolean => (x === 14 || x === 15) && y >= 3 && y <= 20;

const WINDOWS = [4, 9, 20, 25];

/** The library: four subject corners of desks, shelves along the walls, all silent. */
export function buildLibrary(tiles: Tileset): MapBuilder {
  const m = new MapBuilder(W, H, tiles);
  const rand = makeRng(77);

  m.fill('ground', 0, 0, W, H, (_x, y) => (y % 2 === 0 ? 'floor_0' : 'floor_1'));

  m.fill('walls', 0, 0, W, 1, 'wall_top');
  m.fill('walls', 1, 1, W - 2, 1, 'wall_upper');
  m.fill('walls', 1, 2, W - 2, 1, 'wall_lower');
  for (const x of WINDOWS) {
    m.set('walls', x, 1, 'wall_window');
    m.set('walls', x, 2, 'wall_window_sill');
  }
  m.set('walls', 14, 1, 'wall_clock');
  m.set('walls', 15, 1, 'wall_quiet');
  m.fill('walls', 0, 0, 1, H, 'wall_top');
  m.fill('walls', W - 1, 0, 1, H, 'wall_top');
  m.fill('walls', 0, H - 1, W, 1, (x) => (x === 14 || x === 15 ? 'doorway' : 'wall_top'));

  m.autotile('walls', 'carpet', inCarpet);
  m.set('walls', 14, 21, 'mat');
  m.set('walls', 15, 21, 'mat');

  const shelves = (from: number, to: number, topRow: number): void => {
    for (let x = from; x <= to; x++) m.block('furniture', x, topRow, `shelf_${Math.floor(rand() * 3)}`, 1, 2);
  };
  shelves(2, 12, 2);
  shelves(17, 27, 2);
  for (const from of [3, 9, 17, 23]) shelves(from, from + 3, 11);
  for (const [x, y] of [[1, 2], [28, 2], [1, 20], [28, 20]] as const) m.block('furniture', x, y, 'plant', 1, 2);

  /** Four desks: a row of chairs facing the camera, two rows of desk, a row facing away. */
  const deskBlock = (x0: number, y0: number, zoneId: string): void => {
    for (let i = 0; i < 4; i++) {
      const x = x0 + i;
      const end = i === 0 ? 'l' : i === 3 ? 'r' : 'm';
      const back = end === 'm' ? (rand() < 0.5 ? 'desk_back_m_book' : 'desk_back_m_paper') : `desk_back_${end}`;
      const front = end === 'm' && rand() < 0.5 ? 'desk_front_m_book' : `desk_front_${end}`;
      m.set('furniture', x, y0, 'chair_down');
      m.set('furniture', x, y0 + 1, back);
      m.set('furniture', x, y0 + 2, front);
      m.set('furniture', x, y0 + 3, 'chair_up');
      const far = m.seat(x, y0, 'down', zoneId, 'chair');
      m.seat(x, y0 + 3, 'up', zoneId, 'chair');
      // One lamp per desk column, at the back, lit by the seat facing it.
      if (i % 2 === 0) m.lamp(x * TILE + 8, (y0 + 1) * TILE + 6, far);
    }
  };
  for (const x0 of [3, 9]) {
    deskBlock(x0, 6, 'lib-math');
    deskBlock(x0, 15, 'lib-languages');
  }
  for (const x0 of [17, 23]) {
    deskBlock(x0, 6, 'lib-science');
    deskBlock(x0, 15, 'lib-arts');
  }

  m.zone('library', 'Library', 0, 0, W, H, true);
  m.zone('lib-math', 'Math corner', 2, 4, 12, 7, true, 'math');
  m.zone('lib-science', 'Science corner', 16, 4, 12, 7, true, 'science');
  m.zone('lib-languages', 'Languages corner', 2, 13, 12, 8, true, 'languages');
  m.zone('lib-arts', 'Arts corner', 16, 13, 12, 8, true, 'art');

  m.spawn('entrance', 15, 20, 'up');
  m.door('to-hub', 14 * TILE, 22 * TILE + 4, 2 * TILE, 12, 'hub', 'library-door');
  return m;
}
