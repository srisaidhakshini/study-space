import type { Direction } from '@study/shared';
import { PAL, mix } from '../palette';
import { makeRng, type PixelCanvas } from '../png';
import { BOOK_COLOURS, drawBox, insetRect, opposite, type Cloth, type Rect, type Wood } from './kit';

/** Painters for furniture parts. `p` is the area a part may use; callers keep one pixel free for the outline. */

// ---- Things that sit on tabletops -------------------------------------------------

export function tabletopProps(c: PixelCanvas, top: Rect, kind: 'books' | 'laptop' | 'mug' | 'lamp' | 'none'): void {
  const cx = top.x + 2;
  const cy = top.y + Math.max(1, top.h - 6);
  if (kind === 'books') {
    c.rect(cx, cy, 6, 4, PAL.deep);
    c.hline(cx, cy, 6, '#7a96c8');
    c.rect(cx + 7, cy + 1, 5, 3, PAL.cream);
    c.hline(cx + 8, cy + 2, 3, PAL.slate);
  } else if (kind === 'laptop') {
    c.rect(cx, cy, 8, 4, PAL.ash);
    c.rect(cx + 1, cy + 1, 6, 2, PAL.sky);
    c.hline(cx - 1, cy + 4, 10, PAL.slate);
  } else if (kind === 'mug') {
    c.rect(cx + 1, cy, 3, 3, PAL.cream);
    c.hline(cx + 1, cy, 3, PAL.coral);
    c.set(cx + 4, cy + 1, PAL.cream);
  } else if (kind === 'lamp') {
    c.rect(cx + 2, cy, 4, 2, PAL.gold);
    c.set(cx + 3, cy + 2, PAL.ash);
    c.rect(cx + 1, cy + 3, 6, 1, PAL.ash);
  }
}

// ---- Desks, drawers and chairs ----------------------------------------------------

export function drawDesk(c: PixelCanvas, p: Rect, wood: Wood, props: Array<'books' | 'laptop' | 'mug' | 'lamp'>): void {
  const faceH = Math.min(8, p.h - 4);
  const { top, face } = drawBox(c, p, faceH, wood);
  // Apron and two legs on the front face.
  c.hline(face.x + 1, face.y + 1, face.w - 2, wood.light);
  c.rect(face.x + 1, face.y + 2, 2, face.h - 2, wood.dark);
  c.rect(face.x + face.w - 3, face.y + 2, 2, face.h - 2, wood.dark);
  let offset = 0;
  for (const prop of props) {
    tabletopProps(c, { ...top, x: top.x + offset }, prop);
    offset += Math.max(8, Math.floor(top.w / (props.length + 1)));
  }
}

export function drawDrawer(c: PixelCanvas, cell: Rect, facing: Direction, wood: Wood): void {
  const p = insetRect(cell, 1, 3, 1, 1);
  const { face } = drawBox(c, p, 9, wood);
  if (facing === 'down') {
    for (const dy of [1, 5]) {
      c.frame(face.x + 1, face.y + dy, face.w - 2, 3, wood.dark);
      c.set(face.x + Math.floor(face.w / 2), face.y + dy + 1, PAL.gold);
    }
  } else {
    c.hline(face.x + 2, face.y + 4, face.w - 4, wood.dark);
  }
}

