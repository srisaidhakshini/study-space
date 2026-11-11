import { TILE } from '@study/shared';
import { mix, PAL } from '../palette';
import { makeRng, PixelCanvas, tracePolyline } from '../png';
import { N, E, S, W, Tileset, speckle } from './tileset';
import { addPortal, glow, type PortalStyle } from './worldArt';
import { SKY_PORTAL } from './portal';

export const SKY = mix(PAL.sky, '#ffffff', 0.22);
const SKY_LIGHT = mix(PAL.sky, '#ffffff', 0.55);
const DIRT = mix(PAL.bark, PAL.wood, 0.45);
const DIRT_DARK = mix(PAL.bark, PAL.ink, 0.3);
const DIRT_LIGHT = mix(PAL.wood, PAL.tan, 0.5);
const PLANK = PAL.tan;
const PLANK_DARK = mix(PAL.tan, PAL.wood, 0.55);
const PLANK_LIGHT = mix(PAL.sand, PAL.cream, 0.4);
const WOBBLE = [0, 0, 1, 1, 0, 1, 0, 0];

function skyTile(c: PixelCanvas, seed: number): void {
  c.rect(0, 0, 16, 16, SKY);
  const rand = makeRng(seed);
  for (let i = 0; i < 4; i++) c.set(Math.floor(rand() * 16), Math.floor(rand() * 16), SKY_LIGHT);
}

function grassFill(c: PixelCanvas): void {
  const rand = makeRng(11);
  c.rect(0, 0, 16, 16, PAL.leaf);
  speckle(c, rand, 9, PAL.leafLight);
  speckle(c, rand, 6, PAL.leafDark);
}

/**
 * One tile of the island's grass top, picked by which sides touch more
 * island. Edges are uneven on the north, east and west; the south side runs
 * to the tile border so the cliff face continues from it.
 */
function isleTile(c: PixelCanvas, mask: number): void {
  skyTile(c, 5);
  const fill = new PixelCanvas(TILE, TILE);
  grassFill(fill);
  const depth = (along: number, side: number): number => 2 + WOBBLE[(along + side * 3) % WOBBLE.length]!;
  const inside = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return true;
    if (!(mask & N) && y < depth(x, 0)) return false;
    if (!(mask & W) && x < depth(y, 2)) return false;
    if (!(mask & E) && TILE - 1 - x < depth(y, 3)) return false;
    return true;
  };
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1);
      c.set(x, y, edge ? PAL.leafDark : (fill.get(x, y) ?? PAL.leaf));
      if (!edge && !inside(x, y - 2)) c.set(x, y, PAL.leafLight);
    }
  }
  if (!(mask & S)) {
    c.hline(0, 13, 16, mix(PAL.leaf, PAL.leafDark, 0.45));
    c.hline(0, 14, 16, PAL.leafDark);
    c.hline(0, 15, 16, PAL.pine);
    for (const x of [2, 6, 11, 14]) c.set(x, 15, DIRT);
  }
}

function plankTile(c: PixelCanvas, shift: number): void {
  c.rect(0, 0, 16, 16, PLANK);
  for (const y of [0, 5, 10]) {
    c.hline(0, y, 16, PLANK_LIGHT);
    c.hline(0, y + 4, 16, PLANK_DARK);
  }
  for (const [x, y] of [[(shift + 3) % 16, 2], [(shift + 11) % 16, 7], [(shift + 6) % 16, 12]] as const) c.set(x, y, PLANK_DARK);
  c.vline(shift % 16, 0, 5, PLANK_DARK);
  c.vline((shift + 8) % 16, 5, 5, PLANK_DARK);
  c.vline((shift + 3) % 16, 10, 5, PLANK_DARK);
}

