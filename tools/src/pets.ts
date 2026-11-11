import { DIRECTIONS, PET_COLUMNS, PET_FRAME } from '@study/shared';
import { PAL } from './palette';
import { PixelCanvas } from './png';

export interface PetSpec {
  id: string;
  name: string;
  kind: 'cat' | 'bunny' | 'dog';
  body: string;
  belly: string;
  dark: string;
}

export const PETS: PetSpec[] = [
  { id: 'cat', name: 'Marmalade cat', kind: 'cat', body: '#e59a57', belly: PAL.cream, dark: '#b96f3d' },
  { id: 'bunny', name: 'Snow bunny', kind: 'bunny', body: '#efe3d3', belly: '#ffffff', dark: '#cdb8a4' },
  { id: 'shiba', name: 'Shiba pup', kind: 'dog', body: '#d79b55', belly: PAL.cream, dark: '#a86f3c' },
];

type View = 'down' | 'side' | 'up';

function feet(c: PixelCanvas, frame: number, xs: [number, number], y: number, color: string): void {
  const lift = frame === 2 ? [0, -1] : frame === 3 ? [-1, 0] : [0, 0];
  c.rect(xs[0], y + lift[0]!, 2, 1, color);
  c.rect(xs[1], y + lift[1]!, 2, 1, color);
}

function drawFrontOrBack(c: PixelCanvas, p: PetSpec, view: View, frame: number): void {
  const b = frame === 1 ? 1 : 0;
  c.rect(5, 9, 6, 5, p.body);
  feet(c, frame, [5, 9], 14, p.dark);
  if (view === 'down') c.rect(6, 11, 4, 3, p.belly);
  if (view === 'up') {
    if (p.kind === 'cat') c.vline(8, 10, 4, p.dark);
    if (p.kind === 'bunny') c.rect(7, 11, 2, 2, p.belly);
    if (p.kind === 'dog') c.rect(7, 10, 2, 2, p.belly);
  }
  c.roundRect(3, 3 + b, 10, 8, [2, 1], [2, 1], p.body);
  if (p.kind === 'cat') {
    c.pattern(3, 1 + b, ['x', 'xx'], { x: p.body });
    c.pattern(11, 1 + b, ['.x', 'xx'], { x: p.body });
  } else if (p.kind === 'bunny') {
    c.rect(4, 1, 2, 2 + b, p.body);
    c.rect(10, 1, 2, 2 + b, p.body);
    if (view === 'down') {
      c.set(4, 2, PAL.blush);
      c.set(10, 2, PAL.blush);
    }
  } else {
    c.rect(2, 4 + b, 2, 4, p.dark);
    c.rect(12, 4 + b, 2, 4, p.dark);
  }
  if (view === 'down') {
    c.rect(6, 7 + b, 4, 3, p.belly);
    c.set(5, 6 + b, PAL.ink);
    c.set(10, 6 + b, PAL.ink);
    c.hline(7, 8 + b, 2, PAL.pink);
  }
}

function drawSide(c: PixelCanvas, p: PetSpec, frame: number): void {
  const b = frame === 1 ? 1 : 0;
  c.rect(6, 8, 8, 5, p.body);
  c.hline(7, 12, 6, p.belly);
  const legs: [number, number] = frame === 2 ? [6, 12] : frame === 3 ? [8, 10] : [7, 11];
  c.rect(legs[0], 13, 2, 2, p.dark);
  c.rect(legs[1], 13, 2, 2, p.dark);
  if (p.kind === 'cat') c.vline(14, 5, 4, p.dark);
  if (p.kind === 'bunny') c.rect(13, 8, 2, 2, p.belly);
  if (p.kind === 'dog') c.rect(13, 6, 2, 3, p.belly);
  c.roundRect(1, 3 + b, 8, 8, [2, 1], [2, 1], p.body);
  if (p.kind === 'cat') {
    c.pattern(2, 1 + b, ['.x', 'xx'], { x: p.body });
    c.pattern(6, 1 + b, ['x', 'xx'], { x: p.body });
  } else if (p.kind === 'bunny') {
    c.rect(5, 1, 2, 2 + b, p.body);
  } else {
    c.rect(6, 4 + b, 2, 4, p.dark);
  }
  c.rect(1, 7 + b, 3, 2, p.belly);
  c.set(3, 6 + b, PAL.ink);
  c.set(1, 8 + b, PAL.pink);
}

/** Pet sheet: one row per direction, columns idle(2) then walk(2). */
export function renderPetSheet(pet: PetSpec): PixelCanvas {
  const sheet = new PixelCanvas(PET_COLUMNS * PET_FRAME, DIRECTIONS.length * PET_FRAME);
  DIRECTIONS.forEach((direction, row) => {
    for (let frame = 0; frame < PET_COLUMNS; frame++) {
      const cell = new PixelCanvas(PET_FRAME, PET_FRAME);
      if (direction === 'down' || direction === 'up') drawFrontOrBack(cell, pet, direction, frame);
      else drawSide(cell, pet, frame);
      cell.outline(PAL.ink);
      sheet.blit(cell, frame * PET_FRAME, row * PET_FRAME, direction === 'right');
    }
  });
  return sheet;
}
