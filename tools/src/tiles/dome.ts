import { TILE } from '@study/shared';
import { mix, PAL, withAlpha } from '../palette';
import { makeRng, PixelCanvas } from '../png';
import { addAutotile, Tileset, speckle } from './tileset';

export type Shade = 'a' | 'b' | 'c';

export const SEA: Record<Shade, string> = {
  a: mix(PAL.water, PAL.sky, 0.3),
  b: mix(PAL.water, PAL.deep, 0.3),
  c: mix(PAL.deep, PAL.navy, 0.3),
};
const STEEL = mix(PAL.slate, PAL.sky, 0.3);
const STEEL_LIGHT = mix(STEEL, PAL.cream, 0.5);
const STEEL_DARK = mix(PAL.ash, PAL.deep, 0.45);
const SAND = mix(PAL.sand, PAL.water, 0.2);
const TEAL = '#3f9aa0';
const TEAL_LIGHT = '#79cfc6';
const TEAL_DARK = '#2a6a78';

function seaTile(c: PixelCanvas, shade: Shade, seed: number): void {
  const base = SEA[shade];
  c.rect(0, 0, 16, 16, base);
  const rand = makeRng(seed);
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(rand() * 10);
    const y = 1 + Math.floor(rand() * 14);
    c.hline(x, y, 3 + Math.floor(rand() * 3), mix(base, '#ffffff', 0.14));
  }
  for (let i = 0; i < 5; i++) c.set(Math.floor(rand() * 16), Math.floor(rand() * 16), mix(base, PAL.ink, 0.14));
}

function surfaceTile(c: PixelCanvas, seed: number): void {
  c.rect(0, 0, 16, 16, mix(SEA.a, '#ffffff', 0.18));
  const rand = makeRng(seed);
  for (let x = 0; x < 16; x++) {
    const y = 3 + Math.round(Math.sin((x + seed) * 0.8) * 1.4);
    c.set(x, y, '#ffffff');
    c.set(x, y + 1, mix(SEA.a, '#ffffff', 0.45));
  }
  for (let i = 0; i < 5; i++) c.set(Math.floor(rand() * 16), 6 + Math.floor(rand() * 10), mix(SEA.a, '#ffffff', 0.3));
}

function sandTile(c: PixelCanvas, seed: number): void {
  c.rect(0, 0, 16, 16, SAND);
  const rand = makeRng(seed);
  speckle(c, rand, 10, mix(SAND, PAL.cream, 0.5));
  speckle(c, rand, 8, mix(SAND, PAL.bark, 0.3));
  c.hline(1, 6, 5, mix(SAND, PAL.bark, 0.2));
  c.hline(9, 11, 5, mix(SAND, PAL.bark, 0.2));
  c.hline(0, 0, 16, mix(SAND, SEA.c, 0.35));
}

function metalTile(c: PixelCanvas, seed: number): void {
  c.rect(0, 0, 16, 16, STEEL);
  c.hline(0, 0, 16, STEEL_LIGHT);
  c.vline(0, 0, 16, STEEL_LIGHT);
  c.hline(0, 15, 16, STEEL_DARK);
  c.vline(15, 0, 16, STEEL_DARK);
  for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]] as const) c.set(x, y, STEEL_DARK);
  for (let x = 5; x < 12; x += 2) for (let y = 5; y < 12; y += 2) c.set(x, y, mix(STEEL, STEEL_DARK, 0.45));
  speckle(c, makeRng(seed), 4, STEEL_LIGHT);
}

function woodTile(c: PixelCanvas, shift: number): void {
  const plank = mix(PAL.tan, PAL.sand, 0.25);
  c.rect(0, 0, 16, 16, plank);
  for (const x of [0, 5, 10]) {
    c.vline(x, 0, 16, mix(plank, PAL.cream, 0.3));
    c.vline(x + 4, 0, 16, mix(plank, PAL.wood, 0.5));
  }
  for (const [x, y] of [[2, (shift + 3) % 16], [7, (shift + 9) % 16], [12, (shift + 14) % 16]] as const) c.set(x, y, mix(plank, PAL.wood, 0.7));
  c.hline(0, 15, 16, mix(plank, PAL.wood, 0.4));
}

