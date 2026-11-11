import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';

type RGBA = [number, number, number, number];

const colorCache = new Map<string, RGBA>();

/** Parses '#rrggbb' or '#rrggbbaa'. */
export function parseColor(hex: string): RGBA {
  let c = colorCache.get(hex);
  if (!c) {
    const n = hex.slice(1);
    c = [
      parseInt(n.slice(0, 2), 16),
      parseInt(n.slice(2, 4), 16),
      parseInt(n.slice(4, 6), 16),
      n.length >= 8 ? parseInt(n.slice(6, 8), 16) : 255,
    ];
    colorCache.set(hex, c);
  }
  return c;
}

export interface Pt {
  x: number;
  y: number;
}

/** A tiny RGBA bitmap with the handful of primitives pixel art needs. */
export class PixelCanvas {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  private inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Writes a pixel, replacing what was there. */
  set(x: number, y: number, color: string): void {
    if (!this.inside(x, y)) return;
    const [r, g, b, a] = parseColor(color);
    const i = (y * this.width + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }

  /** Alpha-blends a pixel over what was there. */
  blend(x: number, y: number, color: string): void {
    if (!this.inside(x, y)) return;
    const [r, g, b, a] = parseColor(color);
    const i = (y * this.width + x) * 4;
    const sa = a / 255;
    const da = this.data[i + 3]! / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    this.data[i] = (r * sa + this.data[i]! * da * (1 - sa)) / oa;
    this.data[i + 1] = (g * sa + this.data[i + 1]! * da * (1 - sa)) / oa;
    this.data[i + 2] = (b * sa + this.data[i + 2]! * da * (1 - sa)) / oa;
    this.data[i + 3] = oa * 255;
  }

  erase(x: number, y: number): void {
    if (!this.inside(x, y)) return;
    this.data.fill(0, (y * this.width + x) * 4, (y * this.width + x) * 4 + 4);
  }

  alpha(x: number, y: number): number {
    return this.inside(x, y) ? this.data[(y * this.width + x) * 4 + 3]! : 0;
  }

  /** Returns the pixel as '#rrggbb', or null if it is transparent. */
  get(x: number, y: number): string | null {
    if (this.alpha(x, y) === 0) return null;
    const i = (y * this.width + x) * 4;
    const h = (n: number): string => n.toString(16).padStart(2, '0');
    return `#${h(this.data[i]!)}${h(this.data[i + 1]!)}${h(this.data[i + 2]!)}`;
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, color);
  }

  eraseRect(x: number, y: number, w: number, h: number): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.erase(xx, yy);
  }

  hline(x: number, y: number, w: number, color: string): void {
    this.rect(x, y, w, 1, color);
  }

  vline(x: number, y: number, h: number, color: string): void {
    this.rect(x, y, 1, h, color);
  }

  /** Rectangle outline, one pixel thick. */
  frame(x: number, y: number, w: number, h: number, color: string): void {
    this.hline(x, y, w, color);
    this.hline(x, y + h - 1, w, color);
    this.vline(x, y, h, color);
    this.vline(x + w - 1, y, h, color);
  }

  /**
   * Rectangle with stepped corners. `top[i]` is how far row i is inset on
   * both sides, counted from the top edge; `bottom[i]` counts from the bottom.
   */
  roundRect(x: number, y: number, w: number, h: number, top: number[], bottom: number[], color: string | null): void {
    for (let row = 0; row < h; row++) {
      const inset = Math.max(top[row] ?? 0, bottom[h - 1 - row] ?? 0);
      for (let xx = x + inset; xx < x + w - inset; xx++) {
        if (color === null) this.erase(xx, y + row);
        else this.set(xx, y + row, color);
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, color);
      }
    }
  }

  /** Copies another canvas onto this one, skipping transparent pixels. */
  blit(src: PixelCanvas, dx: number, dy: number, flipX = false): void {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + (flipX ? src.width - 1 - x : x)) * 4;
        if (src.data[si + 3] === 0) continue;
        const tx = dx + x;
        const ty = dy + y;
        if (!this.inside(tx, ty)) continue;
        const ti = (ty * this.width + tx) * 4;
        this.data[ti] = src.data[si]!;
        this.data[ti + 1] = src.data[si + 1]!;
        this.data[ti + 2] = src.data[si + 2]!;
        this.data[ti + 3] = src.data[si + 3]!;
      }
    }
  }

  /** Cuts out a region as a new canvas. */
  crop(x: number, y: number, w: number, h: number): PixelCanvas {
    const out = new PixelCanvas(w, h);
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        if (!this.inside(x + xx, y + yy)) continue;
        const si = ((y + yy) * this.width + x + xx) * 4;
        out.data.set(this.data.subarray(si, si + 4), (yy * w + xx) * 4);
      }
    }
    return out;
  }

  /** Paints every transparent pixel that touches an opaque one (4-neighbours). */
  outline(color: string): void {
    const marks: Pt[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.alpha(x, y) !== 0) continue;
        if (
          this.alpha(x - 1, y) > 127 ||
          this.alpha(x + 1, y) > 127 ||
          this.alpha(x, y - 1) > 127 ||
          this.alpha(x, y + 1) > 127
        ) {
          marks.push({ x, y });
        }
      }
    }
    for (const m of marks) this.set(m.x, m.y, color);
  }

  /** Draws from rows of characters; `legend` maps a character to a colour. */
  pattern(x: number, y: number, rows: string[], legend: Record<string, string>): void {
    rows.forEach((row, ry) => {
      [...row].forEach((ch, rx) => {
        const color = legend[ch];
        if (color) this.set(x + rx, y + ry, color);
      });
    });
  }

  save(path: string): void {
    mkdirSync(dirname(path), { recursive: true });
    const png = new PNG({ width: this.width, height: this.height });
    png.data.set(this.data);
    writeFileSync(path, PNG.sync.write(png));
  }
}

/** Every integer point on the polyline through `pts` (Bresenham), in order. */
export function tracePolyline(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    let { x: x0, y: y0 } = pts[i]!;
    const { x: x1, y: y1 } = pts[i + 1]!;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      const last = out[out.length - 1];
      if (!last || last.x !== x0 || last.y !== y0) out.push({ x: x0, y: y0 });
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  return out;
}

/** Deterministic random numbers so generated art is identical on every run. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