function cliffTop(c: PixelCanvas, v: number): void {
  c.rect(0, 0, 16, 16, DIRT);
  c.hline(0, 0, 16, mix(PAL.pine, DIRT, 0.4));
  for (let x = 0; x < 16; x++) if ((x + v * 3) % 4 !== 0) c.set(x, 1, mix(PAL.leafDark, DIRT, 0.5));
  for (const x of [(2 + v * 5) % 16, (9 + v * 3) % 16]) c.vline(x, 2, 6 + (x % 4), DIRT_DARK);
  const rand = makeRng(40 + v);
  for (let i = 0; i < 3; i++) {
    const x = 1 + Math.floor(rand() * 12);
    const y = 5 + Math.floor(rand() * 8);
    c.rect(x, y, 3, 2, DIRT_LIGHT);
    c.hline(x, y + 2, 3, DIRT_DARK);
  }
  c.vline(0, 0, 16, DIRT_DARK);
  c.vline(15, 0, 16, mix(DIRT, DIRT_DARK, 0.6));
}

function cliffMid(c: PixelCanvas, v: number, jagged: boolean): void {
  c.rect(0, 0, 16, 16, mix(DIRT, DIRT_DARK, 0.4));
  const rand = makeRng(70 + v);
  for (let i = 0; i < 4; i++) {
    const x = 1 + Math.floor(rand() * 12);
    const y = 1 + Math.floor(rand() * 11);
    c.rect(x, y, 3, 2, DIRT);
    c.hline(x, y + 2, 3, DIRT_DARK);
  }
  for (const x of [(3 + v * 4) % 16, (10 + v * 6) % 16]) {
    const len = 6 + ((x + v) % 7);
    c.vline(x, 0, len, PAL.bark);
    c.set(x + 1, len - 2, PAL.bark);
  }
  c.vline(15, 0, 16, DIRT_DARK);
  if (jagged) {
    for (let x = 0; x < 16; x++) {
      const keep = 9 + Math.round(4 * Math.sin((x + v * 3) * 0.9) + (x % 3));
      for (let y = keep; y < 16; y++) c.erase(x, y);
    }
  }
}

function cliffTip(c: PixelCanvas, v: number): void {
  for (let x = 0; x < 16; x++) {
    const len = Math.max(0, Math.round(10 - Math.abs(((x + v * 3) % 8) - 3.5) * 2.6));
    for (let y = 0; y < len; y++) c.set(x, y, x % 8 > 3 ? DIRT_DARK : mix(DIRT, DIRT_DARK, 0.4));
  }
  c.vline((4 + v * 3) % 16, 0, 12, PAL.bark);
}

function cloud(c: PixelCanvas, w: number, h: number): void {
  const bumps: [number, number, number, number][] = [
    [w * 0.22, h * 0.62, w * 0.2, h * 0.3],
    [w * 0.45, h * 0.42, w * 0.22, h * 0.38],
    [w * 0.72, h * 0.6, w * 0.2, h * 0.3],
    [w * 0.5, h * 0.7, w * 0.4, h * 0.22],
  ];
  const shade = mix(SKY_LIGHT, PAL.water, 0.35);
  for (const [cx, cy, rx, ry] of bumps) c.ellipse(cx, cy + 2, rx, ry, shade);
  for (const [cx, cy, rx, ry] of bumps) c.ellipse(cx, cy, rx, ry, PAL.cream);
  for (const [cx, cy, rx, ry] of bumps.slice(0, 3)) c.ellipse(cx - 1, cy - 2, rx * 0.5, ry * 0.4, '#ffffff');
}

function islet(c: PixelCanvas): void {
  // Rock hanging below.
  for (let y = 15; y < 46; y++) {
    const half = Math.max(1, Math.round(20 * (1 - (y - 15) / 32) ** 0.8));
    c.hline(24 - half, y, half * 2, y % 7 < 3 ? DIRT : mix(DIRT, DIRT_DARK, 0.4));
    c.set(24 + half - 1, y, DIRT_DARK);
  }
  c.vline(14, 18, 14, PAL.bark);
  c.vline(30, 18, 18, PAL.bark);
  c.ellipse(24, 15, 21, 7, PAL.leafDark);
  c.ellipse(24, 14, 21, 6.5, PAL.leaf);
  c.ellipse(21, 12, 11, 3, PAL.leafLight);
  c.ellipse(34, 10, 4, 3, PAL.leafDark);
  c.ellipse(34, 9, 3, 2.5, PAL.leaf);
  c.set(14, 13, PAL.cream);
  c.set(28, 15, PAL.pink);
  c.outline(PAL.ink);
}

