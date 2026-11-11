import { TILE } from '@study/shared';
import { makeRng } from '../png';
import type { Tileset } from '../tiles/tileset';
import { MapBuilder } from './builder';
import { verifyArea } from './verifyWorld';

const W = 34;
const H = 24;
const DECK = { x: 8, y: 7, w: 18, h: 7 };

/** Island footprint: a soft-cornered oval, with stray single cells trimmed away. */
function islandMask(): boolean[] {
  const cx = 17;
  const cy = 11.5;
  const mask = new Array<boolean>(W * H).fill(false);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x + 0.5 - cx) / 14.5;
      const dy = Math.abs(y + 0.5 - cy) / 8.5;
      mask[y * W + x] = dx ** 3 + dy ** 3 <= 1;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const at = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x]!;
    const drop: number[] = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!at(x, y)) continue;
        const n = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].filter(Boolean).length;
        if (n < 3) drop.push(y * W + x);
      }
    }
    for (const i of drop) mask[i] = false;
  }
  return mask;
}

/** A floating island: a wooden study deck, a windmill, a swing and a portal gate. */
export function buildSkyIsland(tiles: Tileset): MapBuilder {
  const m = new MapBuilder(W, H, tiles);
  const rand = makeRng(404);
  const mask = islandMask();
  const isle = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x]!;
  const onDeck = (x: number, y: number): boolean => x >= DECK.x && y >= DECK.y && x < DECK.x + DECK.w && y < DECK.y + DECK.h;

  m.fill('ground', 0, 0, W, H, () => (rand() < 0.5 ? 'sky_0' : 'sky_1'));
  m.autotile('ground', 'isle', isle);
  m.fill('ground', DECK.x, DECK.y, DECK.w, DECK.h, (x, y) => ((x + y) % 2 === 0 ? 'deck_0' : 'deck_1'));

  // Cliff faces under every southern rim cell, two or three rows deep.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isle(x, y) || isle(x, y + 1)) continue;
      const v = (x * 7 + y) % 3;
      const deep = (x * 5) % 4 !== 0;
      m.set('walls', x, y + 1, `cliff_top_${v}`);
      m.set('walls', x, y + 2, deep ? `cliff_mid_${v}` : `cliff_end_${v}`);
      if (deep) m.set('walls', x, y + 3, `cliff_tip_${v}`);
    }
  }

  /** True when every cell of the box is island grass with nothing on it yet. */
  const free = (x: number, y: number, w: number, h: number): boolean => {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (!isle(xx, yy) || !m.isEmpty('furniture', xx, yy) || !m.isEmpty('walls', xx, yy) || onDeck(xx, yy)) return false;
      }
    }
    return true;
  };
  const place = (x: number, y: number, name: string, w: number, h: number): void => {
    if (!free(x, y, w, h)) throw new Error(`Sky island: no room for ${name} at (${x}, ${y})`);
    m.block('furniture', x, y, name, w, h);
  };

  // Floating decor in the sky: islets first, then clouds in what is left.
  const sky = (x: number, y: number, w: number, h: number): boolean => {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (xx >= W || yy >= H || isle(xx, yy) || !m.isEmpty('walls', xx, yy)) return false;
      }
    }
    return true;
  };
  for (const [x, y] of [[0, 15], [31, 16], [0, 1], [29, 0]] as const) {
    if (sky(x, y, 3, 3)) m.block('walls', x, y, 'islet', 3, 3);
  }
  const clouds: [number, number, string, number, number][] = [
    [5, 0, 'cloud_b', 3, 2], [12, 0, 'cloud_a', 4, 2], [20, 1, 'cloud_c', 2, 1], [25, 0, 'cloud_b', 3, 2],
    [0, 8, 'cloud_c', 2, 1], [32, 8, 'cloud_c', 2, 1], [1, 12, 'cloud_b', 3, 2], [30, 11, 'cloud_b', 3, 2],
    [4, 20, 'cloud_a', 4, 2], [13, 22, 'cloud_b', 3, 2], [22, 21, 'cloud_a', 4, 2], [28, 21, 'cloud_c', 2, 1],
    [9, 21, 'cloud_c', 2, 1], [18, 22, 'cloud_c', 2, 1],
  ];
  for (const [x, y, name, w, h] of clouds) if (sky(x, y, w, h)) m.block('walls', x, y, name, w, h);

  // Study deck: two blocks of desks, each facing a row of chairs.
  const desks = (x0: number, y0: number): void => {
    for (let i = 0; i < 5; i++) {
      const x = x0 + i;
      const end = i === 0 ? 'l' : i === 4 ? 'r' : 'm';
      const back = end === 'm' ? (i === 2 ? 'desk_back_m_book' : 'desk_back_m_paper') : `desk_back_${end}`;
      m.set('furniture', x, y0, 'chair_down');
      m.set('furniture', x, y0 + 1, back);
      m.set('furniture', x, y0 + 2, `desk_front_${end}`);
      m.set('furniture', x, y0 + 3, 'chair_up');
      const far = m.seat(x, y0, 'down', 'sky-study', 'chair');
      m.seat(x, y0 + 3, 'up', 'sky-study', 'chair');
      if (i % 2 === 0) m.lamp(x * TILE + 8, (y0 + 1) * TILE + 6, far);
    }
  };
  desks(9, 8);
  desks(18, 8);

  // Rails around the deck, with a gap at the north and south.
  for (let x = DECK.x - 1; x <= DECK.x + DECK.w; x++) {
    if (x === 15 || x === 16) continue;
    m.set('furniture', x, DECK.y - 1, 'rail_h');
    m.set('furniture', x, DECK.y + DECK.h, 'rail_h');
  }
  for (let y = DECK.y; y < DECK.y + DECK.h; y++) {
    m.set('furniture', DECK.x - 1, y, 'rail_v');
    m.set('furniture', DECK.x + DECK.w, y, 'rail_v');
  }

  // Portal gate on the south rim.
  m.block('furniture', 16, 15, 'gate', 3, 3);
  m.block('walls', 16, 18, 'gate_pad', 3, 1);

  place(27, 9, 'windmill', 4, 5);
  place(5, 6, 'tree', 2, 3);
  place(21, 3, 'tree', 2, 3);
  place(13, 3, 'lantern', 1, 2);
  place(19, 3, 'lantern', 1, 2);
  place(13, 16, 'lantern', 1, 2);
  place(21, 16, 'lantern', 1, 2);
  place(4, 11, 'swing', 2, 2);
  m.seat(4, 12, 'down', 'skyisland', 'bench');
  m.seat(5, 12, 'down', 'skyisland', 'bench');

  // Bushes along the rim and flowers on open grass.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!free(x, y, 1, 1)) continue;
      const rim = !isle(x - 1, y) || !isle(x + 1, y) || !isle(x, y - 1);
      if (rim && rand() < 0.22 && y < 17) m.set('furniture', x, y, 'bush');
      else if (rand() < 0.1) m.set('walls', x, y, rand() < 0.5 ? 'flowers_0' : 'flowers_1');
    }
  }

  m.zone('skyisland', 'Sky Island', 0, 0, W, H, false);
  m.zone('sky-study', 'Study Deck', DECK.x, DECK.y, DECK.w, DECK.h, true);
  m.spawn('entrance', 17.5, 19, 'up');
  m.door('to-portal', 17 * TILE, 18 * TILE, TILE, TILE, 'portal', 'from-skyisland');
  verifyArea('skyisland', m);
  return m;
}
