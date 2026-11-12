import { mix, PAL, withAlpha } from '../palette';
import { makeRng, PixelCanvas } from '../png';
import { grassFill, leafTexture, SOIL } from './outdoorKit';
import { addAutotile, speckle, type Tileset } from './tileset';

export const FLOWER_COLOURS = ['coral', 'pink', 'gold', 'cream', 'lilac', 'sky'] as const;
export type FlowerColour = (typeof FLOWER_COLOURS)[number];

const PETAL: Record<FlowerColour, [string, string]> = {
  coral: [PAL.coral, PAL.peach],
  pink: [PAL.pink, PAL.blush],
  gold: [PAL.gold, PAL.glow],
  cream: [PAL.cream, '#ffffff'],
  lilac: [PAL.lilac, PAL.blush],
  sky: [PAL.water, PAL.sky],
};

/** One flower: stem, leaf, 3x3 head with a bright centre. */
function flower(c: PixelCanvas, x: number, y: number, petals: [string, string]): void {
  c.vline(x, y + 3, 5, PAL.leafDark);
  c.set(x - 1, y + 5, PAL.leaf);
  c.set(x + 1, y + 6, PAL.leaf);
  c.rect(x - 1, y, 3, 3, petals[0]);
  c.set(x - 1, y, petals[1]);
  c.set(x, y + 1, PAL.gold);
  c.set(x - 2, y + 1, petals[0]);
  c.set(x + 2, y + 1, petals[0]);
  c.set(x, y - 1, petals[0]);
}

function hedge(set: Tileset): void {
  addAutotile(
    set,
    'garden_hedge',
    {
      fill: (c) => {
        const rand = makeRng(91);
        c.rect(0, 0, 16, 16, PAL.leafDark);
        speckle(c, rand, 20, PAL.leaf);
        speckle(c, rand, 12, PAL.pine);
        speckle(c, rand, 6, PAL.leafLight);
        for (let x = 2; x < 16; x += 5) c.set(x, 4 + (x % 3), PAL.glow);
      },
      outside: (c) => grassFill(c, 11),
      rim: PAL.moss,
      inset: 1,
      wobble: true,
    },
    { solid: true },
  );
}

function bed(set: Tileset): void {
  addAutotile(set, 'garden_bed', {
    fill: (c) => {
      const rand = makeRng(17);
      c.rect(0, 0, 16, 16, SOIL);
      speckle(c, rand, 18, PAL.cocoa);
      speckle(c, rand, 8, PAL.wood);
    },
    outside: (c) => grassFill(c, 11),
    rim: PAL.cocoa,
    inset: 1,
    wobble: false,
  });
  FLOWER_COLOURS.forEach((colour) => {
    set.add(`garden_fl_${colour}_0`, (c) => {
      flower(c, 4, 2, PETAL[colour]);
      flower(c, 11, 5, PETAL[colour]);
    });
    set.add(`garden_fl_${colour}_1`, (c) => {
      flower(c, 8, 1, PETAL[colour]);
      flower(c, 3, 7, PETAL[colour]);
      flower(c, 12, 8, PETAL[colour]);
    });
  });
}

export function sharedTree(c: PixelCanvas): void {
  const rand = makeRng(404);
  const W = c.width;
  c.ellipse(48, 89, 26, 6, withAlpha(PAL.ink, 0.3));
  // Trunk with a flared base and two limbs reaching into the crown.
  c.rect(41, 50, 14, 38, PAL.bark);
  c.rect(37, 82, 22, 6, PAL.bark);
  c.rect(34, 86, 28, 3, PAL.bark);
  c.vline(41, 50, 38, PAL.cocoa);
  c.vline(42, 52, 34, PAL.cocoa);
  c.vline(48, 52, 30, PAL.wood);
  c.vline(49, 56, 24, PAL.wood);
  c.vline(54, 50, 36, PAL.cocoa);
  for (let i = 0; i < 12; i++) c.set(41 + Math.floor(rand() * 14), 52 + Math.floor(rand() * 32), PAL.wood);
  for (let i = 0; i < 9; i++) {
    c.set(33 - i, 46 - Math.floor(i * 0.9), PAL.bark);
    c.set(34 - i, 46 - Math.floor(i * 0.9), PAL.bark);
    c.set(62 + i, 46 - Math.floor(i * 0.9), PAL.bark);
    c.set(61 + i, 46 - Math.floor(i * 0.9), PAL.bark);
  }
  // Crown: a dark mass first, then lighter blobs towards the upper left.
  c.ellipse(48, 32, 44, 30, PAL.pine);
  for (const [x, y, r] of [[12, 42, 13], [84, 42, 13], [22, 20, 15], [74, 20, 15], [48, 10, 17], [10, 30, 10], [86, 30, 10]] as const) {
    c.ellipse(x, y, r, r * 0.82, PAL.pine);
  }
  c.ellipse(47, 31, 38, 25, PAL.leafDark);
  for (const [x, y, r] of [[20, 24, 13], [66, 22, 13], [44, 14, 15], [30, 38, 12], [64, 38, 12]] as const) {
    c.ellipse(x, y, r, r * 0.8, PAL.leafDark);
  }
  c.ellipse(42, 26, 26, 17, PAL.leaf);
  c.ellipse(34, 20, 14, 9, PAL.leaf);
  c.ellipse(38, 17, 11, 6, PAL.leafLight);
  c.ellipse(60, 24, 9, 5, PAL.leaf);
  leafTexture(c, rand, 520);
  // Blossoms and a few golden fruits, so it reads as the special tree.
  for (let i = 0; i < 46; i++) {
    const x = 6 + Math.floor(rand() * (W - 12));
    const y = 4 + Math.floor(rand() * 50);
    if (!c.get(x, y)) continue;
    c.set(x, y, PAL.pink);
    c.set(x + 1, y, PAL.blush);
    if (rand() < 0.3) c.set(x, y + 1, PAL.blush);
  }
  for (const [x, y] of [[30, 34], [58, 40], [70, 30], [24, 28], [48, 44]] as const) {
    c.rect(x, y, 2, 2, PAL.gold);
    c.set(x, y, PAL.glow);
  }
  c.outline(PAL.ink);
}

