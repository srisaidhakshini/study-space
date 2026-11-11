import { TILE, TREE_PLOT } from '@study/shared';
import { makeRng } from '../png';
import { FLOWER_COLOURS } from '../tiles/gardenTiles';
import type { Tileset } from '../tiles/tileset';
import { MapBuilder } from './builder';
import { assertReachable, hash2, Layout } from './outdoorKit';

const W = 36;
const H = 26;

const inRect = (x: number, y: number, rx: number, ry: number, rw: number, rh: number): boolean =>
  x >= rx && y >= ry && x < rx + rw && y < ry + rh;

// The shared tree stands in a round bed at the centre of a paved circle.
const CX = 18;
const CY = 12.5;
const ringDist = (x: number, y: number): number => Math.hypot(x + 0.5 - CX, y + 0.5 - CY);
const inBed = (x: number, y: number): boolean => ringDist(x, y) <= 2.9;
const inRing = (x: number, y: number): boolean => ringDist(x, y) <= 5.6;

// The pond in the north-west, with a line of stepping stones across it.
const inPond = (x: number, y: number): boolean =>
  ((x + 0.5 - 11.5) / 2.8) ** 2 + ((y + 0.5 - 6.5) / 2.6) ** 2 <= 1;
const STONE_ROW = 7;

const inPaths = (x: number, y: number): boolean =>
  inRect(x, y, 17, 19, 2, 7) || // gate to the circle
  inRect(x, y, 2, 12, 32, 2) || // east-west walk
  inRect(x, y, 6, 4, 2, 18) || // west walk
  inRect(x, y, 28, 4, 2, 18) || // east walk
  inRect(x, y, 6, 20, 24, 2); // southern walk

const isPath = (x: number, y: number): boolean => inPaths(x, y) && !inRing(x, y);

// Flower beds (soil with flowers) and the plaza round the small fountain.
const BEDS: [number, number, number, number][] = [
  [31, 4, 3, 7],
  [31, 14, 3, 6],
  [2, 4, 3, 7],
  [22, 9, 6, 2],
];
const inBedRect = (x: number, y: number): boolean => BEDS.some(([bx, by, bw, bh]) => inRect(x, y, bx, by, bw, bh));
const PLAZA = { x: 24, y: 15, w: 4, h: 4 };
const inPlaza = (x: number, y: number): boolean => inRect(x, y, PLAZA.x, PLAZA.y, PLAZA.w, PLAZA.h);
const inGateGap = (x: number): boolean => x >= 16 && x <= 19;