export function drawChair(c: PixelCanvas, cell: Rect, facing: Direction, wood: Wood, cushion: Cloth): void {
  const { x, y } = cell;
  const legs = (): void => {
    c.rect(x + 3, y + 12, 2, 3, wood.dark);
    c.rect(x + 11, y + 12, 2, 3, wood.dark);
  };
  if (facing === 'up') {
    // We see its back: slatted backrest rising above the seat.
    legs();
    c.rect(x + 3, y + 3, 10, 9, wood.mid);
    c.hline(x + 3, y + 3, 10, wood.hi);
    c.vline(x + 5, y + 4, 7, wood.dark);
    c.vline(x + 8, y + 4, 7, wood.dark);
    c.vline(x + 10, y + 4, 7, wood.dark);
    c.hline(x + 3, y + 11, 10, wood.dark);
  } else if (facing === 'down') {
    // We see the front: cushion in front, backrest behind it.
    c.rect(x + 3, y + 1, 10, 5, wood.mid);
    c.hline(x + 3, y + 1, 10, wood.hi);
    legs();
    c.rect(x + 2, y + 6, 12, 6, cushion.light);
    c.hline(x + 2, y + 6, 12, cushion.hi);
    c.hline(x + 2, y + 11, 12, cushion.dark);
  } else {
    const back = facing === 'left' ? x + 10 : x + 3;
    legs();
    c.rect(back, y + 2, 3, 10, wood.mid);
    c.vline(back, y + 2, 10, wood.hi);
    c.rect(facing === 'left' ? x + 3 : x + 6, y + 7, 7, 5, cushion.light);
    c.hline(facing === 'left' ? x + 3 : x + 6, y + 7, 7, cushion.hi);
  }
}

// ---- Beds ---------------------------------------------------------------------------

export function drawBed(c: PixelCanvas, p: Rect, facing: Direction, frame: Wood, quilt: Cloth, pillows: number): void {
  const faceH = 8;
  const { top, face } = drawBox(c, p, faceH, frame);
  // Mattress sheet inside the frame.
  const m = insetRect(top, 2, 2, 2, 1);
  c.rect(m.x, m.y, m.w, m.h, PAL.cream);
  const head = opposite(facing);
  const vertical = head === 'up' || head === 'down';
  const long = vertical ? m.h : m.w;
  const blanket = Math.floor(long * 0.62);
  // Blanket from the foot end.
  const b: Rect = (() => {
    if (head === 'up') return { x: m.x, y: m.y + m.h - blanket, w: m.w, h: blanket };
    if (head === 'down') return { x: m.x, y: m.y, w: m.w, h: blanket };
    if (head === 'left') return { x: m.x + m.w - blanket, y: m.y, w: blanket, h: m.h };
    return { x: m.x, y: m.y, w: blanket, h: m.h };
  })();
  c.rect(b.x, b.y, b.w, b.h, quilt.light);
  // Quilt stitching and fold.
  if (vertical) {
    for (let yy = b.y + 3; yy < b.y + b.h; yy += 4) c.hline(b.x, yy, b.w, quilt.mid);
    c.hline(b.x, head === 'up' ? b.y : b.y + b.h - 1, b.w, quilt.hi);
  } else {
    for (let xx = b.x + 3; xx < b.x + b.w; xx += 4) c.vline(xx, b.y, b.h, quilt.mid);
    c.vline(head === 'left' ? b.x : b.x + b.w - 1, b.y, b.h, quilt.hi);
  }
  // Pillows at the head.
  const pw = vertical ? Math.floor((m.w - 1) / pillows) - 1 : 5;
  const ph = vertical ? 5 : Math.floor((m.h - 1) / pillows) - 1;
  for (let i = 0; i < pillows; i++) {
    const px = vertical ? m.x + 1 + i * (pw + 1) : head === 'left' ? m.x + 1 : m.x + m.w - pw - 1;
    const py = vertical ? (head === 'up' ? m.y + 1 : m.y + m.h - ph - 1) : m.y + 1 + i * (ph + 1);
    c.rect(px, py, pw, ph, PAL.fog);
    c.hline(px, py, pw, '#ffffff');
    c.hline(px, py + ph - 1, pw, PAL.stone);
  }
  // Headboard.
  if (head === 'up') c.rect(p.x, p.y, p.w, 2, frame.dark);
  else if (head === 'down') {
    c.rect(p.x, face.y - 3, p.w, face.h + 3, frame.mid);
    c.hline(p.x, face.y - 3, p.w, frame.hi);
    c.hline(p.x, face.y + face.h - 1, p.w, frame.dark);
  } else if (head === 'left') c.rect(p.x, p.y, 2, top.h + face.h, frame.dark);
  else c.rect(p.x + p.w - 2, p.y, 2, top.h + face.h, frame.dark);
}

