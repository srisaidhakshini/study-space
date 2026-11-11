import { TILE } from '@study/shared';
import { makeRng } from '../png';
import { ensureGlass, NEIGHBOURS, type Shade } from '../tiles/dome';
import type { Tileset } from '../tiles/tileset';
import { MapBuilder } from './builder';
import { verifyArea } from './verifyWorld';

const W = 30;
const H = 22;
/** Last row of dome floor; the hull row sits below it. */
const BASE = 19;

/** Footprint of the dome: a rounded half-oval standing on the seabed. */
const inDome = (x: number, y: number): boolean => {
  if (y > BASE || y < 0 || x < 0 || x >= W) return false;
  const dx = Math.abs(x + 0.5 - W / 2) / 14;
  const dy = (BASE + 0.5 - (y + 0.5)) / 17.5;
  return dx ** 3 + dy ** 3 <= 1;
};

/** Cells whose neighbours are all dome (or the hull below) can be walked on. */
const sea = (x: number, y: number): boolean => !inDome(x, y) && !(y === BASE + 1 && inDome(x, BASE));
const openFloor = (x: number, y: number): boolean => inDome(x, y) && NEIGHBOURS.every(([dx, dy]) => !sea(x + dx, y + dy));

const shadeAt = (y: number): Shade => (y < 8 ? 'a' : y < 15 ? 'b' : 'c');