/** The garden: hedged walks round a shared tree, a pond, a greenhouse and many benches. */
export function buildGarden(town: Tileset): MapBuilder {
  const m = new MapBuilder(W, H, town);
  const rand = makeRng(5150);
  const layout = new Layout(W, H, isPath);

  // Ground: grass, the paved circle, then paths, pond and beds on top.
  m.fill('ground', 0, 0, W, H, () => {
    const r = rand();
    return r < 0.62 ? 'grass_0' : r < 0.84 ? 'grass_1' : r < 0.94 ? 'grass_2' : 'grass_3';
  });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if ((inRing(x, y) && !inBed(x, y)) || inPlaza(x, y)) m.set('ground', x, y, (x * 3 + y) % 4 === 0 ? 'plaza_1' : 'plaza_0');
    }
  }
  m.autotile('ground', 'path', isPath, (x, y) => inRing(x, y) || inPlaza(x, y));
  m.autotile('ground', 'water', inPond);
  m.autotile('ground', 'garden_bed', (x, y) => inBed(x, y) || inBedRect(x, y));

  // Border: trees along the top and sides, a hedge along the bottom with a gate.
  for (let x = 0; x < W; x += 2) {
    m.block('furniture', x, 0, 'tree', 2, 3);
    layout.take(x, 0, 2, 3, 'border tree');
  }
  for (let y = 3; y <= 21; y += 3) {
    for (const x of [0, 34]) {
      m.block('furniture', x, y, 'tree', 2, 3);
      layout.take(x, y, 2, 3, 'border tree');
    }
  }
  m.autotile('walls', 'garden_hedge', (x, y) => y >= 24 && !inGateGap(x));
  for (let x = 0; x < W; x++) {
    if (inGateGap(x)) continue;
    layout.take(x, 24, 1, 2, 'bottom hedge');
  }
  for (const x of [16, 19]) {
    m.block('furniture', x, 24, 'garden_pillar', 1, 2);
  }
  layout.take(16, 24, 1, 2, 'gate pillar');
  layout.take(19, 24, 1, 2, 'gate pillar');

  // The shared tree, its bed, and the zone around it.
  m.block('furniture', TREE_PLOT.x, TREE_PLOT.y, 'garden_tree', TREE_PLOT.size, TREE_PLOT.size);
  layout.take(TREE_PLOT.x, TREE_PLOT.y, TREE_PLOT.size, TREE_PLOT.size, 'shared tree');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (inBed(x, y) && !layout.isTaken(x, y)) {
        m.setBlocked(x, y, true);
        layout.mark(x, y, 'tree bed');
        const colour = FLOWER_COLOURS[(x + y * 2) % FLOWER_COLOURS.length];
        m.set('walls', x, y, `garden_fl_${colour}_${(x + y) % 2}`);
      }
    }
  }

  // Flower beds in every colour, kept clear of walking.
  for (const [bx, by, bw, bh] of BEDS) {
    layout.take(bx, by, bw, bh, 'flower bed');
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        m.setBlocked(x, y, true);
        const band = Math.floor((x - bx) / 2) + Math.floor((y - by) / 2) * 2 + bx;
        const colour = FLOWER_COLOURS[band % FLOWER_COLOURS.length];
        m.set('walls', x, y, `garden_fl_${colour}_${(x * 7 + y * 3) % 2}`);
      }
    }
  }

  // Greenhouse in the north-east, with its door facing the beds.
  m.block('furniture', 22, 4, 'garden_greenhouse', 6, 4);
  layout.take(22, 4, 6, 4, 'greenhouse');

  // Pond: lily pads, stepping stones and the paved bank.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inPond(x, y)) continue;
      if (y === STONE_ROW) {
        m.set('walls', x, y, `garden_stone_${x % 2}`);
        m.setBlocked(x, y, false);
      } else if (hash2(x, y, 3) < 0.45) {
        m.set('walls', x, y, `garden_lily_${(x + y) % 2}`);
      }
      layout.mark(x, y, 'pond');
    }
  }
  m.set('ground', 8, STONE_ROW, 'grass_0');

  // Furniture helpers. Every bench also registers its seats.
  const study = (x: number, y: number): boolean => inRect(x, y, 2, 14, 11, 7);
  const zoneFor = (x: number, y: number): string => (study(x, y) ? 'garden-study' : 'garden');
  const benchRow = (x: number, y: number, facing: 'down' | 'up'): void => {
    layout.take(x, y, 2, 1, 'bench');
    m.block('furniture', x, y, `bench_${facing}`, 2, 1);
    m.seat(x, y, facing, zoneFor(x, y), 'bench');
    m.seat(x + 1, y, facing, zoneFor(x, y), 'bench');
  };
  const benchCol = (x: number, y: number, facing: 'left' | 'right'): void => {
    layout.take(x, y, 1, 2, 'bench');
    m.block('furniture', x, y, facing === 'right' ? 'garden_bench_r' : 'garden_bench_l', 1, 2);
    m.seat(x, y, facing, zoneFor(x, y), 'bench');
    m.seat(x, y + 1, facing, zoneFor(x, y), 'bench');
  };

  // Pond banks.
  benchRow(9, 9, 'up');
  benchCol(8, 5, 'right');
  benchCol(14, 5, 'left');
  // Round the tree, facing the bed.
  benchRow(14, 17, 'up');
  benchRow(20, 17, 'up');
  benchCol(13, 14, 'right');
  benchCol(22, 14, 'left');
  // North-east, looking at the beds and the greenhouse.
  benchRow(24, 11, 'up');
  benchRow(26, 11, 'up');
  // The fountain plaza.
  m.block('furniture', 25, 16, 'fountain', 2, 2);
  layout.take(25, 16, 2, 2, 'fountain');
  benchRow(24, 14, 'down');
  benchRow(26, 14, 'down');
  benchRow(24, 19, 'up');
  benchRow(26, 19, 'up');

  // The quiet study corner: benches round a picnic blanket, a vine arbour on the walk.
  m.autotile('walls', 'garden_hedge', (x, y) => inRect(x, y, 8, 14, 4, 1) || (y >= 24 && !inGateGap(x)));
  layout.take(8, 14, 4, 1, 'study hedge');
  benchRow(8, 15, 'down');
  benchRow(10, 15, 'down');
  benchRow(8, 19, 'up');
  benchRow(10, 19, 'up');
  benchCol(3, 15, 'right');
  benchCol(3, 18, 'right');
  m.block('walls', 9, 17, 'garden_blanket', 2, 2);
  layout.take(9, 17, 2, 2, 'blanket');
  m.block('furniture', 5, 17, 'garden_arbour', 4, 2);
  layout.mark(5, 17, 'arbour');

  // Lamps along the walks and rocks at the edges.
  for (const [x, y] of [[5, 10], [30, 10], [16, 22], [19, 22], [9, 22], [26, 22]] as const) {
    layout.take(x, y, 1, 2, 'lamppost');
    m.block('furniture', x, y, 'lamppost', 1, 2);
  }
  for (const [x, y] of [[13, 21], [22, 21], [32, 12], [4, 22]] as const) {
    if (layout.fits(x, y, 1, 1)) {
      layout.take(x, y, 1, 1, 'rock');
      m.set('furniture', x, y, 'rock');
    }
  }

  // Wild flowers on open grass.
  for (let i = 0; i < 110; i++) {
    const x = 2 + Math.floor(rand() * (W - 4));
    const y = 3 + Math.floor(rand() * (H - 6));
    if (layout.fits(x, y, 1, 1) && m.isEmpty('walls', x, y) && m.isEmpty('furniture', x, y)) {
      m.set('walls', x, y, rand() < 0.5 ? 'flowers_0' : 'flowers_1');
    }
  }

  m.zone('garden', 'Garden', 0, 0, W, H, false);
  m.zone('garden-study', 'Study Benches', 2, 14, 11, 7, true, 'general');
  m.zone('shared-tree', 'Shared Tree', 12, 6, 12, 13, false);
  m.spawn('entrance', 18, 23, 'up');
  m.door('to-hub', 17 * TILE, 25 * TILE, 2 * TILE, TILE, 'hub', 'from-garden');

  assertReachable('garden', m, { x: 18 * TILE, y: 23 * TILE + 8 });
  return m;
}
