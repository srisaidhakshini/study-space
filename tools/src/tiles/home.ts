import { PAL } from '../palette';
import { PixelCanvas } from '../png';
import { renderBaseboard, renderSurface } from '../furniture/surfaces';
import { Tileset } from './tileset';

/**
 * Tiles of the player home rooms. The floor and wall tiles are only the
 * default look and the editor fallback: the client repaints the floor and
 * the back wall from the owner's chosen surfaces at runtime.
 */
export function buildHomeTileset(): Tileset {
  const set = new Tileset('home');

  set.add('hm_floor', (c) => c.blit(renderSurface('fl_oak'), 0, 0));

  // Back wall rows: crown moulding, plain wall, wall with skirting.
  set.add('hm_wall_a', (c) => {
    c.blit(renderSurface('wp_cream'), 0, 0);
    c.rect(0, 0, 16, 3, '#e4d0a2');
    c.hline(0, 0, 16, '#f8ecd0');
    c.hline(0, 3, 16, '#bda77a');
    c.hline(0, 4, 16, '#00000018');
  }, { solid: true });
  set.add('hm_wall_b', (c) => c.blit(renderSurface('wp_cream'), 0, 0), { solid: true });
  set.add('hm_wall_c', (c) => {
    c.blit(renderSurface('wp_cream'), 0, 0);
    c.blit(renderBaseboard(), 0, 0);
  }, { solid: true });

  // Side walls (their inner face) and the bottom wall.
  const sideWall = (c: PixelCanvas, edge: 'l' | 'r'): void => {
    c.rect(0, 0, 16, 16, PAL.bark);
    c.rect(edge === 'l' ? 0 : 4, 0, 12, 16, PAL.wood);
    c.vline(edge === 'l' ? 11 : 4, 0, 16, PAL.tan);
    c.vline(edge === 'l' ? 12 : 3, 0, 16, PAL.cocoa);
    for (const y of [3, 9, 13]) c.hline(edge === 'l' ? 2 : 6, y, 4, PAL.bark);
  };
  set.add('hm_side_l', (c) => sideWall(c, 'l'), { solid: true });
  set.add('hm_side_r', (c) => sideWall(c, 'r'), { solid: true });
  set.add('hm_bottom', (c) => {
    c.rect(0, 0, 16, 16, PAL.bark);
    c.hline(0, 0, 16, PAL.tan);
    c.hline(0, 1, 16, PAL.wood);
    c.rect(0, 2, 16, 8, PAL.wood);
    c.hline(0, 10, 16, PAL.cocoa);
    for (const x of [4, 11]) c.vline(x, 2, 8, PAL.bark);
    c.rect(0, 11, 16, 5, PAL.cocoa);
  }, { solid: true });

  // The doorway: two tiles wide, with posts, a threshold and a welcome mat.
  set.addBlock(
    'hm_door',
    2,
    1,
    (c) => {
      c.rect(0, 0, 32, 16, '#cdb089');
      c.hline(0, 0, 32, PAL.tan);
      c.hline(0, 1, 32, PAL.wood);
      c.rect(0, 0, 3, 16, PAL.bark);
      c.rect(29, 0, 3, 16, PAL.bark);
      c.vline(3, 0, 16, PAL.cocoa);
      c.vline(28, 0, 16, PAL.cocoa);
      c.vline(0, 0, 16, PAL.tan);
      c.vline(31, 0, 16, PAL.tan);
      // Welcome mat.
      c.rect(7, 5, 18, 8, PAL.brick);
      c.frame(7, 5, 18, 8, PAL.gold);
      for (let x = 10; x < 23; x += 3) c.vline(x, 7, 4, PAL.coral);
      c.hline(7, 15, 18, PAL.cocoa);
    },
    () => ({ solid: false }),
  );

  return set;
}