function greenhouse(c: PixelCanvas): void {
  const w = c.width;
  const frame = PAL.cream;
  const shade = PAL.stone;
  // Roof: a low gable with a ridge.
  c.rect(4, 8, w - 8, 6, shade);
  c.rect(10, 3, w - 20, 5, shade);
  c.hline(10, 3, w - 20, PAL.fog);
  c.hline(4, 8, w - 8, PAL.fog);
  c.hline(4, 13, w - 8, PAL.slate);
  c.hline(10, 7, w - 20, PAL.slate);
  // Glass walls with plants inside.
  c.rect(4, 14, w - 8, 42, PAL.sky);
  c.rect(4, 14, w - 8, 12, mix(PAL.sky, PAL.cream, 0.45));
  for (let x = 10; x < w - 10; x += 12) {
    c.ellipse(x + 3, 46, 5, 8, PAL.leaf);
    c.ellipse(x + 3, 44, 3, 5, PAL.leafLight);
    c.rect(x, 52, 7, 4, PAL.coral);
    c.set(x + 2, 40, PAL.pink);
    c.set(x + 5, 43, PAL.gold);
  }
  // Frame, mullions and shine.
  for (let x = 4; x < w - 4; x += 12) c.vline(x, 14, 42, frame);
  c.vline(w - 5, 14, 42, frame);
  c.hline(4, 14, w - 8, frame);
  c.hline(4, 28, w - 8, frame);
  for (let x = 8; x < w - 8; x += 12) {
    c.set(x, 18, '#ffffff');
    c.set(x + 1, 19, '#ffffff');
    c.set(x + 2, 20, '#ffffff');
  }
  // Door: dark frame, two glazed leaves.
  const dx = w / 2 - 8;
  c.rect(dx, 28, 16, 28, PAL.bark);
  c.rect(dx + 2, 30, 5, 26, PAL.sky);
  c.rect(dx + 9, 30, 5, 26, PAL.sky);
  c.set(dx + 7, 44, PAL.gold);
  c.set(dx + 8, 44, PAL.gold);
  // Stone base course.
  c.rect(2, 56, w - 4, 8, PAL.stone);
  c.hline(2, 56, w - 4, PAL.fog);
  c.hline(2, 63, w - 4, PAL.slate);
  for (let x = 8; x < w - 4; x += 14) c.vline(x, 57, 6, PAL.slate);
  c.outline(PAL.ink);
}

function arbour(c: PixelCanvas): void {
  const rand = makeRng(63);
  const w = c.width;
  // Two posts and an arched crown of vine.
  for (const x of [4, w - 9]) {
    c.rect(x, 8, 5, 24, PAL.wood);
    c.vline(x, 8, 24, PAL.bark);
    c.vline(x + 3, 8, 24, PAL.tan);
    c.rect(x - 1, 28, 7, 4, PAL.bark);
  }
  c.rect(4, 4, w - 8, 5, PAL.wood);
  c.hline(4, 4, w - 8, PAL.tan);
  c.hline(4, 8, w - 8, PAL.bark);
  c.rect(10, 1, w - 20, 4, PAL.wood);
  c.hline(10, 1, w - 20, PAL.tan);
  // Vines hang over the beam and run down the posts.
  for (let x = 4; x < w - 4; x++) {
    if (rand() < 0.8) c.vline(x, 2, 3 + Math.floor(rand() * 8), rand() < 0.5 ? PAL.leaf : PAL.leafDark);
  }
  for (const x of [5, w - 8]) {
    for (let y = 10; y < 30; y += 2) c.set(x + Math.floor(rand() * 3), y, rand() < 0.5 ? PAL.leaf : PAL.leafDark);
  }
  for (let i = 0; i < 16; i++) {
    const x = 6 + Math.floor(rand() * (w - 12));
    const y = 2 + Math.floor(rand() * 9);
    c.set(x, y, i % 2 ? PAL.pink : PAL.cream);
    c.set(x + 1, y, PAL.blush);
  }
  c.outline(PAL.ink);
}

