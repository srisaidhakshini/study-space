import { mix, PAL, withAlpha } from '../palette';
import { makeRng, PixelCanvas } from '../png';
import { leafTexture } from './outdoorKit';
import type { Tileset } from './tileset';

const PLANK = PAL.tan;
const PLANK_LIGHT = PAL.sand;
const PLANK_DARK = PAL.wood;

/** Horizontal planks with staggered joints. */
function planks(c: PixelCanvas, seed: number, y0 = 0, h = 16): void {
  const rand = makeRng(seed);
  c.rect(0, y0, 16, h, PLANK);
  for (let y = y0; y < y0 + h; y += 4) {
    c.hline(0, y + 3, 16, PLANK_DARK);
    c.hline(0, y, 16, PLANK_LIGHT);
    c.set(Math.floor(rand() * 16), y + 1, PLANK_DARK);
    c.vline(((y / 4) * 5 + seed) % 16, y, 3, PLANK_DARK);
  }
}

/** Bridge deck. `rail` puts a handrail along the top or bottom edge. */
function bridge(c: PixelCanvas, rail: 'top' | 'bottom', post: boolean, seed: number): void {
  planks(c, seed);
  if (rail === 'top') {
    c.rect(0, 0, 16, 5, PAL.wood);
    c.hline(0, 0, 16, PAL.ink);
    c.hline(0, 1, 16, PAL.tan);
    c.hline(0, 4, 16, PAL.bark);
    c.hline(0, 5, 16, withAlpha(PAL.ink, 0.35));
    if (post) c.rect(6, 0, 4, 6, PAL.bark);
  } else {
    c.rect(0, 10, 16, 6, PAL.wood);
    c.hline(0, 10, 16, PAL.tan);
    c.hline(0, 13, 16, PAL.bark);
    c.hline(0, 15, 16, PAL.ink);
    c.hline(0, 9, 16, withAlpha(PAL.ink, 0.35));
    if (post) c.rect(6, 8, 4, 8, PAL.bark);
  }
}

/** Pier planks with posts sunk into the water along the lower edge. */
function pier(c: PixelCanvas, edge: 'top' | 'bottom', seed: number): void {
  planks(c, seed);
  if (edge === 'top') {
    c.hline(0, 0, 16, PAL.ink);
    c.hline(0, 1, 16, PAL.sand);
  } else {
    c.hline(0, 15, 16, PAL.ink);
    c.hline(0, 14, 16, PLANK_DARK);
    c.rect(2, 12, 3, 4, PAL.bark);
    c.rect(11, 12, 3, 4, PAL.bark);
    c.set(2, 12, PAL.cream);
    c.set(11, 12, PAL.cream);
  }
}

function post(c: PixelCanvas): void {
  c.rect(5, 2, 6, 13, PAL.wood);
  c.vline(5, 2, 13, PAL.tan);
  c.vline(10, 2, 13, PAL.bark);
  c.rect(4, 0, 8, 3, PAL.bark);
  c.hline(4, 0, 8, PAL.tan);
  c.rect(4, 13, 8, 2, PAL.bark);
  c.rect(7, 5, 2, 2, PAL.gold);
  c.outline(PAL.ink);
}

function reeds(c: PixelCanvas, variant: number): void {
  const rand = makeRng(300 + variant);
  const stems: number[] = variant === 0 ? [3, 7, 11, 13] : [2, 5, 9, 12];
  for (const x of stems) {
    const h = 8 + Math.floor(rand() * 5);
    const lean = rand() < 0.5 ? -1 : 1;
    for (let i = 0; i < h; i++) c.set(x + (i > h - 4 ? lean : 0), 15 - i, i % 3 === 0 ? PAL.leaf : PAL.leafDark);
    if (rand() < 0.7) {
      const top = 15 - h;
      c.rect(x - 1 + lean, top - 1, 2, 4, PAL.bark);
      c.set(x - 1 + lean, top - 1, PAL.tan);
    }
  }
  for (let i = 0; i < 5; i++) {
    c.set(1 + i, 14 - i, PAL.leaf);
    c.set(14 - i, 14 - i, PAL.leafDark);
  }
  c.outline(withAlpha(PAL.ink, 0.55));
}

