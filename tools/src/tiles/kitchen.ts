import { mix, PAL } from '../palette';
import { makeRng, PixelCanvas } from '../png';
import {
  addArmchairSides,
  addArmchairUp,
  addChairs,
  addPlant,
  addRug,
  addShell,
  addSofaUp,
  checkerFloor,
  cup,
  plankFloor,
  SAGE_WALL,
  wallBackdrop,
  wallUpper,
} from './indoorKit';
import { Tileset } from './tileset';

const STEEL = mix(PAL.fog, PAL.sky, 0.45);
const STEEL_DARK = mix(STEEL, PAL.ink, 0.4);
const STONE = mix(PAL.fog, PAL.stone, 0.35);
const CABINET = mix(PAL.paper, PAL.leaf, 0.3);
const CABINET_DARK = mix(CABINET, PAL.ink, 0.3);

// ----------------------------------------------------------------- walls

function wallCabinet(c: PixelCanvas): void {
  wallUpper(c, SAGE_WALL);
  c.rect(0, 3, 16, 11, PAL.wood);
  c.hline(0, 3, 16, PAL.tan);
  c.vline(7, 4, 9, PAL.bark);
  c.vline(8, 4, 9, PAL.bark);
  c.rect(5, 8, 1, 2, PAL.gold);
  c.rect(10, 8, 1, 2, PAL.gold);
  c.hline(0, 13, 16, PAL.bark);
  c.hline(0, 14, 16, PAL.ink);
}

function splashBackground(c: PixelCanvas): void {
  const tile = mix(PAL.sky, PAL.cream, 0.55);
  c.rect(0, 0, 16, 16, tile);
  for (let i = 3; i < 16; i += 4) {
    c.vline(i, 0, 16, mix(tile, PAL.sky, 0.45));
    c.hline(0, i, 16, mix(tile, PAL.sky, 0.45));
  }
  c.hline(0, 0, 16, mix(tile, PAL.ink, 0.3));
  c.hline(0, 1, 16, mix(tile, PAL.ink, 0.12));
}

function wallHood(c: PixelCanvas): void {
  splashBackground(c);
  c.rect(6, 0, 4, 4, STEEL);
  c.roundRect(1, 4, 14, 8, [], [], STEEL);
  c.hline(1, 4, 14, mix(STEEL, PAL.cream, 0.6));
  c.hline(1, 11, 14, STEEL_DARK);
  c.hline(3, 9, 3, PAL.ink);
  c.hline(10, 9, 3, PAL.ink);
  c.frame(1, 4, 14, 8, PAL.ink);
  c.vline(6, 0, 4, PAL.ink);
  c.vline(9, 0, 4, PAL.ink);
}

function wallFrame(c: PixelCanvas): void {
  wallUpper(c, SAGE_WALL);
  c.rect(2, 4, 12, 10, PAL.wood);
  c.rect(3, 5, 10, 8, PAL.sky);
  c.rect(3, 9, 10, 4, PAL.leaf);
  c.hline(3, 9, 10, PAL.leafDark);
  c.ellipse(10, 7, 1.5, 1.5, PAL.gold);
  c.set(5, 8, PAL.cream);
  c.set(6, 8, PAL.cream);
  c.frame(2, 4, 12, 10, PAL.ink);
}

function wallClock(c: PixelCanvas): void {
  wallUpper(c, SAGE_WALL);
  c.ellipse(7.5, 9, 5, 5, PAL.ink);
  c.ellipse(7.5, 9, 4, 4, PAL.cream);
  c.vline(7, 6, 4, PAL.ink);
  c.hline(8, 9, 3, PAL.brick);
}

function noticeBoard(c: PixelCanvas): void {
  wallBackdrop(c, SAGE_WALL, 2, 2);
  c.rect(2, 4, 28, 24, PAL.wood);
  c.rect(4, 6, 24, 20, mix(PAL.tan, PAL.wood, 0.25));
  c.frame(2, 4, 28, 24, PAL.ink);
  const notes: [number, number, number, number, string][] = [
    [6, 8, 7, 7, PAL.cream],
    [15, 8, 5, 5, PAL.glow],
    [21, 9, 5, 8, PAL.blush],
    [7, 17, 6, 6, PAL.sky],
    [15, 15, 9, 8, PAL.cream],
  ];
  for (const [x, y, w, h, color] of notes) {
    c.rect(x, y, w, h, color);
    c.hline(x + 1, y + 2, w - 2, mix(color, PAL.ink, 0.35));
    c.hline(x + 1, y + 4, Math.max(1, w - 3), mix(color, PAL.ink, 0.35));
    c.set(x + Math.floor(w / 2), y, PAL.brick);
  }
}

