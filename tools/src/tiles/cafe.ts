import { mix, PAL } from '../palette';
import { PixelCanvas } from '../png';
import {
  addArmchairSides,
  addChairs,
  addPlant,
  addRug,
  addShell,
  addSofaDown,
  checkerFloor,
  cup,
  plankFloor,
  wallBackdrop,
  WARM_WALL,
} from './indoorKit';
import { Tileset } from './tileset';

const STEEL = mix(PAL.fog, PAL.sky, 0.45);
const STEEL_DARK = mix(STEEL, PAL.ink, 0.4);
const COUNTER_FRONT = mix(PAL.wood, PAL.bark, 0.35);

type Seg = 'l' | 'm' | 'r';

/** Counter top with a back edge against the wall; ends get a rounded lip. */
function counterTop(c: PixelCanvas, seg: Seg): void {
  const top = mix(PAL.tan, PAL.sand, 0.35);
  c.rect(0, 0, 16, 16, PAL.bark);
  c.rect(0, 2, 16, 12, top);
  c.hline(0, 2, 16, PAL.sand);
  c.hline(0, 13, 16, mix(top, PAL.wood, 0.4));
  c.rect(0, 14, 16, 2, PAL.wood);
  c.hline(0, 14, 16, PAL.tan);
  c.hline(3, 5, 4, mix(top, PAL.sand, 0.6));
  c.hline(9, 9, 5, mix(top, PAL.sand, 0.6));
  if (seg === 'l') c.vline(0, 0, 16, PAL.ink), c.vline(1, 2, 12, PAL.sand);
  if (seg === 'r') c.vline(15, 0, 16, PAL.ink), c.vline(14, 2, 12, mix(top, PAL.wood, 0.4));
}

function counterFront(c: PixelCanvas, seg: Seg): void {
  c.rect(0, 0, 16, 16, COUNTER_FRONT);
  c.hline(0, 0, 16, PAL.bark);
  for (let x = 0; x < 16; x += 4) {
    c.vline(x, 1, 13, mix(COUNTER_FRONT, PAL.ink, 0.25));
    c.vline(x + 1, 1, 13, mix(COUNTER_FRONT, PAL.tan, 0.35));
  }
  c.rect(0, 14, 16, 2, PAL.cocoa);
  if (seg === 'l') c.vline(0, 0, 16, PAL.ink);
  if (seg === 'r') c.vline(15, 0, 16, PAL.ink);
}

function till(c: PixelCanvas): void {
  counterTop(c, 'm');
  c.rect(3, 4, 10, 7, PAL.ash);
  c.rect(4, 5, 8, 3, PAL.glow);
  c.hline(4, 5, 8, PAL.cream);
  c.rect(4, 9, 8, 2, PAL.slate);
  for (let x = 5; x < 12; x += 2) c.set(x, 10, PAL.fog);
  c.frame(3, 4, 10, 7, PAL.ink);
}

function cakeDisplay(c: PixelCanvas, frosting: string): void {
  counterTop(c, 'm');
  c.rect(2, 3, 12, 9, PAL.sky);
  c.rect(3, 4, 10, 7, mix(PAL.sky, PAL.cream, 0.55));
  c.rect(4, 7, 8, 3, PAL.paper);
  c.rect(4, 6, 8, 2, frosting);
  c.hline(4, 6, 8, mix(frosting, PAL.cream, 0.5));
  c.set(6, 5, PAL.brick);
  c.set(9, 5, PAL.brick);
  c.frame(2, 3, 12, 9, PAL.ink);
  c.set(4, 4, PAL.cream);
  c.set(5, 4, PAL.cream);
}

function pastryBasket(c: PixelCanvas): void {
  counterTop(c, 'm');
  c.roundRect(3, 6, 10, 6, [1], [1], PAL.wood);
  c.hline(3, 8, 10, PAL.bark);
  c.ellipse(6, 5, 2.5, 2, PAL.amber);
  c.ellipse(10, 5, 2.5, 2, PAL.peach);
  c.set(5, 4, PAL.sand);
  c.set(10, 4, PAL.cream);
  c.outline(PAL.ink);
}

function cupsOnCounter(c: PixelCanvas): void {
  counterTop(c, 'm');
  cup(c, 3, 5, PAL.coral);
  cup(c, 8, 4, PAL.water);
  c.rect(12, 5, 2, 5, PAL.cream);
  c.set(12, 5, PAL.coral);
  c.hline(2, 11, 6, PAL.fog);
}