function windmill(c: PixelCanvas): void {
  const hubX = 32;
  const hubY = 24;
  // Tower.
  for (let y = 26; y < 78; y++) {
    const half = 10 + Math.round(((y - 26) / 52) * 8);
    c.hline(hubX - half, y, half * 2, (y - 26) % 10 < 5 ? PAL.cream : PAL.paper);
    c.set(hubX + half - 1, y, PAL.sand);
    c.set(hubX + half - 2, y, PAL.sand);
    c.set(hubX - half, y, PAL.fog);
  }
  c.rect(hubX - 8, 56, 16, 2, PAL.wood);
  // Roof cone.
  for (let y = 14; y < 30; y++) {
    const half = Math.round(4 + ((y - 14) / 16) * 9);
    c.hline(hubX - half, y, half * 2, y % 4 < 2 ? PAL.brick : PAL.wine);
  }
  c.set(hubX, 13, PAL.brick);
  // Door and windows.
  c.roundRect(hubX - 4, 64, 8, 14, [2, 1], [], PAL.bark);
  c.rect(hubX - 3, 66, 6, 12, PAL.cocoa);
  c.set(hubX + 2, 72, PAL.gold);
  c.rect(hubX - 3, 40, 6, 7, PAL.bark);
  c.rect(hubX - 2, 41, 4, 5, PAL.sky);
  c.hline(hubX - 2, 43, 4, PAL.bark);
  // Four sails.
  for (const [dx, dy] of [[1, -1], [1, 1], [-1, 1], [-1, -1]] as const) {
    const end = { x: hubX + dx * 21, y: hubY + dy * 21 };
    const spar = tracePolyline([{ x: hubX, y: hubY }, end]);
    spar.forEach((p, i) => {
      if (i < 5) return;
      c.rect(p.x, p.y, 2, 2, PAL.wood);
      if (i > 8 && i < 28) {
        c.rect(p.x + dy * 2 - (dy > 0 ? 0 : 3), p.y - dx * 2 - (dx > 0 ? 0 : 0), 3, 3, i % 4 < 2 ? PAL.cream : PAL.paper);
      }
    });
  }
  c.rect(hubX - 3, hubY - 3, 6, 6, PAL.wood);
  c.rect(hubX - 1, hubY - 1, 2, 2, PAL.gold);
  c.outline(PAL.ink);
}

function skyTree(c: PixelCanvas): void {
  c.ellipse(15.5, 44, 9, 2.5, mix(PAL.ink, SKY, 0.8));
  c.rect(13, 26, 6, 18, PAL.bark);
  c.vline(13, 26, 18, PAL.cocoa);
  c.vline(16, 28, 15, PAL.wood);
  c.ellipse(15.5, 16, 14, 13, PAL.plum);
  c.ellipse(15.5, 15, 13, 12, PAL.pink);
  c.ellipse(12, 11, 8, 6, PAL.blush);
  c.ellipse(11, 9, 3.5, 2.5, PAL.cream);
  const rand = makeRng(8);
  for (let i = 0; i < 30; i++) {
    const x = 3 + Math.floor(rand() * 26);
    const y = 3 + Math.floor(rand() * 24);
    const here = c.get(x, y);
    if (here === PAL.pink) c.set(x, y, rand() < 0.5 ? PAL.coral : PAL.blush);
  }
  c.outline(PAL.ink);
}

function lantern(c: PixelCanvas): void {
  c.rect(7, 12, 2, 18, PAL.ash);
  c.rect(5, 28, 6, 3, PAL.ash);
  c.hline(5, 28, 6, PAL.slate);
  glow(c, 8, 7, 8, PAL.glow, 0.45);
  c.rect(4, 3, 8, 9, PAL.glow);
  c.rect(6, 5, 4, 5, PAL.cream);
  c.frame(4, 3, 8, 9, PAL.amber);
  c.roundRect(3, 1, 10, 3, [2, 1], [], PAL.ash);
  c.outline(PAL.ink);
}