// ---- Sofas and armchairs ------------------------------------------------------------

export function drawSofa(c: PixelCanvas, p: Rect, facing: Direction, cells: number, fabric: Cloth, wood: Wood): void {
  const horizontal = facing === 'down' || facing === 'up';
  const base: Rect = { ...p, y: p.y + p.h - 3, h: 3 };
  c.rect(base.x + 1, base.y, base.w - 2, base.h, wood.dark);
  const body = { ...p, h: p.h - 2 };
  if (horizontal) {
    c.rect(body.x, body.y, body.w, body.h, fabric.mid);
    c.hline(body.x, body.y, body.w, fabric.hi);
    // Arms at the ends.
    c.rect(body.x, body.y + 4, 3, body.h - 4, fabric.dark);
    c.rect(body.x + body.w - 3, body.y + 4, 3, body.h - 4, fabric.dark);
    c.hline(body.x, body.y + 4, 3, fabric.mid);
    c.hline(body.x + body.w - 3, body.y + 4, 3, fabric.mid);
    if (facing === 'down') {
      const seatTop = body.y + Math.floor(body.h * 0.5);
      for (let i = 0; i < cells; i++) {
        const sx = body.x + 3 + i * Math.floor((body.w - 6) / cells);
        const sw = Math.floor((body.w - 6) / cells);
        c.rect(sx + 1, seatTop, sw - 1, body.h - (seatTop - body.y) - 1, fabric.light);
        c.hline(sx + 1, seatTop, sw - 1, fabric.hi);
        c.hline(sx + 1, body.y + body.h - 1, sw - 1, fabric.dark);
        c.rect(sx + 1, body.y + 2, sw - 1, seatTop - body.y - 2, fabric.mid);
        c.hline(sx + 1, body.y + 2, sw - 1, fabric.light);
      }
    } else {
      // Back view: one tall back panel with seams.
      c.rect(body.x + 3, body.y + 2, body.w - 6, body.h - 3, fabric.light);
      for (let i = 1; i < cells; i++) c.vline(body.x + 3 + Math.floor(((body.w - 6) * i) / cells), body.y + 3, body.h - 5, fabric.mid);
      c.hline(body.x + 3, body.y + 2, body.w - 6, fabric.hi);
    }
  } else {
    // Seen from the side: cushions stacked along the length, backrest on one side.
    c.rect(body.x, body.y, body.w, body.h, fabric.mid);
    c.hline(body.x, body.y, body.w, fabric.hi);
    const backLeft = facing === 'right';
    const bx = backLeft ? body.x : body.x + body.w - 5;
    const sx = backLeft ? body.x + 5 : body.x;
    const sw = body.w - 5;
    c.rect(bx, body.y + 1, 5, body.h - 2, fabric.dark);
    c.vline(backLeft ? bx + 5 : bx - 1, body.y + 1, body.h - 2, fabric.light);
    const seatH = Math.floor((body.h - 8) / cells);
    for (let i = 0; i < cells; i++) {
      const sy = body.y + 4 + i * seatH;
      c.rect(sx, sy, sw, seatH - 1, fabric.light);
      c.hline(sx, sy, sw, fabric.hi);
    }
    c.rect(body.x, body.y, body.w, 3, fabric.dark);
    c.rect(body.x, body.y + body.h - 3, body.w, 3, fabric.dark);
  }
}