function hullTile(c: PixelCanvas): void {
  c.rect(0, 0, 16, 16, STEEL_DARK);
  c.rect(0, 0, 16, 5, STEEL);
  c.hline(0, 0, 16, PAL.ink);
  c.hline(0, 1, 16, STEEL_LIGHT);
  c.hline(0, 5, 16, mix(STEEL_DARK, PAL.ink, 0.5));
  for (const x of [3, 11]) {
    c.set(x, 3, STEEL_LIGHT);
    c.set(x, 9, STEEL);
    c.set(x, 13, STEEL);
  }
  c.hline(0, 15, 16, SAND);
}

/** Distance from the pixel centre (x, y) to the rectangle of a neighbouring cell. */
function distanceToCell(x: number, y: number, cx: number, cy: number): number {
  const x0 = cx * TILE;
  const y0 = cy * TILE;
  const dx = Math.max(x0 - (x + 0.5), 0, x + 0.5 - (x0 + TILE));
  const dy = Math.max(y0 - (y + 0.5), 0, y + 0.5 - (y0 + TILE));
  return Math.hypot(dx, dy);
}

/** The eight neighbours, in bit order. */
export const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

/**
 * A tile of the dome's curved glass wall. `mask` has a bit set for every one
 * of the 8 neighbours that is open sea. Distance to the nearest sea cell
 * picks water, glass, frame or floor, so corners come out round.
 */
function glassTile(c: PixelCanvas, shade: Shade, mask: number): void {
  const sea = SEA[shade];
  const glassTint = mix(sea, '#d8f6f4', 0.36);
  const seaCells = NEIGHBOURS.filter((_n, i) => mask & (1 << i));
  const rand = makeRng(mask * 13 + shade.charCodeAt(0));
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let d = 99;
      for (const [nx, ny] of seaCells) d = Math.min(d, distanceToCell(x, y, nx, ny));
      let color: string;
      if (d < 5) color = rand() < 0.07 ? mix(sea, '#ffffff', 0.16) : sea;
      else if (d < 12.5) color = (x - y + 32) % 9 === 0 || (x - y + 32) % 9 === 1 ? mix(glassTint, '#ffffff', 0.4) : glassTint;
      else if (d < 14) color = STEEL_LIGHT;
      else if (d < 15.5) color = STEEL;
      else if (d < 16.5) color = STEEL_DARK;
      else color = (x + y) % 8 === 0 ? STEEL_LIGHT : STEEL;
      c.set(x, y, color);
    }
  }
}

/** Registers (once) the glass tile for a neighbour mask and returns its name. */
export function ensureGlass(set: Tileset, shade: Shade, mask: number): string {
  const name = `glass_${shade}_${mask}`;
  if (!set.has(name)) set.add(name, (c) => glassTile(c, shade, mask), { solid: true });
  return name;
}

function fish(c: PixelCanvas, x: number, y: number, body: string, dark: string, right: boolean): void {
  const dir = right ? 1 : -1;
  c.ellipse(x, y, 3, 1.8, body);
  c.set(x - dir * 4, y - 1, dark);
  c.set(x - dir * 4, y, dark);
  c.set(x - dir * 4, y + 1, dark);
  c.set(x - dir * 3, y, dark);
  c.set(x + dir * 2, y - 1, PAL.ink);
  c.hline(x - 2, y + 1, 4, dark);
}

function kelp(c: PixelCanvas, x: number, top: number, bottom: number, phase: number): void {
  for (let y = top; y <= bottom; y++) {
    const off = Math.round(Math.sin((y + phase) * 0.55) * 1.4);
    c.set(x + off, y, PAL.leafDark);
    c.set(x + off + 1, y, y % 3 === 0 ? PAL.leaf : PAL.leafDark);
    if (y % 5 === 0) c.set(x + off - 1, y + 1, PAL.leaf);
    if (y % 5 === 2) c.set(x + off + 2, y + 1, PAL.leaf);
  }
}

function coral(c: PixelCanvas, x: number, baseY: number, h: number, body: string): void {
  const dark = mix(body, PAL.ink, 0.35);
  const light = mix(body, PAL.cream, 0.4);
  c.vline(x, baseY - h, h, body);
  c.vline(x + 1, baseY - h, h, dark);
  for (const [dx, dy, len] of [[-3, 3, 4], [3, 5, 4], [-2, 7, 3], [4, 2, 3]] as const) {
    if (dy > h) continue;
    c.hline(Math.min(x, x + dx), baseY - h + dy, Math.abs(dx) + 1, body);
    c.vline(x + dx, baseY - h + dy - len + 1, len, body);
    c.set(x + dx, baseY - h + dy - len, light);
  }
  c.set(x, baseY - h - 1, light);
}