// -------------------------------------------------------------- counters

type CounterItem = 'plain' | 'sink' | 'stove' | 'kettle' | 'toaster' | 'micro' | 'plates';

function kitchenCounter(c: PixelCanvas, item: CounterItem): void {
  c.rect(0, 0, 16, 8, STONE);
  c.hline(0, 7, 16, mix(STONE, PAL.wood, 0.45));
  c.hline(0, 0, 16, mix(STONE, PAL.ink, 0.15));
  const front = item === 'stove' ? STEEL : CABINET;
  c.rect(0, 8, 16, 8, front);
  c.hline(0, 8, 16, mix(front, PAL.cream, 0.4));
  if (item === 'stove') {
    c.rect(2, 10, 12, 4, PAL.ink);
    c.rect(3, 11, 10, 2, mix(PAL.ink, PAL.sky, 0.25));
    c.set(4, 11, PAL.cream);
    for (const x of [3, 6, 9, 12]) c.set(x, 9, PAL.ash);
  } else {
    c.vline(7, 9, 5, CABINET_DARK);
    c.vline(8, 9, 5, CABINET_DARK);
    c.rect(5, 10, 1, 2, PAL.gold);
    c.rect(10, 10, 1, 2, PAL.gold);
  }
  c.rect(0, 14, 16, 2, PAL.cocoa);

  switch (item) {
    case 'sink':
      c.rect(3, 2, 10, 5, STEEL_DARK);
      c.rect(4, 3, 8, 3, PAL.sky);
      c.hline(4, 3, 8, PAL.cream);
      c.vline(8, 0, 3, STEEL);
      c.hline(8, 0, 3, STEEL);
      c.frame(3, 2, 10, 5, PAL.ink);
      break;
    case 'stove':
      c.ellipse(4.5, 4, 3, 2, PAL.ink);
      c.ellipse(4.5, 4, 1.5, 1, PAL.ash);
      c.rect(9, 1, 5, 5, PAL.ash);
      c.hline(9, 1, 5, PAL.slate);
      c.frame(9, 1, 5, 5, PAL.ink);
      c.set(12, 0, PAL.cream);
      break;
    case 'kettle':
      c.rect(5, 2, 7, 5, PAL.brick);
      c.hline(5, 2, 7, PAL.coral);
      c.set(4, 3, PAL.brick);
      c.set(3, 2, PAL.brick);
      c.vline(12, 2, 4, PAL.ink);
      c.rect(7, 1, 3, 1, PAL.ink);
      c.frame(5, 2, 7, 5, PAL.ink);
      break;
    case 'toaster':
      c.rect(4, 3, 9, 4, STEEL);
      c.hline(4, 3, 9, mix(STEEL, PAL.cream, 0.6));
      c.rect(6, 2, 2, 1, PAL.sand);
      c.rect(9, 2, 2, 1, PAL.sand);
      c.frame(4, 3, 9, 4, PAL.ink);
      c.set(12, 5, PAL.brick);
      break;
    case 'micro':
      c.rect(2, 1, 12, 6, PAL.ash);
      c.rect(3, 2, 7, 4, PAL.ink);
      c.rect(4, 3, 5, 2, mix(PAL.ink, PAL.glow, 0.3));
      c.set(12, 3, PAL.leaf);
      c.set(12, 5, PAL.brick);
      c.frame(2, 1, 12, 6, PAL.ink);
      break;
    case 'plates':
      c.rect(2, 3, 6, 1, PAL.cream);
      c.rect(2, 4, 6, 1, PAL.fog);
      c.rect(3, 2, 4, 1, PAL.cream);
      cup(c, 10, 3, PAL.water);
      c.set(12, 2, PAL.cream);
      break;
    default:
      break;
  }
}