export function drawArmchair(c: PixelCanvas, p: Rect, facing: Direction, fabric: Cloth, wood: Wood): void {
  // Short legs, then a rounded body with a high back and arms.
  c.rect(p.x + 2, p.y + p.h - 3, 2, 3, wood.dark);
  c.rect(p.x + p.w - 4, p.y + p.h - 3, 2, 3, wood.dark);
  const body: Rect = { x: p.x, y: p.y, w: p.w, h: p.h - 2 };
  if (facing === 'down') {
    c.roundRect(body.x, body.y, body.w, 12, [2, 1], [], fabric.mid);
    c.hline(body.x + 2, body.y, body.w - 4, fabric.hi);
    c.rect(body.x, body.y + 8, 3, body.h - 8, fabric.dark);
    c.rect(body.x + body.w - 3, body.y + 8, 3, body.h - 8, fabric.dark);
    c.rect(body.x + 3, body.y + 14, body.w - 6, body.h - 14, fabric.light);
    c.hline(body.x + 3, body.y + 14, body.w - 6, fabric.hi);
    c.hline(body.x + 3, body.y + body.h - 1, body.w - 6, fabric.dark);
    c.rect(body.x + 3, body.y + 5, body.w - 6, 8, fabric.light);
  } else if (facing === 'up') {
    c.roundRect(body.x, body.y, body.w, body.h, [2, 1], [], fabric.mid);
    c.hline(body.x + 2, body.y, body.w - 4, fabric.hi);
    c.rect(body.x + 3, body.y + 4, body.w - 6, body.h - 6, fabric.light);
    c.hline(body.x + 3, body.y + 4, body.w - 6, fabric.hi);
    c.hline(body.x + 3, body.y + 14, body.w - 6, fabric.mid);
  } else {
    const backX = facing === 'left' ? body.x + body.w - 6 : body.x;
    c.roundRect(backX, body.y, 6, body.h, [2], [], fabric.mid);
    c.vline(facing === 'left' ? backX : backX + 5, body.y + 1, body.h - 2, fabric.hi);
    const seatX = facing === 'left' ? body.x : body.x + 6;
    c.rect(seatX, body.y + 14, body.w - 6, body.h - 14, fabric.light);
    c.hline(seatX, body.y + 14, body.w - 6, fabric.hi);
    c.rect(seatX, body.y + 9, body.w - 6, 5, fabric.dark);
  }
}

// ---- Storage: shelves, cabinets ------------------------------------------------------

export function drawShelf(c: PixelCanvas, p: Rect, faceH: number, facing: Direction, wood: Wood, seed: number): void {
  const { top, face } = drawBox(c, p, faceH, wood);
  const rng = makeRng(seed);
  if (facing === 'down') {
    const cavity = insetRect(face, 1, 1, 2, 1);
    c.rect(cavity.x, cavity.y, cavity.w, cavity.h, wood.dark);
    const rows = Math.max(1, Math.floor(cavity.h / 9));
    const rowH = Math.floor(cavity.h / rows);
    for (let r = 0; r < rows; r++) {
      const ry = cavity.y + r * rowH;
      let bx = cavity.x + 1;
      while (bx < cavity.x + cavity.w - 2) {
        const bw = 2 + Math.floor(rng() * 2);
        const bh = rowH - 3 - Math.floor(rng() * 3);
        if (rng() < 0.12) {
          bx += 2;
          continue;
        }
        const col = BOOK_COLOURS[Math.floor(rng() * BOOK_COLOURS.length)]!;
        c.rect(bx, ry + rowH - 1 - bh - 1, bw, bh, col);
        c.set(bx, ry + rowH - 1 - bh - 1, mix(col, PAL.cream, 0.5));
        bx += bw;
      }
      c.hline(cavity.x, ry + rowH - 2, cavity.w, wood.mid);
      c.hline(cavity.x, ry + rowH - 1, cavity.w, wood.dark);
    }
  } else if (facing === 'up') {
    c.hline(face.x + 2, face.y + Math.floor(face.h / 2), face.w - 4, wood.dark);
    c.vline(face.x + Math.floor(face.w / 2), face.y + 2, face.h - 4, wood.dark);
  } else {
    // Side view: show the book spines along the open side on the top face.
    const sx = facing === 'left' ? top.x + 1 : top.x + top.w - 5;
    for (let yy = top.y + 1; yy < top.y + top.h - 1; yy += 2) {
      const col = BOOK_COLOURS[Math.floor(rng() * BOOK_COLOURS.length)]!;
      c.rect(sx, yy, 4, 2, col);
    }
    c.hline(face.x + 2, face.y + 3, face.w - 4, wood.dark);
  }
}

