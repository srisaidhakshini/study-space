import { mix, PAL } from '../palette';
import { makeRng, PixelCanvas } from '../png';
import { Tileset, speckle } from './tileset';
import { addPortal, crystal, glow, type PortalStyle } from './worldArt';

const SLAB = mix(PAL.ash, PAL.lilac, 0.3);
const SLAB_LIGHT = mix(SLAB, PAL.fog, 0.3);
const SLAB_DARK = mix(SLAB, PAL.ink, 0.35);
const WALL = mix(PAL.ash, PAL.navy, 0.35);
const WALL_DARK = mix(PAL.navy, PAL.ink, 0.45);
const VIOLET = mix(PAL.plum, PAL.lilac, 0.4);

export const SKY_PORTAL: PortalStyle = {
  ramp: [PAL.deep, PAL.water, PAL.sky, mix(PAL.sky, PAL.cream, 0.5), PAL.cream, PAL.glow],
  stone: [mix(PAL.stone, PAL.cream, 0.3), PAL.stone, PAL.slate],
  accent: PAL.gold,
};
export const SEA_PORTAL: PortalStyle = {
  ramp: [PAL.navy, mix(PAL.deep, '#2a8a96', 0.4), '#2f9aa0', '#69c8c0', '#b7efe0', PAL.cream],
  stone: [mix(PAL.stone, PAL.sky, 0.3), mix(PAL.stone, PAL.water, 0.2), mix(PAL.slate, PAL.deep, 0.3)],
  accent: '#7fe0c8',
};

function slab(c: PixelCanvas, seed: number): void {
  c.rect(0, 0, 16, 16, SLAB);
  c.hline(0, 0, 16, SLAB_LIGHT);
  c.vline(0, 0, 16, SLAB_LIGHT);
  c.hline(0, 15, 16, SLAB_DARK);
  c.vline(15, 0, 16, SLAB_DARK);
  speckle(c, makeRng(seed), 8, SLAB_DARK);
  speckle(c, makeRng(seed + 1), 6, SLAB_LIGHT);
}

const RUNES = [
  ['..x..', '.xxx.', 'x.x.x', '..x..', '.x.x.'],
  ['x...x', '.x.x.', '..x..', '.x.x.', 'x...x'],
  ['.xxx.', 'x...x', 'x.x.x', 'x...x', '.xxx.'],
];

function wallFace(c: PixelCanvas, low: boolean): void {
  c.rect(0, 0, 16, 16, WALL);
  for (let y = 0; y < 16; y += 5) {
    c.hline(0, y + 4, 16, mix(WALL, WALL_DARK, 0.6));
    const shift = (y / 5) % 2 === 0 ? 0 : 6;
    for (let x = shift; x < 16; x += 12) c.vline(x, y, 4, mix(WALL, WALL_DARK, 0.6));
    c.hline(0, y, 16, mix(WALL, PAL.lilac, 0.25));
  }
  if (low) {
    c.rect(0, 12, 16, 4, WALL_DARK);
    c.hline(0, 12, 16, PAL.slate);
    c.hline(0, 15, 16, PAL.ink);
  }
}

function pillar(c: PixelCanvas): void {
  c.rect(3, 4, 10, 25, SLAB);
  c.vline(3, 4, 25, SLAB_LIGHT);
  c.vline(12, 4, 25, SLAB_DARK);
  c.rect(1, 2, 14, 3, SLAB_LIGHT);
  c.hline(1, 4, 14, SLAB_DARK);
  c.rect(1, 28, 14, 4, SLAB_DARK);
  c.hline(1, 28, 14, SLAB_LIGHT);
  c.rect(6, 10, 4, 12, VIOLET);
  c.pattern(6, 12, ['.xx.', 'x..x', '.xx.', 'x..x'], { x: PAL.gold });
  c.outline(PAL.ink);
}

