import { mix, PAL, withAlpha } from '../palette';
import { makeRng, PixelCanvas } from '../png';
import { addAutotile, speckle, Tileset } from './tileset';

function grass(c: PixelCanvas, seed: number): void {
  const rand = makeRng(seed);
  c.rect(0, 0, 16, 16, PAL.leaf);
  speckle(c, rand, 9, PAL.leafLight);
  speckle(c, rand, 6, PAL.leafDark);
}

function tuft(c: PixelCanvas, x: number, y: number): void {
  c.pattern(x, y, ['d.d', '.d.'], { d: PAL.leafDark });
  c.set(x + 1, y, PAL.leafLight);
}

function flower(c: PixelCanvas, x: number, y: number, petal: string): void {
  c.pattern(x, y, ['.p.', 'pyp', '.p.', '.s.'], { p: petal, y: PAL.gold, s: PAL.leafDark });
}

function roof(c: PixelCanvas, col: 'l' | 'm' | 'r', row: 't' | 'm' | 'b'): void {
  c.rect(0, 0, 16, 16, PAL.brick);
  for (let y = 3; y < 16; y += 4) {
    c.hline(0, y, 16, PAL.wine);
    const shift = ((y - 3) / 4) % 2 === 0 ? 0 : 4;
    for (let x = shift; x < 16; x += 8) c.vline(x, y - 3, 3, PAL.wine);
    for (let x = shift + 2; x < 16; x += 8) c.set(x, y - 2, PAL.coral);
  }
  if (row === 't') {
    c.hline(0, 0, 16, PAL.ink);
    c.hline(0, 1, 16, PAL.peach);
    c.hline(0, 2, 16, PAL.coral);
  }
  if (row === 'b') {
    c.hline(0, 13, 16, PAL.wine);
    c.hline(0, 14, 16, PAL.cocoa);
    c.hline(0, 15, 16, PAL.ink);
  }
  if (col === 'l') {
    c.vline(0, 0, 16, PAL.ink);
    c.vline(1, 1, 15, PAL.coral);
  }
  if (col === 'r') {
    c.vline(15, 0, 16, PAL.ink);
    c.vline(14, 1, 15, PAL.wine);
  }
}

interface WallParts {
  left?: boolean;
  right?: boolean;
  base?: boolean;
  window?: boolean;
  plaque?: boolean;
}