function railH(c: PixelCanvas): void {
  c.rect(0, 5, 16, 2, PAL.wood);
  c.hline(0, 5, 16, PAL.tan);
  c.rect(0, 10, 16, 2, PAL.wood);
  c.hline(0, 10, 16, PAL.tan);
  c.rect(6, 2, 4, 14, PAL.bark);
  c.vline(6, 2, 14, PAL.wood);
  c.hline(6, 2, 4, PAL.tan);
  c.outline(PAL.ink);
}

function railV(c: PixelCanvas): void {
  c.rect(6, 2, 4, 14, PAL.bark);
  c.vline(6, 2, 14, PAL.wood);
  c.hline(6, 2, 4, PAL.tan);
  c.rect(7, 6, 2, 2, PAL.cocoa);
  c.outline(PAL.ink);
}

function swing(c: PixelCanvas): void {
  c.rect(2, 0, 4, 32, PAL.bark);
  c.rect(26, 0, 4, 32, PAL.bark);
  c.vline(2, 0, 32, PAL.wood);
  c.vline(26, 0, 32, PAL.wood);
  c.rect(2, 0, 28, 4, PAL.wood);
  c.hline(2, 0, 28, PAL.tan);
  c.vline(10, 4, 18, PAL.sand);
  c.vline(21, 4, 18, PAL.sand);
  c.rect(7, 14, 18, 6, PAL.wood);
  for (const x of [10, 14, 18, 22]) c.vline(x, 14, 6, PAL.bark);
  c.rect(7, 20, 18, 4, PAL.tan);
  c.hline(7, 20, 18, PAL.sand);
  c.hline(7, 23, 18, PAL.bark);
  c.rect(7, 18, 3, 6, PAL.coral);
  c.outline(PAL.ink);
}

function desk(c: PixelCanvas, end: 'l' | 'm' | 'r', front: boolean, item: 'none' | 'book' | 'paper'): void {
  const x = end === 'l' ? 1 : 0;
  const w = end === 'm' ? 16 : 15;
  if (front) {
    c.rect(x, 0, w, 9, PLANK_LIGHT);
    c.hline(x, 8, w, PLANK);
    c.rect(x, 9, w, 4, PAL.wood);
    c.hline(x, 9, w, PAL.bark);
    if (end === 'l') c.rect(1, 13, 2, 2, PAL.bark);
    if (end === 'r') c.rect(13, 13, 2, 2, PAL.bark);
  } else {
    c.rect(x, 4, w, 12, PLANK_LIGHT);
    c.hline(x, 4, w, PAL.cream);
    c.hline(x, 15, w, PLANK);
    if (item === 'book') c.pattern(4, 8, ['kkkkkkkk', 'kwwwkwwwk', 'kwswkwswk', 'kkkkkkkkk'], { k: PAL.cocoa, w: PAL.cream, s: PAL.slate });
    if (item === 'paper') {
      c.rect(4, 8, 6, 6, PAL.cream);
      c.hline(5, 10, 4, PAL.slate);
      c.hline(5, 12, 3, PAL.slate);
      c.rect(11, 9, 1, 5, PAL.coral);
    }
  }
  c.outline(PAL.ink);
}

function chair(c: PixelCanvas, fromBehind: boolean): void {
  if (fromBehind) {
    c.rect(3, 4, 10, 4, PAL.water);
    c.rect(3, 6, 10, 7, PAL.wood);
    c.hline(3, 6, 10, PAL.tan);
    for (const x of [5, 8, 10]) c.vline(x, 8, 4, PAL.bark);
  } else {
    c.rect(3, 1, 10, 7, PAL.wood);
    c.hline(3, 1, 10, PAL.tan);
    for (const x of [5, 8, 10]) c.vline(x, 3, 4, PAL.bark);
    c.rect(3, 8, 10, 5, PAL.water);
    c.hline(3, 8, 10, PAL.sky);
    c.hline(3, 12, 10, PAL.deep);
  }
  c.rect(3, 13, 2, 2, PAL.bark);
  c.rect(11, 13, 2, 2, PAL.bark);
  c.outline(PAL.ink);
}