function willow(c: PixelCanvas): void {
  const rand = makeRng(808);
  const w = c.width;
  c.ellipse(w / 2, c.height - 4, 22, 5, withAlpha(PAL.ink, 0.28));
  // Leaning trunk.
  c.rect(w / 2 - 6, 34, 12, 42, PAL.bark);
  c.rect(w / 2 - 9, 70, 18, 6, PAL.bark);
  c.vline(w / 2 - 6, 34, 42, PAL.cocoa);
  c.vline(w / 2 - 2, 36, 38, PAL.wood);
  c.vline(w / 2 + 4, 34, 42, PAL.cocoa);
  for (let i = 0; i < 10; i++) c.set(w / 2 - 5 + Math.floor(rand() * 10), 38 + Math.floor(rand() * 34), PAL.wood);
  // Crown first, outlined; the fronds are drawn afterwards so the outline
  // does not fill the gaps between strands.
  c.ellipse(w / 2, 26, 34, 20, PAL.leafDark);
  c.ellipse(w / 2 - 3, 22, 28, 15, PAL.leaf);
  c.ellipse(w / 2 - 8, 17, 14, 7, PAL.leafLight);
  leafTexture(c, rand, 160);
  c.outline(PAL.ink);
  for (let x = 6; x < w - 6; x += 2) {
    const edge = Math.abs(x - w / 2) / (w / 2);
    if (edge < 0.2) continue;
    const top = 28 + Math.floor(edge * 4);
    const reach = 26 + Math.floor(rand() * 24) - Math.floor(edge * 6);
    for (let y = top; y < top + reach; y++) {
      const wave = Math.round(Math.sin(y * 0.28 + x * 0.9) * 0.8);
      const tone = y > top + reach - 5 ? PAL.leafDark : y % 6 < 3 ? PAL.pine : PAL.moss;
      c.set(x + wave, y, tone);
    }
    c.set(x, top + reach, PAL.pine);
  }
}

function boat(c: PixelCanvas): void {
  const w = c.width;
  // Water shadow, hull, and a pale stripe along the gunwale.
  c.ellipse(w / 2, 22, 22, 5, withAlpha(PAL.deep, 0.5));
  c.roundRect(4, 10, w - 8, 12, [0, 1, 2], [2, 4, 6], PAL.wood);
  c.hline(5, 11, w - 10, PAL.tan);
  c.hline(4, 13, w - 8, PAL.cream);
  c.hline(6, 18, w - 12, PAL.bark);
  c.rect(14, 8, 3, 3, PAL.bark);
  c.rect(w - 18, 8, 3, 3, PAL.bark);
  c.rect(14, 8, w - 32, 2, PAL.tan);
  // Rope to the pier and an oar resting across the thwart.
  c.hline(2, 12, 3, PAL.sand);
  c.set(1, 13, PAL.sand);
  c.hline(18, 6, 14, PAL.sand);
  c.rect(30, 5, 4, 3, PAL.sand);
  c.outline(PAL.ink);
}

function crate(c: PixelCanvas): void {
  c.rect(2, 3, 12, 11, PAL.tan);
  c.frame(2, 3, 12, 11, PAL.bark);
  c.hline(3, 4, 10, PAL.sand);
  c.hline(2, 8, 12, PAL.bark);
  for (let i = 0; i < 9; i++) c.set(4 + i, 5 + Math.floor(i / 1.5), PAL.wood);
  c.hline(3, 13, 10, PAL.cocoa);
  c.outline(PAL.ink);
}

function barrel(c: PixelCanvas): void {
  c.ellipse(8, 8, 6, 7, PAL.wood);
  c.rect(2, 4, 12, 9, PAL.wood);
  c.vline(5, 3, 11, PAL.tan);
  c.vline(10, 3, 11, PAL.bark);
  c.hline(2, 5, 12, PAL.ash);
  c.hline(2, 11, 12, PAL.ash);
  c.ellipse(8, 3, 5, 2, PAL.bark);
  c.ellipse(8, 3, 3.5, 1.2, mix(PAL.bark, PAL.sky, 0.4));
  c.outline(PAL.ink);
}

export function addRiverTiles(set: Tileset): void {
  set.add('river_bridge_top_0', (c) => bridge(c, 'top', true, 3));
  set.add('river_bridge_top_1', (c) => bridge(c, 'top', false, 5));
  set.add('river_bridge_bot_0', (c) => bridge(c, 'bottom', true, 7));
  set.add('river_bridge_bot_1', (c) => bridge(c, 'bottom', false, 9));
  set.add('river_pier_top', (c) => pier(c, 'top', 11));
  set.add('river_pier_bot_0', (c) => pier(c, 'bottom', 13));
  set.add('river_pier_bot_1', (c) => pier(c, 'bottom', 15));
  set.add('river_post', post, { solid: true });
  set.add('river_reeds_0', (c) => reeds(c, 0));
  set.add('river_reeds_1', (c) => reeds(c, 1));
  set.addBlock('river_willow', 5, 5, willow, (_c, row) => ({ solid: true, sortOffset: 4 - row }));
  set.addBlock('river_boat', 3, 2, boat, (_c, row) => ({ solid: true, sortOffset: 1 - row }));
  set.add('river_crate', crate, { solid: true });
  set.add('river_barrel', barrel, { solid: true });
}