/** The glass dome: study pods in two arcs, a reading nook, an aquarium and a hatch home. */
export function buildDome(tiles: Tileset): MapBuilder {
  const m = new MapBuilder(W, H, tiles);
  const rand = makeRng(909);

  // Water, seabed and surface.
  m.fill('ground', 0, 0, W, H, (x, y) => {
    if (y === 0) return `surface_${x % 2}`;
    if (y >= BASE + 1 || (y >= 18 && !inDome(x, y))) return `sand_${(x + y) % 2}`;
    return `sea_${shadeAt(y)}_${rand() < 0.5 ? 0 : 1}`;
  });

  // The floor: metal near the glass, wood inside.
  for (let y = 0; y <= BASE; y++) {
    for (let x = 0; x < W; x++) {
      if (!inDome(x, y)) continue;
      if (!openFloor(x, y)) {
        const mask = NEIGHBOURS.reduce((bits, [dx, dy], i) => (sea(x + dx, y + dy) ? bits | (1 << i) : bits), 0);
        m.set('ground', x, y, ensureGlass(tiles, shadeAt(y), mask));
        continue;
      }
      const nearGlass = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => !openFloor(x + dx, y + dy) && !(y + dy > BASE)));
      m.set('ground', x, y, `${nearGlass ? 'metal' : 'wood'}_${(x + y) % 2}`);
    }
  }
  for (let x = 0; x < W; x++) if (inDome(x, BASE)) m.set('walls', x, BASE + 1, 'hull');

  /** True when the whole box is open dome floor with nothing on it yet. */
  const free = (x: number, y: number, w: number, h: number): boolean => {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (!openFloor(xx, yy) || !m.isEmpty('furniture', xx, yy) || !m.isEmpty('walls', xx, yy)) return false;
      }
    }
    return true;
  };
  const need = (x: number, y: number, w: number, h: number, what: string): void => {
    if (!free(x, y, w, h)) throw new Error(`Dome: no room for ${what} at (${x}, ${y})`);
  };

  // Study pods. The north arc faces south, the south arc faces north.
  const pod = (x: number, deskY: number, chairY: number, facing: 'up' | 'down', zone: string): void => {
    need(x, deskY, 1, 1, 'pod desk');
    need(x, chairY, 1, 1, 'pod chair');
    m.set('furniture', x, deskY, 'pod_desk');
    m.set('furniture', x, chairY, facing === 'up' ? 'pod_chair_up' : 'pod_chair_down');
    const seat = m.seat(x, chairY, facing, zone, 'chair');
    m.lamp(x * TILE + 8, deskY * TILE + 9, seat);
  };
  for (const [x, y] of [[7, 9], [9, 7], [11, 6], [13, 5], [16, 5], [18, 6], [20, 7], [22, 9]] as const) pod(x, y, y + 1, 'up', 'dome-study');
  for (const x of [4, 6, 8, 10, 19, 21, 23, 25]) pod(x, 18, 17, 'down', 'dome-study-s');

  // Aquarium wall on the west side with beanbags in front of it.
  need(3, 11, 6, 3, 'aquarium');
  m.block('furniture', 3, 11, 'tank', 6, 3);
  for (const [x, bean] of [[4, 'bean_coral'], [7, 'bean_gold']] as const) {
    need(x, 15, 1, 1, 'beanbag');
    m.set('furniture', x, 15, bean);
    m.seat(x, 15, 'up', 'dome', 'bench');
  }

  // Reading nook on the east side: bookshelves, a rug and beanbags.
  for (const x of [22, 23, 24, 25]) {
    need(x, 11, 1, 2, 'shelf');
    m.block('furniture', x, 11, `shelf_${x % 3}`, 1, 2);
  }
  for (const [x, bean] of [[22, 'bean_teal'], [25, 'bean_coral']] as const) {
    need(x, 14, 1, 1, 'beanbag');
    m.set('furniture', x, 14, bean);
    m.seat(x, 14, 'up', 'dome', 'bench');
  }

  m.autotile('walls', 'rug', (x, y) => x >= 21 && x <= 26 && y >= 13 && y <= 15 && openFloor(x, y));

  // Bubble vents, planters and the hatch home.
  for (const [x, y] of [[12, 12], [17, 13], [14, 9]] as const) {
    need(x, y, 1, 1, 'vent');
    m.set('walls', x, y, 'vent');
    m.set('above', x, y - 2, 'bubbles:0:0');
    m.set('above', x, y - 1, 'bubbles:0:1');
  }
  for (const [x, y] of [[13, 7], [16, 7], [3, 16], [26, 16]] as const) {
    need(x, y, 1, 2, 'planter');
    m.block('furniture', x, y, 'planter', 1, 2);
  }
  m.block('walls', 14, 16, 'hatch', 2, 2);

  // Scenery out in the water, over open sea cells.
  const seaFree = (x: number, y: number, w: number, h: number): boolean => {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (xx >= W || yy >= H || !sea(xx, yy) || inDome(xx, yy) || !m.isEmpty('walls', xx, yy) || m.isEmpty('ground', xx, yy)) return false;
      }
    }
    return true;
  };
  const scenery: [string, number, number, number][] = [
    ['kelp_b', 2, 3, 3], ['kelp_a', 1, 3, 3], ['coral_a', 2, 2, 3], ['coral_b', 2, 2, 3], ['rock', 2, 1, 1],
    ['school', 3, 1, 1], ['school_b', 3, 1, 1],
  ];
  const attempts: [string, number, number][] = [
    ['kelp_b', 0, 18], ['kelp_a', 0, 15], ['coral_a', 0, 19], ['coral_b', 26, 19], ['kelp_a', 28, 15], ['kelp_b', 24, 18],
    ['school', 1, 3], ['school_b', 24, 3], ['school', 22, 1], ['school_b', 3, 1], ['rock', 3, 21], ['rock', 10, 21], ['rock', 18, 21], ['rock', 25, 21],
    ['coral_a', 6, 20], ['coral_b', 20, 20], ['kelp_a', 10, 20], ['kelp_a', 18, 20], ['school_b', 0, 8], ['school', 27, 10],
    ['kelp_b', 12, 19], ['coral_a', 14, 20],
  ];
  for (const [name, x, y] of attempts) {
    const def = scenery.find((s) => s[0] === name)!;
    // Plants stand on the seabed: anchor their top so the base meets row 21.
    const top = def[3] === 3 ? Math.min(y, H - 3) : def[3] === 2 ? Math.min(y, H - 2) : y;
    if (seaFree(x, top, def[1], def[2])) m.block('walls', x, top, name, def[1], def[2]);
  }

  m.zone('dome', 'Glass Dome', 0, 0, W, H, false);
  m.zone('dome-study', 'Study Pods', 5, 4, 20, 7, true);
  m.zone('dome-study-s', 'Study Pods', 2, 16, 11, 4, true);
  m.zone('dome-study-s2', 'Study Pods', 17, 16, 11, 4, true);
  m.spawn('entrance', 15, 15, 'down');
  m.door('to-portal', 14 * TILE, 16 * TILE, 2 * TILE, 2 * TILE, 'portal', 'from-dome');
  verifyArea('dome', m);
  return m;
}