function tank(c: PixelCanvas): void {
  const W = 96;
  c.rect(1, 32, W - 2, 16, STEEL);
  c.hline(1, 32, W - 2, STEEL_LIGHT);
  c.hline(1, 46, W - 2, STEEL_DARK);
  for (const x of [1, 33, 65, 94]) c.vline(x, 33, 14, STEEL_DARK);
  for (const x of [16, 48, 80]) {
    c.vline(x, 34, 11, STEEL_DARK);
    c.rect(x - 3, 38, 2, 4, STEEL_LIGHT);
    c.rect(x + 2, 38, 2, 4, STEEL_LIGHT);
  }
  c.rect(0, 2, W, 31, PAL.ink);
  for (let y = 4; y < 29; y++) c.hline(2, y, W - 4, mix(mix(PAL.sky, '#ffffff', 0.1), SEA.c, (y - 4) / 26));
  for (let i = 0; i < 40; i++) {
    const x = 3 + ((i * 37) % 90);
    const y = 5 + ((i * 11) % 20);
    c.set(x, y, mix(SEA.b, '#ffffff', 0.18));
  }
  c.rect(2, 26, W - 4, 3, SAND);
  speckle(c, makeRng(3), 14, mix(SAND, PAL.bark, 0.3));
  kelp(c, 12, 10, 26, 0);
  kelp(c, 40, 8, 26, 3);
  kelp(c, 78, 12, 26, 6);
  coral(c, 26, 27, 10, PAL.pink);
  coral(c, 62, 27, 12, PAL.coral);
  coral(c, 88, 27, 8, PAL.lilac);
  fish(c, 20, 12, PAL.coral, PAL.brick, true);
  fish(c, 52, 17, PAL.gold, PAL.amber, false);
  fish(c, 68, 10, '#79cfc6', TEAL_DARK, true);
  fish(c, 34, 20, PAL.pink, PAL.plum, true);
  fish(c, 84, 18, PAL.gold, PAL.amber, true);
  for (const [x, y] of [[45, 8], [47, 5], [46, 11], [72, 14], [74, 10]] as const) {
    c.set(x, y, '#ffffff');
    c.set(x + 1, y, withAlpha('#ffffff', 0.6));
  }
  c.rect(0, 0, W, 4, STEEL);
  c.hline(0, 0, W, STEEL_LIGHT);
  c.hline(0, 3, W, STEEL_DARK);
  c.rect(6, 1, W - 12, 2, PAL.glow);
  c.hline(2, 5, W - 4, withAlpha('#ffffff', 0.5));
  c.outline(PAL.ink);
}

function podDesk(c: PixelCanvas): void {
  c.ellipse(8, 14, 5, 2, STEEL_DARK);
  c.rect(7, 8, 2, 6, STEEL);
  c.ellipse(8, 6, 7.5, 4, PAL.tan);
  c.ellipse(8, 5, 7, 3.5, mix(PAL.sand, PAL.cream, 0.3));
  c.pattern(3, 4, ['kkkk', 'kwwk'], { k: PAL.deep, w: PAL.cream });
  c.rect(10, 5, 3, 2, PAL.cream);
  c.hline(10, 6, 3, PAL.slate);
  c.outline(PAL.ink);
}

function podChair(c: PixelCanvas, fromBehind: boolean): void {
  if (fromBehind) {
    c.rect(3, 3, 10, 6, TEAL);
    c.hline(3, 3, 10, TEAL_LIGHT);
    c.rect(3, 9, 10, 3, TEAL_DARK);
  } else {
    c.rect(3, 1, 10, 6, TEAL_DARK);
    c.hline(3, 1, 10, TEAL);
    c.rect(3, 7, 10, 5, TEAL);
    c.hline(3, 7, 10, TEAL_LIGHT);
  }
  c.rect(7, 12, 2, 2, STEEL);
  c.hline(4, 14, 8, STEEL_DARK);
  c.outline(PAL.ink);
}