function bush(c: PixelCanvas): void {
  c.ellipse(7.5, 9, 6.5, 5, PAL.leafDark);
  c.ellipse(6.5, 8, 4.5, 3.5, PAL.leaf);
  c.set(5, 7, PAL.leafLight);
  c.set(10, 9, PAL.pink);
  c.set(4, 10, PAL.pink);
  c.outline(PAL.ink);
}

function flower(c: PixelCanvas, spots: [number, number, string][]): void {
  for (const [x, y, petal] of spots) c.pattern(x, y, ['.p.', 'pyp', '.p.', '.s.'], { p: petal, y: PAL.gold, s: PAL.leafDark });
}

/** Tiles for the sky island. */
export function buildSkyTileset(): Tileset {
  const set = new Tileset('sky');
  set.add('sky_0', (c) => skyTile(c, 1), { solid: true });
  set.add('sky_1', (c) => skyTile(c, 2), { solid: true });
  for (let mask = 0; mask < 16; mask++) set.add(`isle_${mask}`, (c) => isleTile(c, mask));
  set.add('deck_0', (c) => plankTile(c, 0));
  set.add('deck_1', (c) => plankTile(c, 7));
  for (let v = 0; v < 3; v++) {
    set.add(`cliff_top_${v}`, (c) => cliffTop(c, v), { solid: true });
    set.add(`cliff_mid_${v}`, (c) => cliffMid(c, v, false), { solid: true });
    set.add(`cliff_end_${v}`, (c) => cliffMid(c, v, true), { solid: true });
    set.add(`cliff_tip_${v}`, (c) => cliffTip(c, v), { solid: true });
  }
  set.addBlock('cloud_a', 4, 2, (c) => cloud(c, 64, 32), () => ({}));
  set.addBlock('cloud_b', 3, 2, (c) => cloud(c, 48, 32), () => ({}));
  set.addBlock('cloud_c', 2, 1, (c) => cloud(c, 32, 16), () => ({}));
  set.addBlock('islet', 3, 3, islet, () => ({ solid: true }));
  set.addBlock('windmill', 4, 5, windmill, () => ({ solid: true }));
  set.addBlock('tree', 2, 3, skyTree, (_x, row) => ({ solid: row === 2, sortOffset: 2 - row }));
  set.addBlock('lantern', 1, 2, lantern, (_x, row) => ({ solid: row === 1, sortOffset: 1 - row }));
  set.addBlock('swing', 2, 2, swing, () => ({ solid: true }));
  set.add('rail_h', railH, { solid: true });
  set.add('rail_v', railV, { solid: true });
  for (const end of ['l', 'm', 'r'] as const) {
    set.add(`desk_back_${end}`, (c) => desk(c, end, false, 'none'), { solid: true });
    set.add(`desk_front_${end}`, (c) => desk(c, end, true, 'none'), { solid: true });
  }
  set.add('desk_back_m_book', (c) => desk(c, 'm', false, 'book'), { solid: true });
  set.add('desk_back_m_paper', (c) => desk(c, 'm', false, 'paper'), { solid: true });
  set.add('chair_down', (c) => chair(c, false), { solid: true });
  set.add('chair_up', (c) => chair(c, true), { solid: true });
  set.add('bush', bush, { solid: true });
  set.add('flowers_0', (c) => flower(c, [[2, 3, PAL.cream], [9, 8, PAL.pink]]));
  set.add('flowers_1', (c) => flower(c, [[8, 2, PAL.gold], [3, 9, PAL.coral], [11, 10, PAL.cream]]));
  addPortal(set, 'gate', 3, { ...(SKY_PORTAL as PortalStyle) });
  return set;
}
