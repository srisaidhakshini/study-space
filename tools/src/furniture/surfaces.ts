import { mix, PAL } from '../palette';
import { makeRng, PixelCanvas } from '../png';

/** Seamless 16x16 wallpaper and floor tiles, drawn with periodic patterns so they repeat cleanly. */

const speckles = (c: PixelCanvas, seed: number, count: number, color: string): void => {
  const rand = makeRng(seed);
  for (let i = 0; i < count; i++) c.set(Math.floor(rand() * 16), Math.floor(rand() * 16), color);
};

function planks(c: PixelCanvas, base: string, seam: string, light: string, dark: string, seed: number): void {
  c.rect(0, 0, 16, 16, base);
  const rand = makeRng(seed);
  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    // Slight tone shift per plank row.
    const tone = row % 2 === 0 ? light : base;
    c.rect(0, y, 16, 3, tone);
    c.hline(0, y + 3, 16, seam);
    // Staggered end joints.
    const joint = (row * 7 + 3) % 16;
    c.vline(joint, y, 3, seam);
    // Grain: short darker dashes.
    for (let i = 0; i < 3; i++) {
      const gx = Math.floor(rand() * 16);
      c.set(gx, y + 1, dark);
      c.set((gx + 1) % 16, y + 1, dark);
    }
  }
}

const paint: Record<string, (c: PixelCanvas) => void> = {
  wp_cream: (c) => {
    c.rect(0, 0, 16, 16, '#f3e4c0');
    for (let x = 1; x < 16; x += 4) c.vline(x, 0, 16, mix('#f3e4c0', PAL.peach, 0.22));
    speckles(c, 3, 8, mix('#f3e4c0', PAL.sand, 0.5));
  },
  wp_sage: (c) => {
    c.rect(0, 0, 16, 16, '#b9c99a');
    for (let x = 0; x < 16; x += 8) c.rect(x, 0, 4, 16, '#c8d6ad');
    for (let x = 4; x < 16; x += 8) c.vline(x, 0, 16, '#a3b585');
    speckles(c, 5, 6, '#c8d6ad');
  },
  wp_blush: (c) => {
    c.rect(0, 0, 16, 16, '#ebbdb8');
    for (const [x, y] of [[3, 3], [11, 11]] as const) {
      c.set(x, y, PAL.cream);
      c.set(x - 1, y, '#f7dcd2');
      c.set(x + 1, y, '#f7dcd2');
      c.set(x, y - 1, '#f7dcd2');
      c.set(x, y + 1, '#f7dcd2');
    }
    speckles(c, 7, 5, '#dca6a2');
  },
  wp_sky: (c) => {
    c.rect(0, 0, 16, 16, '#a8c9d6');
    c.rect(3, 4, 7, 2, '#e8f1f2');
    c.rect(5, 3, 3, 1, '#e8f1f2');
    c.rect(10, 11, 5, 2, '#d6e6ea');
    c.rect(0, 11, 2, 2, '#d6e6ea');
    c.rect(11, 10, 3, 1, '#d6e6ea');
    speckles(c, 9, 4, '#94b8c6');
  },
  wp_navy: (c) => {
    c.rect(0, 0, 16, 16, '#4a5a86');
    for (const [x, y] of [[4, 4], [12, 12]] as const) {
      c.rect(x, y, 2, 2, '#c9cfe6');
      c.set(x, y, '#ffffff');
    }
    for (const [x, y] of [[12, 4], [4, 12]] as const) c.set(x, y, '#7f8db8');
    speckles(c, 11, 5, '#40507a');
  },
  wp_wood: (c) => {
    c.rect(0, 0, 16, 16, '#a07a58');
    for (let x = 0; x < 16; x += 8) {
      c.rect(x, 0, 7, 16, '#aa8460');
      c.vline(x + 7, 0, 16, '#6e4a43');
      c.vline(x, 0, 16, '#b9946c');
      c.vline(x + 3, 2, 5, '#946f4f');
      c.vline(x + 5, 8, 6, '#946f4f');
    }
  },
  fl_oak: (c) => planks(c, '#c8975f', '#8a5f3c', '#d3a56c', '#a97a48', 21),
  fl_dark: (c) => planks(c, '#73503e', '#4a2f3a', '#7e5a46', '#5e3f31', 22),
  fl_checker: (c) => {
    c.rect(0, 0, 16, 16, '#e3d6bd');
    c.rect(0, 0, 8, 8, '#b88f5e');
    c.rect(8, 8, 8, 8, '#b88f5e');
    c.hline(0, 0, 8, '#c9a276');
    c.hline(8, 8, 8, '#c9a276');
    c.hline(8, 0, 8, '#f0e6d0');
    c.hline(0, 8, 8, '#f0e6d0');
  },
  fl_grey: (c) => {
    c.rect(0, 0, 16, 16, '#9a98a2');
    for (let y = 0; y < 16; y += 2) {
      for (let x = (y / 2) % 2; x < 16; x += 2) c.set(x, y, '#a7a5af');
    }
    speckles(c, 13, 10, '#8a8892');
  },
  fl_tile: (c) => {
    c.rect(0, 0, 16, 16, '#ddd9d2');
    c.hline(0, 0, 16, '#b6b0a8');
    c.hline(0, 8, 16, '#b6b0a8');
    c.vline(0, 0, 16, '#b6b0a8');
    c.vline(8, 0, 16, '#b6b0a8');
    for (const [x, y] of [[1, 1], [9, 1], [1, 9], [9, 9]] as const) c.rect(x, y, 3, 1, '#f0ede7');
  },
  fl_stone: (c) => {
    c.rect(0, 0, 16, 16, '#8f8a82');
    const seam = '#5f5a55';
    c.hline(0, 0, 16, seam);
    c.hline(0, 8, 16, seam);
    c.vline(5, 0, 8, seam);
    c.vline(13, 8, 8, seam);
    c.rect(1, 1, 3, 2, '#a39e95');
    c.rect(7, 2, 4, 2, '#9b968d');
    c.rect(1, 10, 5, 2, '#9b968d');
    c.rect(9, 9, 3, 2, '#a39e95');
    speckles(c, 17, 6, '#7b766e');
  },
};

export function renderSurface(id: string): PixelCanvas {
  const painter = paint[id];
  if (!painter) throw new Error(`No painter for surface "${id}"`);
  const c = new PixelCanvas(16, 16);
  painter(c);
  return c;
}

/** Skirting board drawn along the bottom of the back wall (transparent above). */
export function renderBaseboard(): PixelCanvas {
  const c = new PixelCanvas(16, 16);
  c.rect(0, 11, 16, 5, '#a8794f');
  c.hline(0, 11, 16, '#d3a574');
  c.hline(0, 12, 16, '#be8d5f');
  c.hline(0, 15, 16, '#6e4a43');
  c.hline(0, 14, 16, '#8a5f3c');
  // Soft shadow where the wall meets the board.
  c.hline(0, 10, 16, '#00000026');
  return c;
}