export function drawCabinet(
  c: PixelCanvas,
  p: Rect,
  faceH: number,
  facing: Direction,
  wood: Wood,
  kind: 'dresser' | 'wardrobe',
): void {
  const { top, face } = drawBox(c, p, faceH, wood);
  if (facing === 'down') {
    if (kind === 'dresser') {
      const rows = 3;
      const rowH = Math.floor((face.h - 3) / rows);
      for (let r = 0; r < rows; r++) {
        const ry = face.y + 2 + r * rowH;
        c.frame(face.x + 2, ry, face.w - 4, rowH - 1, wood.dark);
        c.hline(face.x + 3, ry + 1, face.w - 6, wood.light);
        c.rect(face.x + Math.floor(face.w / 2) - 1, ry + Math.floor(rowH / 2) - 1, 2, 1, PAL.gold);
      }
      // A little vase on top.
      c.rect(top.x + 3, top.y + Math.max(1, top.h - 4), 3, 3, PAL.water);
      c.set(top.x + 4, top.y + Math.max(1, top.h - 5), PAL.leaf);
    } else {
      c.rect(face.x + 1, face.y + 1, face.w - 2, 2, wood.light);
      const mid = face.x + Math.floor(face.w / 2);
      c.vline(mid, face.y + 3, face.h - 5, wood.dark);
      c.frame(face.x + 2, face.y + 4, mid - face.x - 2, face.h - 7, wood.dark);
      c.frame(mid + 1, face.y + 4, face.x + face.w - mid - 3, face.h - 7, wood.dark);
      c.set(mid - 2, face.y + Math.floor(face.h / 2), PAL.gold);
      c.set(mid + 2, face.y + Math.floor(face.h / 2), PAL.gold);
    }
  } else {
    c.hline(face.x + 2, face.y + 3, face.w - 4, wood.dark);
    c.vline(face.x + 2, face.y + 3, face.h - 6, wood.dark);
    c.vline(face.x + face.w - 4, face.y + 3, face.h - 6, wood.dark);
  }
}

export function drawTvStand(c: PixelCanvas, p: Rect, facing: Direction, wood: Wood): void {
  // The stand is the lower part of the picture; the TV rises above it.
  const standH = 14;
  const stand: Rect = { x: p.x, y: p.y + p.h - standH, w: p.w, h: standH };
  const { top, face } = drawBox(c, stand, 8, wood);
  if (facing === 'down') {
    c.frame(face.x + 2, face.y + 2, 5, face.h - 3, wood.dark);
    c.frame(face.x + face.w - 8, face.y + 2, 5, face.h - 3, wood.dark);
  } else {
    c.hline(face.x + 2, face.y + 3, face.w - 4, wood.dark);
  }
  const tv: Rect = { x: p.x + 4, y: p.y, w: p.w - 8, h: p.h - standH + 3 };
  c.rect(tv.x, tv.y, tv.w, tv.h, PAL.ash);
  if (facing === 'down') {
    c.rect(tv.x + 1, tv.y + 1, tv.w - 2, tv.h - 3, '#4f7fa0');
    c.hline(tv.x + 2, tv.y + 2, 4, '#9fd0e6');
    c.set(tv.x + tv.w - 3, tv.y + tv.h - 3, PAL.gold);
  } else {
    c.rect(tv.x + 1, tv.y + 1, tv.w - 2, tv.h - 3, '#4a4650');
  }
  c.rect(tv.x + Math.floor(tv.w / 2) - 2, tv.y + tv.h - 1, 4, 2, PAL.ash);
  void top;
}

// ---- Tables, plants, beanbag ----------------------------------------------------------

