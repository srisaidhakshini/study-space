import { footprint, rotateCell, rotateFacing, type Direction, type FurnitureItem } from '@study/shared';
import { mix, PAL } from '../palette';
import type { PixelCanvas } from '../png';

/** Shared helpers for drawing furniture: colour families and an oblique "box". */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Wood {
  hi: string;
  light: string;
  mid: string;
  dark: string;
}

export interface Cloth {
  hi: string;
  light: string;
  mid: string;
  dark: string;
}

export const WOODS = {
  oak: { hi: '#f0d9a8', light: PAL.sand, mid: PAL.tan, dark: PAL.wood },
  walnut: { hi: PAL.tan, light: PAL.wood, mid: PAL.bark, dark: PAL.cocoa },
  pine: { hi: '#f7ecd0', light: PAL.paper, mid: '#dcbf8a', dark: PAL.tan },
  white: { hi: '#fffaf0', light: PAL.cream, mid: '#ddd2c4', dark: '#a89c92' },
} as const satisfies Record<string, Wood>;

/** A fabric family from one base colour. */
export function cloth(base: string): Cloth {
  return {
    hi: mix(base, '#fff4d6', 0.45),
    light: mix(base, '#fff4d6', 0.2),
    mid: base,
    dark: mix(base, PAL.ink, 0.38),
  };
}

export const CLOTHS = {
  coral: cloth(PAL.coral),
  blue: cloth('#5d7fb0'),
  sage: cloth('#88a66e'),
  plum: cloth('#8a5f92'),
  cream: cloth('#ecd9b0'),
  gold: cloth('#dba840'),
  rose: cloth('#d98a9a'),
} as const satisfies Record<string, Cloth>;

export const BOOK_COLOURS = [PAL.brick, PAL.deep, PAL.leafDark, PAL.gold, PAL.plum, PAL.coral, PAL.pine, PAL.cream, PAL.water, '#c97a4a'];

export const insetRect = (r: Rect, left: number, top: number, right: number, bottom: number): Rect => ({
  x: r.x + left,
  y: r.y + top,
  w: r.w - left - right,
  h: r.h - top - bottom,
});

/**
 * An oblique box: a top face above a front (south) face of height `faceH`.
 * Everything is drawn inside `p`; callers inset it by one pixel so the
 * final outline has room.
 */
export function drawBox(c: PixelCanvas, p: Rect, faceH: number, wood: Wood): { top: Rect; face: Rect } {
  const fh = Math.max(2, Math.min(faceH, p.h - 2));
  const top: Rect = { x: p.x, y: p.y, w: p.w, h: p.h - fh };
  const face: Rect = { x: p.x, y: p.y + top.h, w: p.w, h: fh };
  c.rect(top.x, top.y, top.w, top.h, wood.light);
  c.hline(top.x, top.y, top.w, wood.hi);
  c.vline(top.x, top.y, top.h, wood.hi);
  c.vline(top.x + top.w - 1, top.y, top.h, wood.mid);
  c.rect(face.x, face.y, face.w, face.h, wood.mid);
  c.hline(face.x, face.y, face.w, wood.dark);
  c.hline(face.x, face.y + face.h - 1, face.w, wood.dark);
  c.vline(face.x + face.w - 1, face.y, face.h, wood.dark);
  return { top, face };
}

export function opposite(d: Direction): Direction {
  return d === 'up' ? 'down' : d === 'down' ? 'up' : d === 'left' ? 'right' : 'left';
}

/** Coordinates helper for one view of one item. */
export class ViewCtx {
  readonly fw: number;
  readonly fh: number;
  readonly width: number;
  readonly height: number;

  constructor(
    readonly item: FurnitureItem,
    readonly view: number,
  ) {
    const fp = footprint(item, view);
    this.fw = fp.w;
    this.fh = fp.h;
    this.width = fp.w * 16;
    this.height = (fp.h + item.lift) * 16;
  }

  /** Pixel rect covering rotation-0 cells (x0,y0)-(x1,y1), extended `up` pixels above (tall parts). */
  rect(x0: number, y0: number, x1: number, y1: number, up = 0): Rect {
    const a = rotateCell(this.item, x0, y0, this.view);
    const b = rotateCell(this.item, x1, y1, this.view);
    const minX = Math.min(a.dx, b.dx);
    const minY = Math.min(a.dy, b.dy);
    const maxX = Math.max(a.dx, b.dx);
    const maxY = Math.max(a.dy, b.dy);
    return { x: minX * 16, y: (this.item.lift + minY) * 16 - up, w: (maxX - minX + 1) * 16, h: (maxY - minY + 1) * 16 + up };
  }

  facing(f: Direction): Direction {
    return rotateFacing(f, this.view);
  }
}

interface DrawOp {
  depth: number;
  run: () => void;
}

/** Queues drawing so parts paint back to front regardless of their order in the item definition. */
export class Painter {
  private readonly ops: DrawOp[] = [];

  add(bottomY: number, run: () => void): void {
    this.ops.push({ depth: bottomY, run });
  }

  flush(): void {
    this.ops.sort((a, b) => a.depth - b.depth);
    for (const op of this.ops) op.run();
    this.ops.length = 0;
  }
}