function fridge(c: PixelCanvas): void {
  const body = mix(PAL.fog, PAL.sky, 0.35);
  c.rect(1, 2, 14, 29, body);
  c.vline(2, 3, 27, PAL.cream);
  c.hline(1, 12, 14, PAL.ink);
  c.rect(11, 5, 2, 5, PAL.ash);
  c.rect(11, 15, 2, 9, PAL.ash);
  c.hline(1, 2, 14, mix(body, PAL.cream, 0.6));
  c.rect(4, 16, 3, 3, PAL.coral);
  c.rect(4, 21, 3, 2, PAL.gold);
  c.rect(3, 5, 4, 5, PAL.cream);
  c.hline(4, 7, 2, PAL.slate);
  c.hline(1, 30, 14, mix(body, PAL.ink, 0.35));
  c.rect(2, 31, 2, 1, PAL.ash);
  c.rect(12, 31, 2, 1, PAL.ash);
  c.outline(PAL.ink);
}

// ------------------------------------------------------------- dining

function diningTable(c: PixelCanvas, seg: 'l' | 'm' | 'r', vase: boolean): void {
  const x = seg === 'l' ? 1 : 0;
  const w = seg === 'm' ? 16 : 15;
  c.rect(x, 3, w, 8, PAL.tan);
  c.hline(x, 3, w, PAL.sand);
  c.hline(x, 10, w, PAL.wood);
  c.rect(x, 11, w, 2, PAL.wood);
  c.hline(x, 11, w, PAL.bark);
  if (seg !== 'm') c.rect(seg === 'l' ? 2 : 12, 13, 2, 3, PAL.bark);
  if (seg === 'l') cup(c, 6, 5, PAL.coral);
  if (seg === 'r') cup(c, 8, 5, PAL.water);
  if (vase) {
    c.rect(7, 5, 2, 4, mix(PAL.sky, PAL.cream, 0.4));
    c.set(7, 3, PAL.pink);
    c.set(8, 3, PAL.gold);
    c.set(7, 4, PAL.leafDark);
    c.set(8, 4, PAL.pink);
  } else {
    c.rect(4, 5, 8, 3, PAL.cream);
    c.hline(4, 7, 8, PAL.fog);
  }
  c.outline(PAL.ink);
}

// ---------------------------------------------------------- living area

function tv(c: PixelCanvas): void {
  c.rect(2, 2, 28, 13, PAL.ink);
  c.rect(4, 4, 24, 9, PAL.deep);
  c.rect(4, 8, 24, 5, PAL.navy);
  c.hline(6, 6, 6, mix(PAL.deep, PAL.sky, 0.5));
  c.hline(7, 7, 3, mix(PAL.deep, PAL.sky, 0.3));
  c.hline(18, 10, 7, mix(PAL.navy, PAL.sky, 0.25));
  c.set(26, 14, PAL.leaf);
  c.rect(13, 15, 6, 1, PAL.ash);
  c.rect(1, 18, 30, 12, PAL.wood);
  c.hline(1, 18, 30, PAL.tan);
  c.hline(2, 20, 28, PAL.bark);
  c.rect(3, 21, 12, 7, PAL.cocoa);
  c.rect(17, 21, 12, 7, PAL.cocoa);
  c.rect(5, 23, 8, 3, PAL.ash);
  c.set(6, 24, PAL.leaf);
  c.set(11, 24, PAL.brick);
  c.rect(19, 23, 8, 3, PAL.ash);
  c.rect(2, 30, 3, 2, PAL.bark);
  c.rect(27, 30, 3, 2, PAL.bark);
  c.outline(PAL.ink);
}

function coffeeTable(c: PixelCanvas, seg: 'l' | 'r'): void {
  const x = seg === 'l' ? 2 : 0;
  const w = 14;
  c.rect(x, 4, w, 8, PAL.tan);
  c.hline(x, 4, w, PAL.sand);
  c.hline(x, 11, w, PAL.wood);
  c.rect(x + 1, 12, 2, 3, PAL.bark);
  c.rect(x + w - 3, 12, 2, 3, PAL.bark);
  if (seg === 'l') {
    c.rect(6, 6, 6, 3, PAL.coral);
    c.rect(7, 6, 4, 2, PAL.cream);
  } else {
    cup(c, 7, 6, PAL.leaf);
  }
  c.outline(PAL.ink);
}