export function drawRoundTable(c: PixelCanvas, w: number, h: number, wood: Wood): void {
  const cx = w / 2;
  c.ellipse(cx, h - 7, w / 2 - 3, 7, wood.dark);
  c.rect(cx - 4, h - 14, 8, 8, wood.mid);
  c.ellipse(cx, h / 2 - 3, w / 2 - 3, h / 2 - 7, wood.light);
  c.ellipse(cx - 1, h / 2 - 4, w / 2 - 6, h / 2 - 10, wood.hi);
  // Teapot and cup on top.
  c.rect(cx - 4, h / 2 - 6, 5, 3, PAL.cream);
  c.hline(cx - 4, h / 2 - 7, 5, PAL.coral);
  c.set(cx + 1, h / 2 - 5, PAL.cream);
  c.rect(cx + 3, h / 2 - 4, 3, 2, PAL.cream);
}

export function drawPot(c: PixelCanvas, x: number, y: number, w: number, h: number): void {
  c.rect(x + 1, y, w - 2, h, '#c4684a');
  c.hline(x, y, w, '#e0876a');
  c.hline(x + 1, y + h - 1, w - 2, '#8a4634');
  c.rect(x + 1, y + 1, w - 2, 1, '#5a3a2a');
}

export function drawLeaf(c: PixelCanvas, x: number, y: number, len: number, lean: number): void {
  for (let i = 0; i < len; i++) {
    const px = x + Math.round((lean * i) / len);
    c.set(px, y - i, i % 3 === 0 ? PAL.leafLight : PAL.leaf);
    c.set(px + 1, y - i, PAL.leafDark);
    if (i > 1 && i < len - 1) c.set(px - 1, y - i, PAL.leaf);
  }
}

export function drawBeanbag(c: PixelCanvas, cloth_: Cloth): void {
  c.ellipse(8, 9, 6.5, 5.5, cloth_.dark);
  c.ellipse(8, 8, 6, 5, cloth_.mid);
  c.ellipse(7, 6.5, 3.5, 2.5, cloth_.light);
  c.set(5, 5, cloth_.hi);
  c.set(6, 4, cloth_.hi);
}

// ---- Flat things -------------------------------------------------------------------------

export function drawRug(c: PixelCanvas, w: number, h: number, shape: 'rect' | 'round', base: Cloth, accent: string): void {
  const inner = (inset: number): Rect => ({ x: inset, y: inset, w: w - inset * 2, h: h - inset * 2 });
  if (shape === 'round') {
    const rx = w / 2;
    const ry = h / 2;
    c.ellipse(rx - 0.5, ry - 0.5, rx, ry, base.dark);
    c.ellipse(rx - 0.5, ry - 0.5, rx - 1.5, ry - 1.5, base.mid);
    c.ellipse(rx - 0.5, ry - 0.5, rx - 4, ry - 4, base.light);
    c.ellipse(rx - 0.5, ry - 0.5, rx - 6, ry - 6, accent);
    c.ellipse(rx - 0.5, ry - 0.5, rx - 8.5, ry - 8.5, base.mid);
    return;
  }
  const r0 = inner(0);
  c.roundRect(r0.x, r0.y, r0.w, r0.h, [1], [1], base.dark);
  const r1 = inner(1);
  c.rect(r1.x, r1.y, r1.w, r1.h, base.mid);
  const r2 = inner(3);
  c.rect(r2.x, r2.y, r2.w, r2.h, base.light);
  c.frame(r2.x, r2.y, r2.w, r2.h, accent);
  const r3 = inner(5);
  if (r3.w > 2 && r3.h > 2) {
    for (let y = r3.y; y < r3.y + r3.h; y += 2) {
      for (let x = r3.x + ((y / 2) % 2); x < r3.x + r3.w; x += 2) c.set(x, y, base.mid);
    }
  }
  // Fringe on the short ends.
  const longX = w >= h;
  for (let i = 1; i < (longX ? h : w) - 1; i += 2) {
    if (longX) {
      c.set(0, i, base.hi);
      c.set(w - 1, i, base.hi);
    } else {
      c.set(i, 0, base.hi);
      c.set(i, h - 1, base.hi);
    }
  }
}

