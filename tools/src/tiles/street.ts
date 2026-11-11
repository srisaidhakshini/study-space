import { mix, PAL } from '../palette';
import { makeRng, PixelCanvas } from '../png';
import { speckle, type Tileset } from './tileset';

/** Colourways of the street's houses: [roof base, roof dark, roof light, wall]. */
export interface HouseColours {
  roof: string;
  roofDark: string;
  roofLight: string;
  wall: string;
}

export const HOUSE_COLOURS: readonly HouseColours[] = [
  { roof: PAL.brick, roofDark: PAL.wine, roofLight: PAL.coral, wall: '#f5e3b5' },
  { roof: '#5d7fb0', roofDark: '#3f5a86', roofLight: '#8fb0d6', wall: '#e1ecee' },
  { roof: PAL.leafDark, roofDark: PAL.pine, roofLight: PAL.leaf, wall: '#f2d9d0' },
  { roof: PAL.plum, roofDark: '#523a58', roofLight: PAL.lilac, wall: '#dfeacd' },
  { roof: PAL.amber, roofDark: PAL.wood, roofLight: PAL.gold, wall: '#e5daef' },
];

function roofTile(c: PixelCanvas, k: HouseColours, col: 'l' | 'm' | 'r', row: 't' | 'm' | 'b'): void {
  c.rect(0, 0, 16, 16, k.roof);
  for (let y = 3; y < 16; y += 4) {
    c.hline(0, y, 16, k.roofDark);
    const shift = ((y - 3) / 4) % 2 === 0 ? 0 : 4;
    for (let x = shift; x < 16; x += 8) c.vline(x, y - 3, 3, k.roofDark);
    for (let x = shift + 2; x < 16; x += 8) c.set(x, y - 2, k.roofLight);
  }
  if (row === 't') {
    c.hline(0, 0, 16, PAL.ink);
    c.hline(0, 1, 16, mix(k.roofLight, '#ffffff', 0.3));
    c.hline(0, 2, 16, k.roofLight);
  }
  if (row === 'b') {
    c.hline(0, 13, 16, k.roofDark);
    c.hline(0, 14, 16, PAL.cocoa);
    c.hline(0, 15, 16, PAL.ink);
  }
  if (col === 'l') {
    c.vline(0, 0, 16, PAL.ink);
    c.vline(1, 1, 15, k.roofLight);
  }
  if (col === 'r') {
    c.vline(15, 0, 16, PAL.ink);
    c.vline(14, 1, 15, k.roofDark);
  }
}

interface WallParts {
  left?: boolean;
  right?: boolean;
  base?: boolean;
  window?: boolean;
}

function wallTile(c: PixelCanvas, k: HouseColours, parts: WallParts, seed: number): void {
  c.rect(0, 0, 16, 16, k.wall);
  speckle(c, makeRng(seed), 5, mix(k.wall, PAL.sand, 0.5));
  if (parts.window) {
    c.rect(2, 2, 12, 11, PAL.bark);
    c.rect(3, 3, 10, 9, PAL.sky);
    c.vline(7, 3, 9, PAL.bark);
    c.vline(8, 3, 9, PAL.bark);
    c.hline(3, 7, 10, PAL.bark);
    c.set(4, 4, PAL.cream);
    c.set(5, 4, PAL.cream);
    c.rect(1, 13, 14, 2, PAL.wood);
    c.hline(1, 15, 14, mix(k.wall, PAL.ink, 0.25));
  }
  if (parts.base) {
    c.rect(0, 11, 16, 5, PAL.stone);
    c.hline(0, 11, 16, PAL.slate);
    c.vline(5, 12, 4, PAL.slate);
    c.vline(12, 12, 4, PAL.slate);
    c.hline(0, 15, 16, PAL.ink);
  }
  if (parts.left) {
    c.vline(0, 0, 16, PAL.ink);
    c.rect(1, 0, 2, 16, PAL.bark);
  }
  if (parts.right) {
    c.vline(15, 0, 16, PAL.ink);
    c.rect(13, 0, 2, 16, PAL.bark);
  }
}

/**
 * Appends the residential street's tiles to the town tileset (existing tile
 * ids never change): pavement and road, a garden fence and path, a mailbox,
 * and roofs and walls in five colourways.
 */