function pedestal(c: PixelCanvas): void {
  crystal(c, 8, 18, 14, 9, [mix(PAL.lilac, PAL.cream, 0.5), PAL.lilac, PAL.plum]);
  glow(c, 8, 12, 9, PAL.lilac, 0.35);
  crystal(c, 8, 18, 14, 9, [mix(PAL.lilac, PAL.cream, 0.5), PAL.lilac, PAL.plum]);
  c.rect(3, 20, 10, 12, SLAB);
  c.rect(2, 19, 12, 3, SLAB_LIGHT);
  c.vline(3, 22, 10, SLAB_LIGHT);
  c.vline(12, 22, 10, SLAB_DARK);
  c.hline(2, 31, 12, SLAB_DARK);
  c.pattern(6, 24, ['x.x', '.x.', 'x.x'], { x: PAL.gold });
  c.outline(PAL.ink);
}

function plantTile(c: PixelCanvas): void {
  c.rect(4, 23, 8, 7, SLAB);
  c.rect(3, 22, 10, 2, SLAB_LIGHT);
  c.hline(4, 29, 8, SLAB_DARK);
  c.ellipse(7.5, 15, 5.5, 7, PAL.pine);
  c.ellipse(5, 11, 3, 5, PAL.leafDark);
  c.ellipse(10.5, 12, 3, 5.5, PAL.leafDark);
  c.ellipse(7.5, 9, 2.5, 5, PAL.leaf);
  for (const [x, y] of [[5, 10], [10, 12], [7, 6]] as const) {
    c.rect(x, y, 2, 2, PAL.pink);
    c.set(x, y, PAL.cream);
  }
  c.outline(PAL.ink);
}

function bench(c: PixelCanvas): void {
  c.rect(1, 2, 30, 5, SLAB);
  c.hline(1, 2, 30, SLAB_LIGHT);
  c.rect(1, 7, 30, 5, PAL.wood);
  c.hline(1, 7, 30, PAL.tan);
  c.hline(1, 11, 30, PAL.bark);
  c.rect(2, 12, 3, 3, SLAB_DARK);
  c.rect(27, 12, 3, 3, SLAB_DARK);
  c.outline(PAL.ink);
}

function banner(c: PixelCanvas): void {
  wallFace(c, false);
  const lower = new PixelCanvas(16, 16);
  wallFace(lower, true);
  c.blit(lower, 0, 16);
  c.rect(4, 0, 8, 26, PAL.plum);
  c.vline(4, 0, 26, mix(PAL.plum, PAL.ink, 0.4));
  c.vline(11, 0, 26, mix(PAL.plum, PAL.ink, 0.4));
  c.rect(5, 0, 6, 2, PAL.gold);
  c.pattern(6, 8, ['..xx..', '.xxxx.', 'xxxxxx', '.xxxx.', '..xx..'], { x: PAL.gold });
  c.pattern(4, 26, ['xxxxxxxx', 'x.xx.xxx', '..x..xx.'], { x: PAL.plum });
  c.outline(PAL.ink);
}

function plaque(c: PixelCanvas, icon: 'cloud' | 'wave'): void {
  wallFace(c, false);
  c.rect(2, 3, 12, 11, PAL.ink);
  c.rect(3, 4, 10, 9, PAL.bark);
  c.rect(4, 5, 8, 7, mix(PAL.navy, PAL.deep, 0.5));
  if (icon === 'cloud') {
    c.ellipse(6.5, 9, 2, 1.6, PAL.cream);
    c.ellipse(9.5, 8.5, 2.2, 2, PAL.cream);
    c.rect(5, 9, 7, 2, PAL.cream);
    c.hline(5, 11, 7, PAL.sky);
  } else {
    for (const y of [7, 9, 11]) c.pattern(5 + (y % 2), y - 1, ['.x.x.x.', 'x.x.x.x'].slice(0, 1), { x: '#69c8c0' });
    c.hline(5, 11, 7, '#2f9aa0');
    c.set(6, 6, PAL.cream);
    c.set(10, 8, PAL.cream);
  }
  c.set(3, 4, PAL.gold);
  c.set(12, 4, PAL.gold);
  c.set(3, 12, PAL.gold);
  c.set(12, 12, PAL.gold);
}

