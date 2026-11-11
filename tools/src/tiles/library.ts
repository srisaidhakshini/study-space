import { mix, PAL } from '../palette';
import { makeRng, PixelCanvas } from '../png';
import { addAutotile, Tileset } from './tileset';

const BOOK_COLOURS = [PAL.brick, PAL.deep, PAL.leafDark, PAL.gold, PAL.plum, PAL.coral, PAL.pine, PAL.cream, PAL.water];

function floor(c: PixelCanvas, shift: number): void {
  const seam = mix(PAL.tan, PAL.wood, 0.55);
  c.rect(0, 0, 16, 16, PAL.tan);
  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    c.hline(0, y + 3, 16, seam);
    c.vline((row * 5 + shift) % 16, y, 3, seam);
    c.hline((row * 7 + shift + 3) % 12, y + 1, 3, mix(PAL.tan, PAL.sand, 0.6));
  }
}

function wallFace(c: PixelCanvas, lower: boolean): void {
  c.rect(0, 0, 16, 16, PAL.fog);
  for (let x = 1; x < 16; x += 4) c.vline(x, 0, 16, mix(PAL.fog, PAL.peach, 0.35));
  if (!lower) {
    c.hline(0, 0, 16, PAL.ink);
    c.hline(0, 1, 16, PAL.wood);
    c.hline(0, 2, 16, PAL.bark);
    return;
  }
  c.rect(0, 5, 16, 9, PAL.wood);
  c.hline(0, 5, 16, PAL.tan);
  c.hline(0, 6, 16, PAL.bark);
  for (const x of [0, 8]) {
    c.frame(x + 1, 8, 6, 5, PAL.bark);
    c.hline(x + 2, 9, 4, PAL.tan);
  }
  c.rect(0, 14, 16, 2, PAL.cocoa);
}

function bookshelf(c: PixelCanvas, seed: number): void {
  const rand = makeRng(seed);
  c.rect(1, 3, 14, 28, PAL.bark);
  c.rect(1, 2, 14, 2, PAL.wood);
  c.hline(1, 2, 14, PAL.tan);
  for (let shelf = 0; shelf < 3; shelf++) {
    const top = 5 + shelf * 8;
    c.rect(2, top, 12, 7, PAL.cocoa);
    let x = 2;
    while (x < 14) {
      const w = rand() < 0.3 && x < 13 ? 2 : 1;
      const h = 4 + Math.floor(rand() * 3);
      if (rand() < 0.12) {
        x += 1;
        continue;
      }
      const colour = BOOK_COLOURS[Math.floor(rand() * BOOK_COLOURS.length)]!;
      c.rect(x, top + 7 - h, w, h, colour);
      c.set(x, top + 8 - h, mix(colour, PAL.cream, 0.5));
      x += w;
    }
  }
  c.rect(1, 29, 14, 2, PAL.cocoa);
  c.outline(PAL.ink);
}

type DeskEnd = 'l' | 'm' | 'r';

function deskBack(c: PixelCanvas, end: DeskEnd, item: 'none' | 'book' | 'paper'): void {
  const x = end === 'l' ? 1 : 0;
  const w = end === 'm' ? 16 : 15;
  c.rect(x, 4, w, 12, PAL.tan);
  c.hline(x, 4, w, PAL.sand);
  c.hline(x, 5, w, PAL.sand);
  if (item === 'book') {
    c.pattern(4, 8, ['kkkkkkkk', 'kwwwkwwwk', 'kwswkwswk', 'kwwwkwwwk', 'kkkkkkkkk'], {
      k: PAL.cocoa,
      w: PAL.cream,
      s: PAL.slate,
    });
  }
  if (item === 'paper') {
    c.rect(4, 8, 6, 7, PAL.cream);
    c.hline(5, 10, 4, PAL.slate);
    c.hline(5, 12, 3, PAL.slate);
    c.rect(11, 9, 1, 5, PAL.coral);
  }
  c.outline(PAL.ink);
}

function deskFront(c: PixelCanvas, end: DeskEnd, item: 'none' | 'book'): void {
  const x = end === 'l' ? 1 : 0;
  const w = end === 'm' ? 16 : 15;
  c.rect(x, 0, w, 9, PAL.tan);
  if (item === 'book') {
    c.rect(5, 2, 7, 5, PAL.deep);
    c.rect(6, 3, 5, 3, PAL.cream);
  }
  c.rect(x, 9, w, 4, PAL.wood);
  c.hline(x, 9, w, PAL.bark);
  if (end === 'l') c.rect(1, 13, 2, 2, PAL.bark);
  if (end === 'r') c.rect(13, 13, 2, 2, PAL.bark);
  c.outline(PAL.ink);
}

function chair(c: PixelCanvas, fromBehind: boolean): void {
  if (fromBehind) {
    c.rect(3, 4, 10, 4, PAL.coral);
    c.rect(3, 6, 10, 7, PAL.wood);
    c.hline(3, 6, 10, PAL.tan);
    for (const x of [5, 8, 10]) c.vline(x, 8, 4, PAL.bark);
  } else {
    c.rect(3, 1, 10, 7, PAL.wood);
    c.hline(3, 1, 10, PAL.tan);
    for (const x of [5, 8, 10]) c.vline(x, 3, 4, PAL.bark);
    c.rect(3, 8, 10, 5, PAL.coral);
    c.hline(3, 8, 10, PAL.peach);
    c.hline(3, 12, 10, PAL.brick);
  }
  c.rect(3, 13, 2, 2, PAL.bark);
  c.rect(11, 13, 2, 2, PAL.bark);
  c.outline(PAL.ink);
}

