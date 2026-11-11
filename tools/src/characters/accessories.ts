import { MARK_PRIMARY, MARK_SECONDARY, PAL } from '../palette';
import type { PixelCanvas } from '../png';
import type { LayerDraw } from './body';
import { shadeUndersides, type Rig } from './rig';

export type AccessoryStyle = 'glasses' | 'headphones' | 'catears' | 'bow' | 'beanie' | 'scarf';

const [L, M, D] = MARK_PRIMARY;
const [SL, SM] = MARK_SECONDARY;

function glasses(c: PixelCanvas, rig: Rig, hx: number, hy: number): void {
  if (rig.view === 'down') {
    c.frame(hx + 3, hy + 9, 5, 6, M);
    c.frame(hx + 12, hy + 9, 5, 6, M);
    c.hline(hx + 8, hy + 11, 4, M);
    c.set(hx + 3, hy + 9, L);
    c.set(hx + 12, hy + 9, L);
  } else if (rig.view === 'side') {
    c.frame(hx + 1, hy + 9, 4, 6, M);
    c.hline(hx + 5, hy + 11, 6, M);
  }
}

function headphones(c: PixelCanvas, rig: Rig, hx: number, hy: number): void {
  if (rig.view === 'side') {
    c.rect(hx + 9, hy - 4, 2, 9, PAL.ash);
    c.roundRect(hx + 7, hy + 5, 6, 7, [1], [1], M);
    c.rect(hx + 9, hy + 7, 2, 3, L);
    return;
  }
  const band: [number, number, number][] = [
    [5, -4, 10],
    [3, -3, 2],
    [15, -3, 2],
    [1, -2, 2],
    [17, -2, 2],
    [0, -1, 1],
    [19, -1, 1],
  ];
  for (const [rx, ry, w] of band) c.hline(hx + rx, hy + ry, w, PAL.ash);
  c.vline(hx - 1, hy, 4, PAL.ash);
  c.vline(hx + 20, hy, 4, PAL.ash);
  c.roundRect(hx - 3, hy + 4, 4, 7, [1], [1], M);
  c.roundRect(hx + 19, hy + 4, 4, 7, [1], [1], M);
  c.vline(hx - 2, hy + 6, 3, L);
  c.vline(hx + 21, hy + 6, 3, L);
}

function ear(c: PixelCanvas, x: number, y: number, inner: boolean): void {
  c.hline(x, y, 5, M);
  c.hline(x, y - 1, 4, M);
  c.hline(x + 1, y - 2, 3, M);
  c.hline(x + 1, y - 3, 2, M);
  if (inner) c.rect(x + 1, y - 1, 2, 2, PAL.blush);
}

function catEars(c: PixelCanvas, rig: Rig, hx: number, hy: number): void {
  if (rig.view === 'side') {
    ear(c, hx + 11, hy - 3, false);
    ear(c, hx + 5, hy - 3, true);
    return;
  }
  ear(c, hx + 1, hy - 3, rig.view === 'down');
  const flipped = c.crop(hx + 1, hy - 6, 5, 4);
  c.blit(flipped, hx + 14, hy - 6, true);
}

function bow(c: PixelCanvas, rig: Rig, hx: number, hy: number): void {
  const x = rig.view === 'side' ? hx + 9 : hx + 12;
  const y = hy - 4;
  c.rect(x, y, 3, 4, M);
  c.rect(x + 4, y, 3, 4, M);
  c.rect(x + 3, y + 1, 1, 2, D);
  c.erase(x + 2, y);
  c.erase(x + 4, y);
  c.erase(x + 2, y + 3);
  c.erase(x + 4, y + 3);
  c.set(x, y, L);
  c.set(x + 5, y, L);
}

function beanie(c: PixelCanvas, hx: number, hy: number): void {
  c.roundRect(hx - 1, hy - 4, 22, 9, [6, 4, 2, 1], [], M);
  c.rect(hx - 1, hy + 2, 22, 3, SM);
  for (let rx = 0; rx < 22; rx += 3) c.set(hx - 1 + rx, hy + 3, SL);
  c.roundRect(hx + 8, hy - 7, 4, 3, [1], [], SL);
  c.hline(hx + 4, hy - 2, 5, L);
}

function scarf(c: PixelCanvas, rig: Rig): void {
  const t = rig.torso;
  c.rect(t.x - 1, t.y - 1, t.w + 2, 4, M);
  c.hline(t.x, t.y - 1, t.w, L);
  const tailX = rig.view === 'side' ? t.x + t.w - 2 : t.x + t.w - 4;
  c.rect(tailX, t.y + 3, 3, 6, M);
  c.hline(tailX, t.y + 6, 3, SM);
  c.hline(tailX, t.y + 8, 3, SM);
}

/** Accessory layer, drawn last over the hair. */
export function accessoryLayer(style: AccessoryStyle): LayerDraw {
  return (c, rig: Rig) => {
    const { x: hx, y: hy } = rig.head;
    switch (style) {
      case 'glasses':
        glasses(c, rig, hx, hy);
        return;
      case 'headphones':
        headphones(c, rig, hx, hy);
        break;
      case 'catears':
        catEars(c, rig, hx, hy);
        return;
      case 'bow':
        bow(c, rig, hx, hy);
        break;
      case 'beanie':
        beanie(c, hx, hy);
        break;
      case 'scarf':
        scarf(c, rig);
        break;
    }
    shadeUndersides(c, MARK_PRIMARY, MARK_SECONDARY);
  };
}