/** Upper half of the machine; it stands on the counter tile below. */
function espressoTop(c: PixelCanvas): void {
  c.rect(1, 6, 14, 10, STEEL);
  c.rect(1, 6, 14, 2, mix(STEEL, PAL.cream, 0.55));
  c.rect(3, 9, 4, 4, PAL.ink);
  c.rect(9, 9, 4, 4, PAL.ink);
  c.set(4, 10, PAL.brick);
  c.set(10, 10, PAL.leaf);
  c.hline(1, 15, 14, STEEL_DARK);
  c.vline(1, 6, 10, PAL.ink);
  c.vline(14, 6, 10, PAL.ink);
  c.hline(1, 6, 14, PAL.ink);
  c.hline(2, 5, 12, PAL.ink);
}

/** Lower half: group heads, portafilters and cups on the counter. */
function espressoBase(c: PixelCanvas): void {
  counterTop(c, 'm');
  c.rect(1, 0, 14, 8, STEEL);
  c.rect(3, 1, 4, 3, STEEL_DARK);
  c.rect(9, 1, 4, 3, STEEL_DARK);
  c.rect(4, 4, 3, 2, PAL.ink);
  c.rect(9, 4, 3, 2, PAL.ink);
  c.vline(1, 0, 8, PAL.ink);
  c.vline(14, 0, 8, PAL.ink);
  c.hline(1, 7, 14, STEEL_DARK);
  cup(c, 4, 8, PAL.coral);
  cup(c, 9, 8, PAL.water);
  c.hline(1, 11, 14, PAL.ink);
}

function stool(c: PixelCanvas): void {
  c.ellipse(8, 9, 5.5, 3, PAL.brick);
  c.ellipse(8, 8, 4.5, 2, PAL.coral);
  c.hline(5, 7, 4, PAL.peach);
  c.rect(7, 11, 2, 3, PAL.ash);
  c.hline(4, 14, 8, PAL.slate);
  c.vline(5, 12, 2, PAL.slate);
  c.vline(10, 12, 2, PAL.slate);
  c.outline(PAL.ink);
}

function roundTable(c: PixelCanvas, item: 'cup' | 'flower' | 'cake'): void {
  c.ellipse(8, 8, 7.5, 4.5, PAL.bark);
  c.ellipse(8, 7, 7, 4, PAL.tan);
  c.ellipse(8, 6.5, 5.5, 3, mix(PAL.tan, PAL.sand, 0.55));
  c.rect(7, 11, 2, 3, PAL.bark);
  c.hline(5, 14, 6, PAL.bark);
  c.hline(5, 15, 6, PAL.cocoa);
  if (item === 'cup') {
    cup(c, 6, 4, PAL.coral);
    c.set(11, 6, PAL.cream);
  } else if (item === 'flower') {
    c.rect(7, 5, 2, 3, mix(PAL.sky, PAL.cream, 0.4));
    c.set(7, 3, PAL.pink);
    c.set(8, 3, PAL.pink);
    c.set(7, 4, PAL.leafDark);
    c.set(9, 4, PAL.gold);
  } else {
    c.rect(5, 5, 4, 3, PAL.cream);
    c.hline(5, 5, 4, PAL.pink);
    c.set(6, 4, PAL.brick);
    c.rect(10, 6, 2, 1, PAL.fog);
  }
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
  if (seg === 'l') cup(c, 8, 6, PAL.coral);
  else c.rect(4, 6, 6, 3, PAL.deep), c.rect(5, 6, 4, 2, PAL.cream);
  c.outline(PAL.ink);
}

function pendant(c: PixelCanvas): void {
  c.vline(8, 0, 6, PAL.ink);
  c.roundRect(4, 6, 9, 5, [2, 1], [], PAL.coral);
  c.hline(4, 6, 9, PAL.peach);
  c.hline(4, 10, 9, PAL.glow);
  c.rect(7, 11, 3, 2, PAL.glow);
  c.set(8, 12, PAL.cream);
  c.outline(PAL.ink);
}

