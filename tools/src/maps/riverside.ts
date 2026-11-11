import { TILE } from '@study/shared';
import { makeRng } from '../png';
import type { Tileset } from '../tiles/tileset';
import { MapBuilder } from './builder';
import { assertReachable, hash2, Layout } from './outdoorKit';

const W = 40;
const H = 24;
/** The two rows of the road, the bridge and the door at the west edge. */
const ROAD = 9;

/** The river is a winding band that runs top to bottom and leaves the map at both ends. */
const centre = (y: number): number => 19.5 + 3.2 * Math.sin(y * 0.42 + 0.6) * Math.min(1, Math.abs(y - 9.5) / 5.5);
const halfWidth = (y: number): number => 2.7 + 0.8 * Math.sin(y * 0.5 + 1.3);
const inWater = (x: number, y: number): boolean => y >= 0 && y < H && Math.abs(x + 0.5 - centre(y)) <= halfWidth(y);

function span(y: number): { left: number; right: number } {
  let left = W;
  let right = -1;
  for (let x = 0; x < W; x++) {
    if (!inWater(x, y)) continue;
    left = Math.min(left, x);
    right = Math.max(right, x);
  }
  return { left, right };
}

/** The riverside: a river with a bridge, a pier, a fishing dock, willows and bankside benches. */
export function buildRiverside(town: Tileset): MapBuilder {
  const m = new MapBuilder(W, H, town);
  const rand = makeRng(7070);

  const spans = Array.from({ length: H }, (_, y) => span(y));
  const rows = (from: number, to: number): { left: number; right: number }[] => spans.slice(from, to + 1);
  const minLeft = Math.min(...rows(3, 20).map((s) => s.left));
  const maxRight = Math.max(...rows(3, 20).map((s) => s.right));
  const promW = minLeft - 3; // west promenade occupies promW and promW + 1
  const promE = maxRight + 2; // east promenade occupies promE and promE + 1
  const bridgeL = Math.min(spans[ROAD]!.left, spans[ROAD + 1]!.left) - 1;
  const bridgeR = Math.max(spans[ROAD]!.right, spans[ROAD + 1]!.right) + 1;

  const isPath = (x: number, y: number): boolean => {
    if (inWater(x, y)) return false;
    if (y === ROAD || y === ROAD + 1) return x < bridgeL || x > bridgeR ? x <= 35 : false;
    if (y >= 3 && y <= 20) return (x >= promW && x <= promW + 1) || (x >= promE && x <= promE + 1);
    return false;
  };
  const layout = new Layout(W, H, (x, y) => isPath(x, y) || inWater(x, y));

  // Ground: grass, the river, then the paths.
  m.fill('ground', 0, 0, W, H, () => {
    const r = rand();
    return r < 0.6 ? 'grass_0' : r < 0.82 ? 'grass_1' : r < 0.93 ? 'grass_2' : 'grass_3';
  });
  m.autotile('ground', 'water', inWater);
  m.autotile('ground', 'path', isPath, (x, y) => inWater(x, y) && y >= ROAD && y <= ROAD + 1);

  // Border trees. Nothing grows in the river or across the entrance rows.
  const water = (x: number, y: number, w: number, h: number): boolean => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (inWater(xx, yy)) return true;
    return false;
  };
  const tree = (x: number, y: number): void => {
    if (water(x, y, 2, 3)) return;
    m.block('furniture', x, y, 'tree', 2, 3);
    layout.take(x, y, 2, 3, 'border tree');
  };
  for (let x = 0; x < W; x += 2) {
    tree(x, 0);
    tree(x, 21);
  }
  for (const y of [3, 6]) tree(0, y);
  for (const y of [11, 14, 17]) tree(0, y);
  for (let y = 3; y <= 18; y += 3) tree(38, y);

  // Bridge over the road rows, with posts at its four corners.
  for (let x = bridgeL; x <= bridgeR; x++) {
    const post = x === bridgeL || x === bridgeR || (x - bridgeL) % 3 === 0 ? 0 : 1;
    m.set('walls', x, ROAD, `river_bridge_top_${post}`);
    m.set('walls', x, ROAD + 1, `river_bridge_bot_${post}`);
    if (inWater(x, ROAD)) m.setBlocked(x, ROAD, false);
    if (inWater(x, ROAD + 1)) m.setBlocked(x, ROAD + 1, false);
  }
  for (const [x, y] of [[bridgeL, ROAD - 1], [bridgeR, ROAD - 1], [bridgeL, ROAD + 2], [bridgeR, ROAD + 2]] as const) {
    m.set('furniture', x, y, 'river_post');
    layout.mark(x, y, 'bridge post');
  }
  for (let x = bridgeL; x <= bridgeR; x++) {
    layout.mark(x, ROAD, 'bridge');
    layout.mark(x, ROAD + 1, 'bridge');
  }

  // Jetty from the west promenade, ending in a bench that faces the far bank.
  const jettyY = 4;
  const jettyEnd = Math.min(spans[jettyY]!.left, spans[jettyY + 1]!.left) + 3;
  for (let x = promW + 2; x < jettyEnd; x++) {
    m.set('walls', x, jettyY, 'river_pier_top');
    m.set('walls', x, jettyY + 1, `river_pier_bot_${x % 2}`);
    for (const y of [jettyY, jettyY + 1]) {
      if (inWater(x, y)) m.setBlocked(x, y, false);
      layout.mark(x, y, 'jetty');
    }
  }
  m.block('furniture', jettyEnd, jettyY, 'garden_bench_r', 1, 2);
  m.seat(jettyEnd, jettyY, 'right', 'riverside', 'bench');
  m.seat(jettyEnd, jettyY + 1, 'right', 'riverside', 'bench');
  layout.mark(jettyEnd, jettyY, 'jetty bench');
  layout.mark(jettyEnd, jettyY + 1, 'jetty bench');

  // Fishing dock off the east promenade, with a boat moored alongside.
  const dockY = 16;
  const dockEnd = Math.max(spans[dockY]!.right, spans[dockY + 1]!.right) - 3;
  for (let x = dockEnd + 1; x < promE; x++) {
    m.set('walls', x, dockY, 'river_pier_top');
    m.set('walls', x, dockY + 1, `river_pier_bot_${x % 2}`);
    for (const y of [dockY, dockY + 1]) {
      if (inWater(x, y)) m.setBlocked(x, y, false);
      layout.mark(x, y, 'dock');
    }
  }
  m.block('furniture', dockEnd, dockY, 'garden_bench_l', 1, 2);
  m.seat(dockEnd, dockY, 'left', 'riverside', 'bench');
  m.seat(dockEnd, dockY + 1, 'left', 'riverside', 'bench');
  layout.mark(dockEnd, dockY, 'dock bench');
  layout.mark(dockEnd, dockY + 1, 'dock bench');
  const boatX = dockEnd + 1;
  if (water(boatX, dockY + 2, 3, 2) && !inWater(boatX - 1, dockY + 2) === false) {
    m.block('furniture', boatX, dockY + 2, 'river_boat', 3, 2);
    layout.mark(boatX, dockY + 2, 'boat');
  } else {
    throw new Error(`riverside: no room for the boat at (${boatX},${dockY + 2})`);
  }
  m.set('furniture', promE + 3, dockY, 'river_crate');
  m.set('furniture', promE + 3, dockY + 1, 'river_barrel');
  layout.take(promE + 3, dockY, 1, 2, 'dock stores');

  // Benches on both banks, facing the water.
  const bank = (side: 'west' | 'east', y: number): void => {
    const near = side === 'west' ? Math.min(spans[y]!.left, spans[y + 1]!.left) - 1 : Math.max(spans[y]!.right, spans[y + 1]!.right) + 1;
    layout.take(near, y, 1, 2, 'bank bench');
    m.block('furniture', near, y, side === 'west' ? 'garden_bench_r' : 'garden_bench_l', 1, 2);
    const facing = side === 'west' ? 'right' : 'left';
    m.seat(near, y, facing, 'riverside', 'bench');
    m.seat(near, y + 1, facing, 'riverside', 'bench');
  };
  for (const y of [7, 12, 14, 18]) bank('west', y);
  for (const y of [6, 12, 14, 19]) bank('east', y);

  // Picnic spots: a blanket with a bench on each side.
  const picnic = (x: number, y: number, benchZone: string): void => {
    layout.take(x, y, 2, 2, 'blanket');
    m.block('walls', x, y, 'garden_blanket', 2, 2);
    layout.take(x, y - 1, 2, 1, 'picnic bench');
    m.block('furniture', x, y - 1, 'bench_down', 2, 1);
    m.seat(x, y - 1, 'down', benchZone, 'bench');
    m.seat(x + 1, y - 1, 'down', benchZone, 'bench');
    layout.take(x, y + 2, 2, 1, 'picnic bench');
    m.block('furniture', x, y + 2, 'bench_up', 2, 1);
    m.seat(x, y + 2, 'up', benchZone, 'bench');
    m.seat(x + 1, y + 2, 'up', benchZone, 'bench');
  };
  picnic(4, 12, 'riverside');
  picnic(32, 13, 'riverside');

  // Willows on both banks.
  for (const [x, y] of [[3, 3], [3, 16], [33, 3], [33, 16]] as const) {
    if (!layout.fits(x, y, 5, 5)) throw new Error(`riverside: willow at (${x},${y}) does not fit`);
    layout.take(x, y, 5, 5, 'willow');
    m.block('furniture', x, y, 'river_willow', 5, 5);
  }

  // Lantern posts along both promenades.
  for (const y of [6, 11, 17]) {
    for (const x of [promW - 1, promE + 2]) {
      if (layout.fits(x, y, 1, 2)) {
        layout.take(x, y, 1, 2, 'lamppost');
        m.block('furniture', x, y, 'lamppost', 1, 2);
      }
    }
  }

  // Rocks on the banks, reeds at the water's edge, wild flowers on open grass.
  for (let i = 0; i < 40; i++) {
    const y = 3 + Math.floor(rand() * 18);
    const s = spans[y]!;
    const west = rand() < 0.5;
    const x = west ? s.left - 1 - Math.floor(rand() * 2) : s.right + 1 + Math.floor(rand() * 2);
    if (i < 8 && layout.fits(x, y, 1, 1) && !water(x, y, 1, 1)) {
      layout.take(x, y, 1, 1, 'rock');
      m.set('furniture', x, y, 'rock');
    }
  }
  for (let y = 3; y < 21; y++) {
    const s = spans[y]!;
    for (const x of [s.left - 1, s.right + 1]) {
      if (hash2(x, y, 9) < 0.55 && layout.fits(x, y, 1, 1)) {
        m.set('walls', x, y, `river_reeds_${(x + y) % 2}`);
        layout.mark(x, y, 'reeds');
      }
    }
  }
  for (let i = 0; i < 120; i++) {
    const x = 2 + Math.floor(rand() * (W - 4));
    const y = 3 + Math.floor(rand() * (H - 6));
    if (layout.fits(x, y, 1, 1) && m.isEmpty('walls', x, y) && m.isEmpty('furniture', x, y)) {
      m.set('walls', x, y, rand() < 0.5 ? 'flowers_0' : 'flowers_1');
    }
  }

  m.zone('riverside', 'Riverside', 0, 0, W, H, false);
  m.spawn('entrance', 3, ROAD, 'right');
  m.door('to-hub', 0, ROAD * TILE, 2 * TILE, 2 * TILE, 'hub', 'from-riverside');

  assertReachable('riverside', m, { x: 3 * TILE + 8, y: ROAD * TILE + 8 });
  return m;
}