function bookcase(c: PixelCanvas): void {
  const books = [PAL.brick, PAL.deep, PAL.leafDark, PAL.gold, PAL.plum, PAL.coral, PAL.pine, PAL.cream];
  c.rect(1, 3, 14, 28, PAL.bark);
  c.rect(1, 2, 14, 2, PAL.wood);
  c.hline(1, 2, 14, PAL.tan);
  const rand = makeRng(41);
  for (let shelf = 0; shelf < 3; shelf++) {
    const top = 5 + shelf * 8;
    c.rect(2, top, 12, 7, PAL.cocoa);
    let x = 2;
    while (x < 14) {
      if (rand() < 0.1) {
        x += 1;
        continue;
      }
      const w = rand() < 0.3 && x < 13 ? 2 : 1;
      const h = 4 + Math.floor(rand() * 3);
      const color = books[Math.floor(rand() * books.length)]!;
      c.rect(x, top + 7 - h, w, h, color);
      c.set(x, top + 8 - h, mix(color, PAL.cream, 0.5));
      x += w;
    }
  }
  c.rect(1, 29, 14, 2, PAL.cocoa);
  c.outline(PAL.ink);
}

function snackMachine(c: PixelCanvas): void {
  c.rect(1, 2, 14, 29, PAL.brick);
  c.rect(1, 2, 14, 3, PAL.coral);
  c.rect(3, 6, 10, 15, mix(PAL.sky, PAL.ink, 0.3));
  const colors = [PAL.gold, PAL.leaf, PAL.pink, PAL.amber];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      c.rect(4 + col * 2 + (col > 1 ? 0 : 0), 7 + row * 5, 2, 3, colors[(row + col) % colors.length]!);
    }
    c.hline(3, 10 + row * 5, 10, PAL.slate);
  }
  c.hline(3, 6, 10, mix(PAL.sky, PAL.cream, 0.4));
  c.rect(3, 22, 4, 4, PAL.ash);
  c.set(4, 23, PAL.leaf);
  c.set(5, 23, PAL.gold);
  c.set(4, 25, PAL.brick);
  c.rect(8, 23, 5, 3, PAL.ink);
  c.rect(3, 27, 10, 3, PAL.ink);
  c.hline(1, 30, 14, mix(PAL.brick, PAL.ink, 0.4));
  c.outline(PAL.ink);
}

/** Tileset for the common room: sage walls, tiled kitchenette and a lounge. */
export function buildKitchenTileset(): Tileset {
  const set = new Tileset('kitchen');

  set.add('floor_tile_a', (c) => checkerFloor(c, mix(PAL.cream, PAL.fog, 0.5), 21));
  set.add('floor_tile_b', (c) => checkerFloor(c, mix(PAL.fog, PAL.sky, 0.3), 33));
  set.add('floor_wood_0', (c) => plankFloor(c, 0));
  set.add('floor_wood_1', (c) => plankFloor(c, 6));
  addShell(set, SAGE_WALL);

  set.add('wall_cabinet', wallCabinet, { solid: true });
  set.add('wall_splash', splashBackground, { solid: true });
  set.add('wall_hood', wallHood, { solid: true });
  set.add('wall_frame', wallFrame, { solid: true });
  set.add('wall_clock', wallClock, { solid: true });
  set.addBlock('notice', 2, 2, noticeBoard, () => ({ solid: true }));

  for (const item of ['plain', 'sink', 'stove', 'kettle', 'toaster', 'micro', 'plates'] as const) {
    set.add(`counter_${item}`, (c) => kitchenCounter(c, item), { solid: true });
  }
  set.addBlock('fridge', 1, 2, fridge, (_x, row) => ({ solid: row === 1, sortOffset: 1 - row }));

  set.add('dtable_l', (c) => diningTable(c, 'l', false), { solid: true });
  set.add('dtable_m', (c) => diningTable(c, 'm', true), { solid: true });
  set.add('dtable_r', (c) => diningTable(c, 'r', false), { solid: true });
  addChairs(set, 'chair', PAL.amber);

  addSofaUp(set, 'sofa', mix(PAL.brick, PAL.coral, 0.45));
  addArmchairUp(set, 'armchair_up', PAL.leafDark);
  addArmchairSides(set, 'armchair', PAL.plum);
  set.addBlock('tv', 2, 2, tv, (_x, row) => ({ solid: row === 1, sortOffset: 1 - row }));
  set.add('coffee_table_l', (c) => coffeeTable(c, 'l'), { solid: true });
  set.add('coffee_table_r', (c) => coffeeTable(c, 'r'), { solid: true });
  set.addBlock('bookcase', 1, 2, bookcase, (_x, row) => ({ solid: row === 1, sortOffset: 1 - row }));
  set.addBlock('snacks', 1, 2, snackMachine, (_x, row) => ({ solid: row === 1, sortOffset: 1 - row }));
  addPlant(set);
  addRug(set, 'rug', mix(PAL.wine, PAL.coral, 0.4), PAL.peach);

  return set;
}