export function extendTownForStreet(set: Tileset): void {
  set.add('st_pave_0', (c) => {
    c.rect(0, 0, 16, 16, '#d6cdbd');
    const mortar = '#a89f90';
    c.hline(0, 0, 16, mortar);
    c.hline(0, 8, 16, mortar);
    c.vline(0, 0, 8, mortar);
    c.vline(8, 8, 8, mortar);
    c.rect(2, 2, 4, 2, '#e4dccd');
    c.rect(10, 10, 4, 2, '#e4dccd');
    speckle(c, makeRng(401), 6, '#c4baa8');
  });
  set.add('st_pave_1', (c) => {
    c.rect(0, 0, 16, 16, '#d6cdbd');
    const mortar = '#a89f90';
    c.hline(0, 0, 16, mortar);
    c.hline(0, 8, 16, mortar);
    c.vline(4, 0, 8, mortar);
    c.vline(12, 8, 8, mortar);
    c.rect(7, 2, 4, 2, '#e4dccd');
    c.rect(1, 10, 4, 2, '#e4dccd');
    speckle(c, makeRng(402), 6, '#c4baa8');
  });
  const asphalt = (c: PixelCanvas, seed: number): void => {
    c.rect(0, 0, 16, 16, '#6d6873');
    speckle(c, makeRng(seed), 14, '#7b7681');
    speckle(c, makeRng(seed + 1), 10, '#5e5a64');
  };
  set.add('st_road', (c) => asphalt(c, 410));
  set.add('st_road_dash', (c) => {
    asphalt(c, 412);
    c.rect(2, 14, 12, 2, '#e8c96a');
    c.hline(2, 14, 12, '#f4e2a0');
  });
  set.add('st_road_dash_b', (c) => {
    asphalt(c, 414);
    c.rect(2, 0, 12, 2, '#e8c96a');
  });
  // Kerbs: the pavement edge above the road (north) and below it (south).
  set.add('st_curb_n', (c) => {
    asphalt(c, 420);
    c.rect(0, 0, 16, 4, '#a89f90');
    c.hline(0, 0, 16, '#d6cdbd');
    c.hline(0, 3, 16, '#6e6659');
    c.hline(0, 4, 16, '#58535e');
  });
  set.add('st_curb_s', (c) => {
    asphalt(c, 430);
    c.rect(0, 12, 16, 4, '#a89f90');
    c.hline(0, 12, 16, '#d6cdbd');
    c.hline(0, 15, 16, '#6e6659');
    c.hline(0, 11, 16, '#58535e');
  });
  set.add('st_gpath', (c) => {
    c.rect(0, 0, 16, 16, PAL.sand);
    speckle(c, makeRng(440), 8, PAL.paper);
    speckle(c, makeRng(441), 6, PAL.tan);
    c.vline(0, 0, 16, mix(PAL.sand, PAL.wood, 0.3));
    c.vline(15, 0, 16, mix(PAL.sand, PAL.wood, 0.3));
  });
  set.add(
    'st_fence',
    (c) => {
      c.rect(0, 8, 16, 2, PAL.tan);
      c.hline(0, 8, 16, PAL.sand);
      c.rect(0, 13, 16, 1, PAL.bark);
      for (const x of [1, 5, 9, 13]) {
        c.rect(x, 4, 3, 10, PAL.paper);
        c.set(x + 1, 3, PAL.paper);
        c.vline(x + 2, 5, 9, PAL.sand);
        c.hline(x, 14, 3, PAL.ink);
        c.vline(x - 1 < 0 ? 0 : x - 1, 5, 9, PAL.ink);
      }
    },
    { solid: true },
  );
  set.add(
    'st_mailbox',
    (c) => {
      c.rect(7, 8, 2, 7, PAL.bark);
      c.rect(3, 3, 10, 6, PAL.deep);
      c.hline(3, 3, 10, '#8fb0d6');
      c.rect(4, 5, 5, 3, PAL.navy);
      c.rect(11, 1, 2, 4, PAL.coral);
      c.outline(PAL.ink);
    },
    { solid: true },
  );

  HOUSE_COLOURS.forEach((k, i) => {
    for (const row of ['t', 'm', 'b'] as const) {
      for (const col of ['l', 'm', 'r'] as const) {
        set.add(`st_roof_${i}_${row}${col}`, (c) => roofTile(c, k, col, row), { solid: true });
      }
    }
    set.add(`st_wall_${i}`, (c) => wallTile(c, k, {}, 450 + i), { solid: true });
    set.add(`st_wall_l_${i}`, (c) => wallTile(c, k, { left: true }, 460 + i), { solid: true });
    set.add(`st_wall_r_${i}`, (c) => wallTile(c, k, { right: true }, 470 + i), { solid: true });
    set.add(`st_win_${i}`, (c) => wallTile(c, k, { window: true }, 480 + i), { solid: true });
    set.add(`st_base_${i}`, (c) => wallTile(c, k, { base: true }, 490 + i), { solid: true });
    set.add(`st_base_l_${i}`, (c) => wallTile(c, k, { base: true, left: true }, 500 + i), { solid: true });
    set.add(`st_base_r_${i}`, (c) => wallTile(c, k, { base: true, right: true }, 510 + i), { solid: true });
  });
}