function sideBench(c: PixelCanvas, facing: 'left' | 'right'): void {
  const back = new PixelCanvas(16, 32);
  back.rect(2, 2, 3, 28, PAL.wood);
  back.vline(2, 2, 28, PAL.tan);
  back.rect(5, 4, 8, 25, PAL.tan);
  back.vline(5, 4, 25, PAL.sand);
  for (const y of [10, 16, 22]) back.hline(5, y, 8, PAL.wood);
  back.rect(4, 29, 2, 2, PAL.bark);
  back.rect(11, 29, 2, 2, PAL.bark);
  back.outline(PAL.ink);
  c.blit(back, 0, 0, facing === 'left');
}

function stones(set: Tileset): void {
  [0, 1].forEach((v) => {
    set.add(`garden_stone_${v}`, (c) => {
      const cx = v === 0 ? 7 : 9;
      const cy = v === 0 ? 9 : 7;
      c.ellipse(cx, cy + 1, 7, 4.5, withAlpha(PAL.sky, 0.75));
      c.ellipse(cx, cy, 5.5, 3.5, PAL.stone);
      c.ellipse(cx - 1, cy - 1, 3.5, 1.8, PAL.fog);
      c.set(cx + 3, cy + 1, PAL.slate);
      c.set(cx + 2, cy + 2, PAL.slate);
      c.outline(PAL.ink);
    });
  });
}

function lilies(set: Tileset): void {
  const pad = (c: PixelCanvas, x: number, y: number): void => {
    c.ellipse(x, y, 4, 2.6, PAL.leafDark);
    c.ellipse(x - 0.5, y - 0.5, 3, 1.8, PAL.leaf);
    c.set(x + 3, y, PAL.water);
    c.set(x + 2, y, PAL.water);
  };
  set.add('garden_lily_0', (c) => {
    pad(c, 5, 6);
    pad(c, 11, 11);
  });
  set.add('garden_lily_1', (c) => {
    pad(c, 10, 5);
    pad(c, 4, 11);
    c.rect(9, 3, 3, 2, PAL.pink);
    c.set(10, 2, PAL.blush);
    c.set(10, 3, PAL.gold);
  });
}

function blanket(c: PixelCanvas): void {
  const w = c.width;
  const h = c.height;
  c.rect(2, 3, w - 4, h - 6, PAL.cream);
  for (let y = 3; y < h - 3; y += 6) {
    for (let x = 2; x < w - 2; x += 6) {
      if (((x - 2) / 6 + (y - 3) / 6) % 2 === 0) c.rect(x, y, Math.min(6, w - 2 - x), Math.min(6, h - 3 - y), PAL.coral);
    }
  }
  c.frame(2, 3, w - 4, h - 6, PAL.brick);
  // Basket, plates and a cup.
  c.rect(6, 8, 10, 7, PAL.tan);
  c.hline(6, 8, 10, PAL.sand);
  for (let x = 6; x < 16; x += 2) c.vline(x, 10, 5, PAL.wood);
  c.hline(5, 7, 12, PAL.wood);
  c.rect(w - 14, h - 14, 7, 3, PAL.cream);
  c.hline(w - 14, h - 12, 7, PAL.fog);
  c.rect(w - 10, 9, 3, 3, PAL.wine);
  c.outline(PAL.ink);
}

function pillar(c: PixelCanvas): void {
  c.rect(3, 6, 10, 26, PAL.stone);
  c.vline(3, 6, 26, PAL.fog);
  c.vline(12, 6, 26, PAL.slate);
  for (let y = 12; y < 32; y += 6) c.hline(3, y, 10, PAL.slate);
  c.rect(1, 3, 14, 4, PAL.fog);
  c.hline(1, 6, 14, PAL.slate);
  c.rect(5, 0, 6, 3, PAL.glow);
  c.hline(5, 0, 6, PAL.gold);
  c.rect(2, 28, 12, 4, PAL.slate);
  c.outline(PAL.ink);
}

export function addGardenTiles(set: Tileset): void {
  hedge(set);
  bed(set);
  stones(set);
  lilies(set);
  set.addBlock('garden_tree', 6, 6, sharedTree, (_c, row) => ({ solid: true, sortOffset: 5 - row }));
  set.addBlock('garden_greenhouse', 6, 4, greenhouse, (_c, row) => ({ solid: true, sortOffset: 3 - row }));
  set.addBlock('garden_arbour', 4, 2, arbour, (col, row) => ({ solid: row === 1 && (col === 0 || col === 3), sortOffset: 1 - row }));
  set.addBlock('garden_bench_r', 1, 2, (c) => sideBench(c, 'right'), (_c, row) => ({ solid: true, sortOffset: 1 - row }));
  set.addBlock('garden_bench_l', 1, 2, (c) => sideBench(c, 'left'), (_c, row) => ({ solid: true, sortOffset: 1 - row }));
  set.addBlock('garden_blanket', 2, 2, blanket, () => ({}));
  set.addBlock('garden_pillar', 1, 2, pillar, (_c, row) => ({ solid: row === 1, sortOffset: 1 - row }));
}