function beanbag(c: PixelCanvas, body: string): void {
  c.ellipse(8, 10, 7, 5.5, mix(body, PAL.ink, 0.3));
  c.ellipse(8, 9, 6.5, 5, body);
  c.ellipse(5.5, 6.5, 3, 1.8, mix(body, PAL.cream, 0.4));
  c.hline(2, 10, 12, mix(body, PAL.ink, 0.2));
  c.outline(PAL.ink);
}

function shelf(c: PixelCanvas, seed: number): void {
  const rand = makeRng(seed);
  c.rect(1, 3, 14, 28, STEEL);
  c.rect(1, 2, 14, 2, STEEL_LIGHT);
  c.vline(1, 3, 28, STEEL_LIGHT);
  c.vline(14, 3, 28, STEEL_DARK);
  const colours = [PAL.coral, PAL.deep, PAL.leafDark, PAL.gold, PAL.plum, TEAL, PAL.cream];
  for (let s = 0; s < 3; s++) {
    const top = 5 + s * 8;
    c.rect(2, top, 12, 7, mix(STEEL_DARK, PAL.ink, 0.5));
    let x = 2;
    while (x < 14) {
      const w = rand() < 0.3 && x < 13 ? 2 : 1;
      const h = 4 + Math.floor(rand() * 3);
      const colour = colours[Math.floor(rand() * colours.length)]!;
      c.rect(x, top + 7 - h, w, h, colour);
      c.set(x, top + 8 - h, mix(colour, PAL.cream, 0.5));
      x += w;
    }
  }
  c.rect(1, 29, 14, 2, STEEL_DARK);
  c.outline(PAL.ink);
}

function planter(c: PixelCanvas): void {
  c.rect(3, 22, 10, 8, STEEL);
  c.rect(2, 21, 12, 3, STEEL_LIGHT);
  c.hline(3, 29, 10, STEEL_DARK);
  kelp(c, 5, 6, 21, 0);
  kelp(c, 10, 9, 21, 4);
  c.ellipse(8, 20, 4, 2, PAL.leaf);
  c.set(7, 18, PAL.pink);
  c.set(11, 17, PAL.coral);
  c.outline(PAL.ink);
}

function hatch(c: PixelCanvas): void {
  const w = 32;
  c.ellipse(w / 2, 16, 15, 14, STEEL_DARK);
  c.ellipse(w / 2, 16, 14, 13, STEEL);
  c.ellipse(w / 2, 16, 11, 10, mix(STEEL, STEEL_DARK, 0.4));
  c.ellipse(w / 2, 16, 8, 7, TEAL_DARK);
  c.ellipse(w / 2, 16, 6, 5, TEAL);
  c.ellipse(w / 2 - 1, 15, 3, 2, TEAL_LIGHT);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.set(Math.round(w / 2 + Math.cos(a) * 12.5), Math.round(16 + Math.sin(a) * 11.5), STEEL_LIGHT);
  }
  c.rect(w / 2 - 6, 15, 12, 2, STEEL_LIGHT);
  c.rect(w / 2 - 1, 10, 2, 12, STEEL_LIGHT);
  c.outline(PAL.ink);
}

function vent(c: PixelCanvas): void {
  c.ellipse(8, 9, 6, 3.5, STEEL_DARK);
  c.ellipse(8, 9, 5, 2.5, TEAL_DARK);
  for (const x of [5, 7, 9, 11]) c.vline(x, 8, 3, STEEL);
  c.outline(PAL.ink);
}

function bubbles(c: PixelCanvas): void {
  for (const [x, y, r] of [[8, 27, 2.2], [6, 20, 1.6], [10, 15, 2], [7, 8, 1.4], [9, 3, 1]] as const) {
    c.ellipse(x, y, r, r, withAlpha('#ffffff', 0.35));
    c.set(Math.round(x - r / 2), Math.round(y - r / 2), '#ffffff');
    for (let a = 0; a < 8; a++) c.set(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), withAlpha('#ffffff', 0.8));
  }
}

function rock(c: PixelCanvas): void {
  c.ellipse(16, 11, 13, 5, mix(PAL.slate, SEA.c, 0.4));
  c.ellipse(14, 9.5, 10, 3.5, mix(PAL.stone, SEA.c, 0.35));
  c.set(10, 8, PAL.cream);
  c.outline(mix(PAL.ink, SEA.c, 0.3));
}