// ---- Wall pieces ------------------------------------------------------------------------

export function drawFrame(c: PixelCanvas, w: number, h: number, wood: Wood): Rect {
  c.rect(1, 1, w - 2, h - 2, wood.mid);
  c.hline(1, 1, w - 2, wood.hi);
  c.hline(1, h - 2, w - 2, wood.dark);
  c.vline(w - 2, 1, h - 2, wood.dark);
  const inner = { x: 3, y: 3, w: w - 6, h: h - 6 };
  return inner;
}

export function drawWindow(c: PixelCanvas, w: number, h: number): void {
  const frame = { hi: '#fffaf0', light: PAL.cream, mid: '#ddd2c4', dark: '#a89c92' };
  c.rect(1, 1, w - 2, h - 2, frame.mid);
  c.hline(1, 1, w - 2, frame.hi);
  const glass: Rect = { x: 3, y: 3, w: w - 6, h: h - 8 };
  for (let y = 0; y < glass.h; y++) {
    c.hline(glass.x, glass.y + y, glass.w, mix('#7fb4d8', '#d6ecf4', y / glass.h));
  }
  // Clouds and a distant hill.
  c.rect(glass.x + 2, glass.y + 2, Math.min(6, glass.w - 4), 2, '#ffffff');
  c.rect(glass.x + 3, glass.y + 1, Math.min(3, glass.w - 6), 1, '#ffffff');
  for (let x = 0; x < glass.w; x++) {
    const hh = 2 + Math.round(Math.sin(x / 2.4) * 1.2);
    c.rect(glass.x + x, glass.y + glass.h - hh, 1, hh, '#9bc27d');
  }
  // Mullions.
  const midX = glass.x + Math.floor(glass.w / 2);
  if (w >= 24) c.vline(midX, glass.y, glass.h, frame.mid);
  if (h >= 32) c.hline(glass.x, glass.y + Math.floor(glass.h / 2), glass.w, frame.mid);
  // Sill.
  c.rect(0, h - 4, w, 3, frame.light);
  c.hline(0, h - 4, w, frame.hi);
  c.hline(0, h - 2, w, frame.dark);
  c.frame(glass.x - 1, glass.y - 1, glass.w + 2, glass.h + 2, frame.dark);
}

export function drawClock(c: PixelCanvas): void {
  c.ellipse(7.5, 7.5, 6.95, 6.95, PAL.wood);
  c.ellipse(7.5, 7.5, 5.7, 5.7, PAL.cream);
  c.vline(7, 4, 4, PAL.ink);
  c.hline(8, 8, 3, PAL.brick);
  for (const [x, y] of [[7, 2], [7, 13], [2, 7], [12, 7]] as const) c.set(x, y, PAL.slate);
}

export function drawWallLamp(c: PixelCanvas): void {
  c.rect(6, 11, 4, 3, PAL.ash);
  c.hline(4, 14, 8, PAL.slate);
  c.roundRect(3, 3, 10, 8, [2, 1], [], PAL.gold);
  c.hline(4, 3, 8, PAL.glow);
  c.rect(5, 5, 6, 4, PAL.glow);
  c.hline(3, 10, 10, PAL.amber);
}

export function drawFloorLamp(c: PixelCanvas): void {
  c.rect(7, 12, 2, 18, PAL.ash);
  c.vline(7, 12, 18, PAL.slate);
  c.rect(4, 28, 8, 3, PAL.ash);
  c.hline(4, 28, 8, PAL.slate);
  c.roundRect(3, 3, 10, 10, [3, 1], [], PAL.gold);
  c.rect(5, 5, 6, 6, PAL.glow);
  c.hline(4, 3, 8, PAL.glow);
  c.hline(3, 12, 10, PAL.amber);
}
