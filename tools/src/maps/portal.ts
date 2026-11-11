import { TILE } from '@study/shared';
import { makeRng } from '../png';
import type { Tileset } from '../tiles/tileset';
import { MapBuilder } from './builder';
import { verifyArea } from './verifyWorld';

const W = 20;
const H = 14;
const SKY_X = 3;
const SEA_X = 13;
const ARCH_Y = 1;
const PAD_Y = 4;

/** The portal room: a stone chamber with one portal to each other world. */
export function buildPortal(tiles: Tileset): MapBuilder {
  const m = new MapBuilder(W, H, tiles);
  const rand = makeRng(31);

  m.fill('ground', 0, 0, W, H, (x, y) => (rand() < 0.08 && x > 0 && y > 2 ? 'floor_rune' : (x + y) % 2 === 0 ? 'floor_0' : 'floor_1'));
  m.fill('walls', 0, 0, W, 1, 'wall_top');
  m.fill('walls', 1, 1, W - 2, 1, 'wall_upper');
  m.fill('walls', 1, 2, W - 2, 1, 'wall_lower');
  m.fill('walls', 0, 0, 1, H, 'wall_top');
  m.fill('walls', W - 1, 0, 1, H, 'wall_top');
  m.fill('walls', 0, H - 1, W, 1, (x) => (x === 9 || x === 10 ? 'doorway' : 'wall_top'));

  m.set('walls', 1, 1, 'banner:0:0');
  m.set('walls', 1, 2, 'banner:0:1');
  m.set('walls', W - 2, 1, 'banner:0:0');
  m.set('walls', W - 2, 2, 'banner:0:1');
  m.set('walls', 8, 2, 'plaque_sky');
  m.set('walls', 11, 2, 'plaque_dome');

  // Each portal: the arch stands against the wall, its plate lies in front.
  for (const [x, style] of [[SKY_X, 'sky'], [SEA_X, 'sea']] as const) {
    m.block('furniture', x, ARCH_Y, `portal_${style}`, 4, 3);
    m.block('walls', x, PAD_Y, `portal_${style}_pad`, 4, 1);
  }

  m.block('walls', 7, 6, 'ring', 6, 4);
  m.block('furniture', 1, 3, 'pedestal', 1, 2);
  m.block('furniture', 18, 3, 'pedestal', 1, 2);
  m.block('furniture', 8, 4, 'pillar', 1, 2);
  m.block('furniture', 11, 4, 'pillar', 1, 2);
  m.block('furniture', 1, 11, 'plant', 1, 2);
  m.block('furniture', 18, 11, 'plant', 1, 2);
  m.set('furniture', 6, 7, 'crystals');
  m.set('furniture', 13, 7, 'crystals');
  for (const x of [2, 15]) {
    m.block('furniture', x, 9, 'bench', 2, 1);
    m.seat(x, 9, 'down', 'portal', 'bench');
    m.seat(x + 1, 9, 'down', 'portal', 'bench');
  }

  m.zone('portal', 'Portal Room', 0, 0, W, H, false);
  m.spawn('entrance', 10, 12, 'up');
  m.door('to-hub', 9 * TILE, (H - 1) * TILE + 4, 2 * TILE, 12, 'hub', 'from-portal');

  m.door('to-skyisland', (SKY_X + 1) * TILE, PAD_Y * TILE, 2 * TILE, TILE, 'skyisland', 'entrance');
  m.door('to-dome', (SEA_X + 1) * TILE, PAD_Y * TILE, 2 * TILE, TILE, 'dome', 'entrance');
  m.spawn('from-skyisland', SKY_X + 2, PAD_Y + 1, 'down');
  m.spawn('from-dome', SEA_X + 2, PAD_Y + 1, 'down');
  verifyArea('portal', m);
  return m;
}