/** Tiles for the glass dome. */
export function buildDomeTileset(): Tileset {
  const set = new Tileset('dome');
  (['a', 'b', 'c'] as const).forEach((shade, i) => {
    set.add(`sea_${shade}_0`, (c) => seaTile(c, shade, 10 + i), { solid: true });
    set.add(`sea_${shade}_1`, (c) => seaTile(c, shade, 20 + i), { solid: true });
  });
  set.add('surface_0', (c) => surfaceTile(c, 1), { solid: true });
  set.add('surface_1', (c) => surfaceTile(c, 5), { solid: true });
  set.add('sand_0', (c) => sandTile(c, 3), { solid: true });
  set.add('sand_1', (c) => sandTile(c, 8), { solid: true });
  set.add('hull', hullTile, { solid: true });
  set.add('metal_0', (c) => metalTile(c, 1));
  set.add('metal_1', (c) => metalTile(c, 6));
  set.add('wood_0', (c) => woodTile(c, 0));
  set.add('wood_1', (c) => woodTile(c, 7));

  addAutotile(set, 'rug', {
    fill: (c) => {
      c.rect(0, 0, 16, 16, TEAL);
      for (let y = 2; y < 16; y += 6) for (let x = 2; x < 16; x += 6) c.set(x, y, TEAL_LIGHT);
      for (let y = 5; y < 16; y += 6) for (let x = 5; x < 16; x += 6) c.set(x, y, TEAL_DARK);
    },
    rim: PAL.cream,
    inset: 1,
    wobble: false,
  });

  set.add('pod_desk', podDesk, { solid: true });
  set.add('pod_chair_down', (c) => podChair(c, false), { solid: true });
  set.add('pod_chair_up', (c) => podChair(c, true), { solid: true });
  set.add('bean_coral', (c) => beanbag(c, PAL.coral), { solid: true });
  set.add('bean_teal', (c) => beanbag(c, TEAL), { solid: true });
  set.add('bean_gold', (c) => beanbag(c, PAL.gold), { solid: true });
  [11, 22, 33].forEach((seed, i) => set.addBlock(`shelf_${i}`, 1, 2, (c) => shelf(c, seed), (_x, row) => ({ solid: row === 1, sortOffset: 1 - row })));
  set.addBlock('planter', 1, 2, planter, (_x, row) => ({ solid: row === 1, sortOffset: 1 - row }));
  set.addBlock('tank', 6, 3, tank, (_x, row) => ({ solid: true, sortOffset: 2 - row }));
  set.addBlock('hatch', 2, 2, hatch, () => ({}));
  set.add('vent', vent);
  set.addBlock('bubbles', 1, 2, bubbles, () => ({}));

  // Scenery beyond the glass: drawn over open sea, so nothing here is walkable.
  set.addBlock('kelp_a', 1, 3, (c) => kelp(c, 7, 4, 46, 0), () => ({}));
  set.addBlock('kelp_b', 2, 3, (c) => { kelp(c, 8, 10, 46, 2); kelp(c, 22, 2, 46, 5); kelp(c, 26, 14, 46, 8); }, () => ({}));
  set.addBlock('coral_a', 2, 2, (c) => { coral(c, 8, 30, 14, PAL.pink); coral(c, 20, 30, 10, PAL.coral); coral(c, 26, 30, 16, PAL.lilac); }, () => ({}));
  set.addBlock('coral_b', 2, 2, (c) => { coral(c, 7, 30, 18, PAL.coral); coral(c, 17, 30, 12, PAL.gold); coral(c, 25, 30, 9, PAL.pink); }, () => ({}));
  set.addBlock('rock', 2, 1, rock, () => ({}));
  set.addBlock('school', 3, 1, (c) => {
    fish(c, 10, 6, PAL.gold, PAL.amber, true);
    fish(c, 24, 10, PAL.gold, PAL.amber, true);
    fish(c, 36, 5, PAL.gold, PAL.amber, true);
    fish(c, 18, 3, PAL.gold, PAL.amber, true);
  }, () => ({}));
  set.addBlock('school_b', 3, 1, (c) => {
    fish(c, 14, 8, '#79cfc6', TEAL_DARK, false);
    fish(c, 30, 5, '#79cfc6', TEAL_DARK, false);
    fish(c, 38, 11, PAL.pink, PAL.plum, false);
  }, () => ({}));
  return set;
}