function chalkboard(c: PixelCanvas): void {
  wallBackdrop(c, WARM_WALL, 3, 2);
  c.rect(2, 4, 44, 26, PAL.wood);
  c.rect(4, 6, 40, 22, PAL.moss);
  c.frame(2, 4, 44, 26, PAL.ink);
  c.hline(2, 4, 44, PAL.tan);
  c.hline(8, 9, 14, PAL.cream);
  c.hline(26, 9, 10, PAL.cream);
  for (let i = 0; i < 4; i++) {
    c.hline(8, 14 + i * 4, 18 - (i % 2) * 5, mix(PAL.moss, PAL.cream, 0.7));
    c.hline(32, 14 + i * 4, 6, mix(PAL.moss, PAL.cream, 0.7));
  }
  cup(c, 37, 8, PAL.coral);
  c.rect(4, 26, 8, 2, PAL.sand);
  c.hline(5, 26, 3, PAL.cream);
}

function shelfWall(c: PixelCanvas, kind: 'cups' | 'jars'): void {
  wallBackdrop(c, WARM_WALL, 1, 1);
  c.rect(0, 11, 16, 3, PAL.wood);
  c.hline(0, 11, 16, PAL.tan);
  c.hline(0, 14, 16, PAL.bark);
  if (kind === 'cups') {
    cup(c, 2, 8, PAL.coral);
    cup(c, 6, 8, PAL.water);
    cup(c, 10, 8, PAL.leaf);
    c.hline(2, 5, 4, PAL.cream);
    c.hline(8, 5, 5, PAL.cream);
  } else {
    for (const [x, color] of [[2, PAL.amber], [6, PAL.brick], [10, PAL.leaf]] as const) {
      c.rect(x, 5, 3, 6, mix(PAL.sky, PAL.cream, 0.5));
      c.rect(x, 7, 3, 4, color);
      c.hline(x, 5, 3, PAL.wood);
    }
  }
}

/** Tileset for the cafe: warm wood, cream checker floor and a coffee counter. */
export function buildCafeTileset(): Tileset {
  const set = new Tileset('cafe');

  set.add('floor_a', (c) => checkerFloor(c, mix(PAL.cream, PAL.paper, 0.5), 3));
  set.add('floor_b', (c) => checkerFloor(c, mix(PAL.sand, PAL.paper, 0.4), 7));
  set.add('floor_wood_0', (c) => plankFloor(c, 0));
  set.add('floor_wood_1', (c) => plankFloor(c, 6));
  addShell(set, WARM_WALL);

  for (const seg of ['l', 'm', 'r'] as const) {
    set.add(`counter_top_${seg}`, (c) => counterTop(c, seg), { solid: true });
    set.add(`counter_front_${seg}`, (c) => counterFront(c, seg), { solid: true });
  }
  set.add('counter_till', till, { solid: true });
  set.add('counter_cake_a', (c) => cakeDisplay(c, PAL.pink), { solid: true });
  set.add('counter_cake_b', (c) => cakeDisplay(c, PAL.cocoa), { solid: true });
  set.add('counter_pastry', pastryBasket, { solid: true });
  set.add('counter_cups', cupsOnCounter, { solid: true });
  set.addBlock(
    'espresso',
    1,
    2,
    (c) => {
      espressoTop(c);
      const base = new PixelCanvas(16, 16);
      espressoBase(base);
      c.blit(base, 0, 16);
    },
    (_x, row) => ({ solid: row === 1, sortOffset: 1 - row }),
  );

  set.add('stool', stool, { solid: true });
  set.add('table_cup', (c) => roundTable(c, 'cup'), { solid: true });
  set.add('table_flower', (c) => roundTable(c, 'flower'), { solid: true });
  set.add('table_cake', (c) => roundTable(c, 'cake'), { solid: true });
  addChairs(set, 'chair', PAL.coral);
  addChairs(set, 'chair_g', PAL.leafDark);
  addSofaDown(set, 'sofa', PAL.water);
  addArmchairSides(set, 'armchair', PAL.plum);
  set.add('coffee_table_l', (c) => coffeeTable(c, 'l'), { solid: true });
  set.add('coffee_table_r', (c) => coffeeTable(c, 'r'), { solid: true });
  addPlant(set);
  addRug(set, 'rug', PAL.deep, PAL.sky);

  set.addBlock('chalk', 3, 2, chalkboard, () => ({ solid: true }));
  set.add('wall_shelf_cups', (c) => shelfWall(c, 'cups'), { solid: true });
  set.add('wall_shelf_jars', (c) => shelfWall(c, 'jars'), { solid: true });
  set.add('pendant', pendant);

  return set;
}
