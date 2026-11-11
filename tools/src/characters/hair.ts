import { MARK_PRIMARY, PAL } from '../palette';
import type { PixelCanvas } from '../png';
import type { LayerDraw } from './body';
import { shadeUndersides, type Rig } from './rig';

export interface HairStyle {
  id: string;
  name: string;
  top: 'round' | 'spiky';
  fringe: 'straight' | 'parted' | 'swept' | 'spiky';
  locks: 'short' | 'chin' | 'long' | 'wide';
  back: 'none' | 'neck' | 'long';
  extra: 'none' | 'twintails' | 'ponytail' | 'buns';
}

export const HAIR_STYLES: HairStyle[] = [
  { id: 'short', name: 'Short', top: 'round', fringe: 'swept', locks: 'short', back: 'none', extra: 'none' },
  { id: 'spiky', name: 'Spiky', top: 'spiky', fringe: 'spiky', locks: 'short', back: 'none', extra: 'none' },
  { id: 'bob', name: 'Bob', top: 'round', fringe: 'straight', locks: 'chin', back: 'neck', extra: 'none' },
  { id: 'long', name: 'Long', top: 'round', fringe: 'parted', locks: 'long', back: 'long', extra: 'none' },
  { id: 'twintails', name: 'Twin tails', top: 'round', fringe: 'straight', locks: 'chin', back: 'none', extra: 'twintails' },
  { id: 'ponytail', name: 'Ponytail', top: 'round', fringe: 'swept', locks: 'short', back: 'none', extra: 'ponytail' },
  { id: 'buns', name: 'Buns', top: 'round', fringe: 'parted', locks: 'short', back: 'none', extra: 'buns' },
  { id: 'hime', name: 'Hime cut', top: 'round', fringe: 'straight', locks: 'wide', back: 'long', extra: 'none' },
];

const [L, M, D] = MARK_PRIMARY;
const CAP_TOP = [6, 4, 2, 1];
const LOCK_END = { short: 11, chin: 18, long: 24, wide: 18 } as const;
const ZIGZAG = [2, 1, 0, 1];

function cap(c: PixelCanvas, hx: number, hy: number): void {
  c.roundRect(hx - 1, hy - 3, 22, 11, CAP_TOP, [], M);
}

function spikes(c: PixelCanvas, hx: number, hy: number): void {
  for (const sx of [2, 8, 14]) {
    c.hline(hx + sx, hy - 4, 3, M);
    c.set(hx + sx + 1, hy - 5, M);
  }
  c.set(hx - 2, hy + 3, M);
  c.set(hx + 21, hy + 3, M);
}

function shine(c: PixelCanvas, hx: number, hy: number, columns: number[]): void {
  for (const rx of columns) if (c.get(hx + rx, hy) === M) c.set(hx + rx, hy, L);
  for (const rx of columns.slice(1, 3)) if (c.get(hx + rx, hy - 1) === M) c.set(hx + rx, hy - 1, L);
}

/** Carves the lower edge of the fringe, seen from the front. */
function cutFringeFront(c: PixelCanvas, style: HairStyle, hx: number, hy: number): void {
  switch (style.fringe) {
    case 'parted':
      for (let r = 4; r <= 7; r++) for (let rx = 13 - r; rx <= 6 + r; rx++) c.erase(hx + rx, hy + r);
      break;
    case 'swept':
      for (let rx = 0; rx < 20; rx++) {
        const edge = 7 - Math.floor((19 - rx) / 6);
        for (let r = edge + 1; r <= 7; r++) c.erase(hx + rx, hy + r);
      }
      break;
    case 'spiky':
      for (let rx = -1; rx <= 20; rx++) {
        const edge = 5 + ZIGZAG[(rx + 4) % 4]!;
        for (let r = edge + 1; r <= 7; r++) c.erase(hx + rx, hy + r);
      }
      break;
    case 'straight':
      c.erase(hx + 6, hy + 7);
      c.erase(hx + 13, hy + 7);
      break;
  }
}

function tail(c: PixelCanvas, x: number, y: number, w: number, h: number): void {
  c.roundRect(x, y, w, h, [1], [2, 1], M);
  c.vline(x, y + 2, h - 5, D);
  c.vline(x + w - 1, y + 2, h - 5, D);
}

function drawFront(c: PixelCanvas, style: HairStyle, hx: number, hy: number): void {
  cap(c, hx, hy);
  cutFringeFront(c, style, hx, hy);
  const lockW = style.locks === 'wide' ? 4 : 3;
  const lockH = LOCK_END[style.locks] - 6;
  c.rect(hx - 1, hy + 7, lockW, lockH, M);
  c.rect(hx + 21 - lockW, hy + 7, lockW, lockH, M);
  if (style.top === 'spiky') spikes(c, hx, hy);
  if (style.extra === 'twintails') {
    tail(c, hx - 5, hy + 4, 4, 21);
    tail(c, hx + 21, hy + 4, 4, 21);
    c.rect(hx - 2, hy + 5, 1, 2, PAL.coral);
    c.rect(hx + 21, hy + 5, 1, 2, PAL.coral);
  }
  if (style.extra === 'buns') {
    c.roundRect(hx - 2, hy - 5, 6, 5, [1], [1], M);
    c.roundRect(hx + 16, hy - 5, 6, 5, [1], [1], M);
  }
  shine(c, hx, hy, [4, 5, 6, 7, 8, 11, 12, 13]);
}