/** The floor ring in the middle of the room: 6x4 tiles of glowing runes. */
function runeRing(c: PixelCanvas): void {
  const w = 96;
  const h = 64;
  glow(c, w / 2, h / 2, 44, PAL.lilac, 0.28);
  for (const [rx, ry, color] of [[44, 28, PAL.ink], [43, 27, VIOLET], [39, 24, PAL.ink], [38, 23, mix(PAL.plum, PAL.ash, 0.4)]] as const) {
    c.ellipse(w / 2, h / 2, rx, ry, color);
  }
  c.ellipse(w / 2, h / 2, 37, 22, mix(SLAB, PAL.plum, 0.45));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = Math.round(w / 2 + Math.cos(a) * 41 - 2);
    const y = Math.round(h / 2 + Math.sin(a) * 25 - 2);
    c.pattern(x, y, RUNES[i % 3]!, { x: PAL.gold });
  }
  c.pattern(w / 2 - 5, h / 2 - 5, ['....x....', '...xxx...', '..xxxxx..', 'xxxxxxxxx', '.xxxxxxx.', '..xxxxx..', '.xx...xx.', 'xx.....xx'], { x: PAL.gold });
  c.set(w / 2, h / 2, PAL.cream);
}

/** Tiles for the portal room. */
export function buildPortalTileset(): Tileset {
  const set = new Tileset('portal');
  set.add('floor_0', (c) => slab(c, 3));
  set.add('floor_1', (c) => slab(c, 9));
  set.add('floor_rune', (c) => {
    slab(c, 14);
    c.pattern(5, 5, RUNES[1]!, { x: PAL.gold });
  });
  set.add(
    'wall_top',
    (c) => {
      c.rect(0, 0, 16, 16, WALL_DARK);
      c.hline(0, 0, 16, WALL);
      speckle(c, makeRng(5), 6, WALL);
    },
    { solid: true },
  );
  set.add('wall_upper', (c) => wallFace(c, false), { solid: true });
  set.add('wall_lower', (c) => wallFace(c, true), { solid: true });
  set.addBlock('banner', 1, 2, banner, () => ({ solid: true }));
  set.add('plaque_sky', (c) => plaque(c, 'cloud'), { solid: true });
  set.add('plaque_dome', (c) => plaque(c, 'wave'), { solid: true });
  set.add('doorway', (c) => {
    c.rect(0, 0, 16, 16, WALL_DARK);
    c.rect(0, 0, 16, 3, PAL.gold);
    c.rect(0, 3, 16, 5, SLAB_DARK);
    c.rect(0, 8, 16, 8, SLAB);
    c.hline(0, 8, 16, SLAB_LIGHT);
  });
  set.addBlock('pillar', 1, 2, pillar, (_x, row) => ({ solid: row === 1, sortOffset: 1 - row }));
  set.addBlock('pedestal', 1, 2, pedestal, (_x, row) => ({ solid: row === 1, sortOffset: 1 - row }));
  set.addBlock('plant', 1, 2, plantTile, (_x, row) => ({ solid: row === 1, sortOffset: 1 - row }));
  set.addBlock('bench', 2, 1, bench, () => ({ solid: true }));
  set.addBlock('ring', 6, 4, runeRing, () => ({}));
  set.add(
    'crystals',
    (c) => {
      crystal(c, 5, 14, 11, 6, [mix(PAL.sky, PAL.cream, 0.4), PAL.sky, PAL.deep]);
      crystal(c, 11, 14, 8, 5, [mix(PAL.pink, PAL.cream, 0.4), PAL.pink, PAL.plum]);
      crystal(c, 8, 15, 6, 4, [mix(PAL.gold, PAL.cream, 0.5), PAL.gold, PAL.amber]);
      c.outline(PAL.ink);
    },
    { solid: true },
  );
  addPortal(set, 'portal_sky', 4, SKY_PORTAL);
  addPortal(set, 'portal_sea', 4, SEA_PORTAL);
  return set;
}