function wall(c: PixelCanvas, parts: WallParts, seed: number): void {
  c.rect(0, 0, 16, 16, PAL.paper);
  speckle(c, makeRng(seed), 5, PAL.sand);
  if (parts.window) {
    c.rect(2, 2, 12, 11, PAL.bark);
    c.rect(3, 3, 10, 9, PAL.sky);
    c.vline(7, 3, 9, PAL.bark);
    c.vline(8, 3, 9, PAL.bark);
    c.hline(3, 7, 10, PAL.bark);
    c.set(4, 4, PAL.cream);
    c.set(5, 4, PAL.cream);
    c.set(4, 5, PAL.cream);
    c.rect(1, 13, 14, 2, PAL.wood);
    c.hline(1, 15, 14, PAL.sand);
  }
  if (parts.plaque) {
    c.rect(3, 3, 10, 9, PAL.ink);
    c.rect(4, 4, 8, 7, PAL.pine);
    c.pattern(5, 5, ['ww.ww', 'wwkww', 'wwkww', 'kkkkk'], { w: PAL.cream, k: PAL.gold });
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

function tree(c: PixelCanvas, seed: number): void {
  const rand = makeRng(seed);
  c.ellipse(15.5, 44, 9, 2.5, withAlpha(PAL.ink, 0.25));
  c.rect(13, 28, 6, 16, PAL.bark);
  c.vline(13, 28, 16, PAL.cocoa);
  c.vline(16, 30, 13, PAL.wood);
  c.set(12, 43, PAL.bark);
  c.set(19, 43, PAL.bark);
  c.ellipse(15.5, 16, 13.5, 13.5, PAL.pine);
  c.ellipse(14.5, 14, 11.5, 11, PAL.leafDark);
  c.ellipse(12.5, 11, 7.5, 6.5, PAL.leaf);
  c.ellipse(11, 9, 3.5, 2.5, PAL.leafLight);
  for (let i = 0; i < 46; i++) {
    const x = 3 + Math.floor(rand() * 26);
    const y = 3 + Math.floor(rand() * 26);
    const here = c.get(x, y);
    if (here === PAL.leafDark) c.set(x, y, PAL.pine);
    else if (here === PAL.leaf) c.set(x, y, PAL.leafDark);
    else if (here === PAL.pine) c.set(x, y, PAL.moss);
  }
  c.outline(PAL.ink);
}

function door(c: PixelCanvas): void {
  c.rect(2, 3, 28, 29, PAL.bark);
  c.roundRect(2, 1, 28, 4, [3, 1], [], PAL.bark);
  c.rect(4, 5, 11, 24, PAL.wood);
  c.rect(17, 5, 11, 24, PAL.wood);
  for (const x of [6, 19]) {
    c.rect(x, 7, 7, 8, PAL.tan);
    c.rect(x, 18, 7, 9, PAL.tan);
    c.hline(x, 7, 7, PAL.sand);
    c.hline(x, 18, 7, PAL.sand);
  }
  c.rect(13, 16, 2, 2, PAL.gold);
  c.rect(17, 16, 2, 2, PAL.gold);
  c.rect(0, 29, 32, 3, PAL.stone);
  c.hline(0, 29, 32, PAL.fog);
  c.hline(0, 31, 32, PAL.slate);
  c.vline(1, 2, 27, PAL.ink);
  c.vline(30, 2, 27, PAL.ink);
}

function awning(c: PixelCanvas, col: number): void {
  for (let x = 0; x < 16; x++) {
    const stripe = Math.floor((x + col * 16) / 4) % 2 === 0 ? PAL.coral : PAL.cream;
    const drop = x % 4 === 0 || x % 4 === 3 ? 10 : 11;
    c.vline(x, 4, drop - 4, stripe);
    c.set(x, drop, mix(stripe, PAL.ink, 0.3));
  }
  c.hline(0, 3, 16, PAL.ink);
  if (col === 0) c.vline(0, 3, 8, PAL.ink);
  if (col === 2) c.vline(15, 3, 8, PAL.ink);
}

function fountain(c: PixelCanvas): void {
  c.ellipse(15.5, 21, 14, 9, PAL.slate);
  c.ellipse(15.5, 20, 14, 8.5, PAL.stone);
  c.ellipse(15.5, 19.5, 11.5, 6, PAL.water);
  c.ellipse(14, 18.5, 6, 2.5, PAL.sky);
  c.rect(14, 8, 4, 12, PAL.fog);
  c.vline(17, 8, 12, PAL.stone);
  c.ellipse(15.5, 8, 5.5, 2, PAL.stone);
  c.hline(12, 7, 8, PAL.sky);
  c.pattern(11, 3, ['...ss...', '..s..s..', '.s....s.', 's......s'], { s: PAL.sky });
  c.set(10, 12, PAL.cream);
  c.set(21, 13, PAL.cream);
  c.outline(PAL.ink);
}

function bench(c: PixelCanvas, fromBehind: boolean): void {
  if (fromBehind) {
    c.rect(1, 3, 30, 9, PAL.wood);
    for (const y of [5, 8]) c.hline(1, y, 30, PAL.bark);
    c.hline(1, 3, 30, PAL.tan);
  } else {
    c.rect(1, 2, 30, 5, PAL.wood);
    c.hline(1, 2, 30, PAL.tan);
    c.hline(1, 4, 30, PAL.bark);
    c.rect(1, 7, 30, 5, PAL.tan);
    c.hline(1, 7, 30, PAL.sand);
    c.hline(1, 11, 30, PAL.wood);
  }
  c.rect(2, 12, 2, 3, PAL.bark);
  c.rect(28, 12, 2, 3, PAL.bark);
  c.outline(PAL.ink);
}

function lampPost(c: PixelCanvas): void {
  c.rect(7, 10, 2, 19, PAL.ash);
  c.vline(7, 10, 19, PAL.slate);
  c.rect(5, 28, 6, 3, PAL.ash);
  c.rect(4, 3, 8, 7, PAL.glow);
  c.rect(6, 5, 4, 4, PAL.cream);
  c.frame(4, 3, 8, 7, PAL.ash);
  c.roundRect(3, 1, 10, 2, [2], [], PAL.ash);
  c.outline(PAL.ink);
}

/** Outdoor tiles for the hub town. */
export function buildTownTileset(): Tileset {
  const set = new Tileset('town');

  set.add('grass_0', (c) => grass(c, 11));
  set.add('grass_1', (c) => grass(c, 23));
  set.add('grass_2', (c) => {
    grass(c, 37);
    tuft(c, 3, 4);
    tuft(c, 10, 10);
  });
  set.add('grass_3', (c) => {
    grass(c, 41);
    tuft(c, 9, 3);
  });

  const grassBase = (c: PixelCanvas): void => grass(c, 11);
  addAutotile(set, 'path', {
    fill: (c) => {
      c.rect(0, 0, 16, 16, PAL.sand);
      const rand = makeRng(5);
      speckle(c, rand, 8, PAL.paper);
      speckle(c, rand, 6, PAL.tan);
    },
    outside: grassBase,
    rim: mix(PAL.sand, PAL.wood, 0.45),
    inset: 2,
    wobble: true,
  });
  addAutotile(
    set,
    'water',
    {
      fill: (c) => {
        c.rect(0, 0, 16, 16, PAL.water);
        c.hline(2, 4, 4, PAL.sky);
        c.hline(9, 9, 5, PAL.sky);
        c.hline(4, 13, 3, PAL.sky);
        c.hline(11, 2, 2, PAL.deep);
      },
      outside: grassBase,
      rim: PAL.deep,
      inset: 2,
      wobble: true,
    },
    { solid: true },
  );

  for (const [name, seed] of [['plaza_0', 3], ['plaza_1', 8]] as const) {
    set.add(name, (c) => {
      const mortar = mix(PAL.stone, PAL.bark, 0.3);
      c.rect(0, 0, 16, 16, PAL.stone);
      speckle(c, makeRng(seed), 7, PAL.fog);
      c.hline(0, 7, 16, mortar);
      c.hline(0, 15, 16, mortar);
      for (const x of [7, 15]) c.vline(x, 0, 7, mortar);
      for (const x of [3, 11]) c.vline(x, 8, 7, mortar);
    });
  }

  set.add('flowers_0', (c) => {
    flower(c, 2, 3, PAL.cream);
    flower(c, 9, 8, PAL.pink);
  });
  set.add('flowers_1', (c) => {
    flower(c, 8, 2, PAL.gold);
    flower(c, 3, 9, PAL.coral);
    flower(c, 11, 10, PAL.cream);
  });

  set.addBlock('tree', 2, 3, (c) => tree(c, 77), (_x, row) => ({ solid: row === 2, sortOffset: 2 - row }));

  set.add(
    'bush',
    (c) => {
      c.ellipse(7.5, 9, 6.5, 5, PAL.leafDark);
      c.ellipse(6.5, 8, 4.5, 3.5, PAL.leaf);
      c.set(5, 7, PAL.leafLight);
      c.set(6, 6, PAL.leafLight);
      c.set(10, 9, PAL.coral);
      c.set(4, 10, PAL.coral);
      c.outline(PAL.ink);
    },
    { solid: true },
  );
  set.add(
    'rock',
    (c) => {
      c.ellipse(7.5, 10, 5.5, 4, PAL.slate);
      c.ellipse(6.5, 9, 4, 2.5, PAL.stone);
      c.set(5, 8, PAL.fog);
      c.outline(PAL.ink);
    },
    { solid: true },
  );
  set.add(
    'sign',
    (c) => {
      c.rect(7, 10, 2, 5, PAL.bark);
      c.rect(2, 2, 12, 8, PAL.tan);
      c.hline(2, 2, 12, PAL.sand);
      c.hline(4, 5, 8, PAL.cocoa);
      c.hline(4, 7, 5, PAL.cocoa);
      c.outline(PAL.ink);
    },
    { solid: true },
  );

  set.addBlock('lamppost', 1, 2, lampPost, (_x, row) => ({ solid: row === 1, sortOffset: 1 - row }));
  set.addBlock('bench_down', 2, 1, (c) => bench(c, false), () => ({ solid: true }));
  set.addBlock('bench_up', 2, 1, (c) => bench(c, true), () => ({ solid: true }));
  set.addBlock('fountain', 2, 2, fountain, (_x, row) => ({ solid: true, sortOffset: 1 - row }));

  for (const row of ['t', 'm', 'b'] as const) {
    for (const col of ['l', 'm', 'r'] as const) {
      set.add(`roof_${row}${col}`, (c) => roof(c, col, row), { solid: true });
    }
  }
  const walls: [string, WallParts][] = [
    ['wall', {}],
    ['wall_l', { left: true }],
    ['wall_r', { right: true }],
    ['wall_window', { window: true }],
    ['wall_plaque', { plaque: true }],
    ['wall_base', { base: true }],
    ['wall_base_l', { base: true, left: true }],
    ['wall_base_r', { base: true, right: true }],
  ];
  walls.forEach(([name, parts], i) => set.add(name, (c) => wall(c, parts, 50 + i), { solid: true }));
  set.addBlock('door', 2, 2, door, (_x, row) => ({ solid: row === 0 }));
  for (let col = 0; col < 3; col++) set.add(`awning_${col}`, (c) => awning(c, col));

  return set;
}