function drawBehind(c: PixelCanvas, style: HairStyle, hx: number, hy: number): void {
  const end = style.back === 'long' ? 31 : style.back === 'neck' ? 22 : 19;
  c.roundRect(hx - 1, hy - 3, 22, end + 4, CAP_TOP, [3, 1], M);
  for (const rx of [4, 10, 15]) {
    for (let ry = 8; ry <= end - 3; ry++) if ((ry + rx) % 6 < 3) c.set(hx + rx, hy + ry, D);
  }
  if (style.top === 'spiky') spikes(c, hx, hy);
  if (style.extra === 'twintails') {
    tail(c, hx - 5, hy + 4, 4, 21);
    tail(c, hx + 21, hy + 4, 4, 21);
  }
  if (style.extra === 'ponytail') {
    tail(c, hx + 7, hy + 5, 6, 20);
    c.rect(hx + 8, hy + 3, 4, 2, PAL.coral);
  }
  if (style.extra === 'buns') {
    c.roundRect(hx - 2, hy - 5, 6, 5, [1], [1], M);
    c.roundRect(hx + 16, hy - 5, 6, 5, [1], [1], M);
  }
  shine(c, hx, hy, [4, 5, 6, 7, 8, 11, 12, 13]);
}

function drawSide(c: PixelCanvas, style: HairStyle, hx: number, hy: number): void {
  cap(c, hx, hy);
  switch (style.fringe) {
    case 'parted':
      c.eraseRect(hx - 1, hy + 5, 5, 3);
      break;
    case 'swept':
      c.eraseRect(hx - 1, hy + 6, 7, 2);
      break;
    case 'spiky':
      for (let rx = -1; rx <= 9; rx++) {
        const edge = 5 + ZIGZAG[(rx + 4) % 4]!;
        for (let r = edge + 1; r <= 7; r++) c.erase(hx + rx, hy + r);
      }
      break;
    case 'straight':
      c.erase(hx - 1, hy + 7);
      break;
  }
  c.rect(hx + 11, hy + 8, 10, 10, M);
  c.rect(hx + 12, hy + 18, 7, 2, M);
  const burnW = style.locks === 'wide' ? 3 : 2;
  c.rect(hx + 11 - burnW, hy + 8, burnW, LOCK_END[style.locks] - 7, M);
  if (style.back === 'neck') c.rect(hx + 12, hy + 18, 10, 5, M);
  if (style.back === 'long') c.roundRect(hx + 12, hy + 18, 10, 14, [], [1], M);
  if (style.top === 'spiky') spikes(c, hx, hy);
  if (style.extra === 'twintails') {
    tail(c, hx + 12, hy + 5, 5, 20);
    c.rect(hx + 13, hy + 5, 3, 2, PAL.coral);
  }
  if (style.extra === 'ponytail') {
    c.roundRect(hx + 18, hy - 2, 6, 7, [2, 1], [1], M);
    tail(c, hx + 21, hy + 4, 4, 18);
    c.rect(hx + 20, hy + 3, 2, 2, PAL.coral);
  }
  if (style.extra === 'buns') c.roundRect(hx + 9, hy - 6, 6, 5, [1], [1], M);
  shine(c, hx, hy, [3, 4, 5, 6, 7, 8]);
}

/** Hair drawn over the head. */
export function hairLayer(style: HairStyle): LayerDraw {
  return (c, rig: Rig) => {
    const { x: hx, y: hy } = rig.head;
    if (rig.view === 'down') drawFront(c, style, hx, hy);
    else if (rig.view === 'up') drawBehind(c, style, hx, hy);
    else drawSide(c, style, hx, hy);
    shadeUndersides(c, MARK_PRIMARY);
  };
}

/** Hair that hangs behind the body when seen from the front, if the style has any. */
export function hairBackLayer(style: HairStyle): LayerDraw | null {
  if (style.back === 'none' && style.extra !== 'ponytail') return null;
  return (c, rig: Rig) => {
    if (rig.view !== 'down') return;
    const { x: hx, y: hy } = rig.head;
    if (style.back === 'neck') c.roundRect(hx - 1, hy + 6, 22, 17, [], [1], D);
    if (style.back === 'long') c.roundRect(hx - 1, hy + 6, 22, 25, [], [5, 3, 2, 1, 1], D);
    if (style.extra === 'ponytail') {
      c.roundRect(hx + 13, hy - 5, 8, 9, [2, 1], [2, 1], M);
      c.roundRect(hx + 19, hy + 3, 4, 17, [], [1], M);
      c.vline(hx + 22, hy + 5, 12, D);
    }
  };
}