function plant(c: PixelCanvas): void {
  c.rect(4, 23, 8, 7, PAL.coral);
  c.rect(3, 22, 10, 2, PAL.peach);
  c.hline(4, 29, 8, PAL.brick);
  c.ellipse(7.5, 15, 5.5, 7, PAL.pine);
  c.ellipse(5, 11, 3, 5, PAL.leafDark);
  c.ellipse(10.5, 12, 3, 5.5, PAL.leafDark);
  c.ellipse(7.5, 9, 2.5, 5, PAL.leaf);
  c.set(7, 6, PAL.leafLight);
  c.set(5, 9, PAL.leafLight);
  c.set(11, 10, PAL.leafLight);
  c.outline(PAL.ink);
}

/** Indoor tiles for the library. */
export function buildLibraryTileset(): Tileset {
  const set = new Tileset('library');

  set.add('floor_0', (c) => floor(c, 0));
  set.add('floor_1', (c) => floor(c, 6));

  addAutotile(set, 'carpet', {
    fill: (c) => {
      c.rect(0, 0, 16, 16, PAL.brick);
      for (let y = 3; y < 16; y += 8) for (let x = 3; x < 16; x += 8) c.set(x, y, PAL.coral);
      for (let y = 7; y < 16; y += 8) for (let x = 7; x < 16; x += 8) c.set(x, y, PAL.wine);
    },
    rim: PAL.gold,
    inset: 1,
    wobble: false,
  });

  set.add(
    'wall_top',
    (c) => {
      c.rect(0, 0, 16, 16, PAL.cocoa);
      c.hline(0, 0, 16, PAL.bark);
      c.set(4, 6, PAL.bark);
      c.set(11, 11, PAL.bark);
    },
    { solid: true },
  );
  set.add('wall_upper', (c) => wallFace(c, false), { solid: true });
  set.add('wall_lower', (c) => wallFace(c, true), { solid: true });
  set.add(
    'wall_window',
    (c) => {
      wallFace(c, false);
      c.rect(2, 4, 12, 12, PAL.bark);
      c.rect(3, 5, 10, 11, PAL.sky);
      c.rect(3, 5, 10, 3, PAL.cream);
      c.vline(7, 5, 11, PAL.bark);
      c.vline(8, 5, 11, PAL.bark);
      c.hline(3, 10, 10, PAL.bark);
    },
    { solid: true },
  );
  set.add(
    'wall_window_sill',
    (c) => {
      wallFace(c, true);
      c.rect(2, 0, 12, 3, PAL.bark);
      c.rect(3, 0, 10, 2, PAL.sky);
      c.vline(7, 0, 2, PAL.bark);
      c.vline(8, 0, 2, PAL.bark);
      c.rect(1, 3, 14, 2, PAL.tan);
    },
    { solid: true },
  );
  set.add(
    'wall_clock',
    (c) => {
      wallFace(c, false);
      c.ellipse(7.5, 9, 4.5, 4.5, PAL.ink);
      c.ellipse(7.5, 9, 3.5, 3.5, PAL.cream);
      c.vline(7, 7, 3, PAL.ink);
      c.hline(8, 9, 2, PAL.brick);
    },
    { solid: true },
  );
  set.add(
    'wall_quiet',
    (c) => {
      wallFace(c, false);
      c.rect(3, 5, 10, 9, PAL.ink);
      c.rect(4, 6, 8, 7, PAL.cream);
      c.pattern(5, 7, ['.rrrr.', 'r....r', '.rrrr.', '..rr..', '..rr..'], { r: PAL.brick });
    },
    { solid: true },
  );

  [101, 202, 303].forEach((seed, i) => {
    set.addBlock(`shelf_${i}`, 1, 2, (c) => bookshelf(c, seed), (_x, row) => ({ solid: row === 1, sortOffset: 1 - row }));
  });

  for (const end of ['l', 'm', 'r'] as const) {
    set.add(`desk_back_${end}`, (c) => deskBack(c, end, 'none'), { solid: true });
    set.add(`desk_front_${end}`, (c) => deskFront(c, end, 'none'), { solid: true });
  }
  set.add('desk_back_m_book', (c) => deskBack(c, 'm', 'book'), { solid: true });
  set.add('desk_back_m_paper', (c) => deskBack(c, 'm', 'paper'), { solid: true });
  set.add('desk_front_m_book', (c) => deskFront(c, 'm', 'book'), { solid: true });

  set.add('chair_down', (c) => chair(c, false), { solid: true });
  set.add('chair_up', (c) => chair(c, true), { solid: true });
  set.addBlock('plant', 1, 2, plant, (_x, row) => ({ solid: row === 1, sortOffset: 1 - row }));

  set.add('mat', (c) => {
    c.rect(1, 3, 14, 10, PAL.leafDark);
    c.frame(1, 3, 14, 10, PAL.pine);
    c.hline(4, 6, 8, PAL.leafLight);
    c.hline(4, 9, 8, PAL.leafLight);
  });
  set.add('doorway', (c) => {
    c.rect(0, 0, 16, 16, PAL.bark);
    c.rect(0, 0, 16, 3, PAL.tan);
    c.rect(0, 9, 16, 7, PAL.paper);
    c.hline(0, 8, 16, PAL.sand);
    c.hline(0, 3, 16, PAL.cocoa);
  });

  return set;
}
