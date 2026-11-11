/**
 * Contact sheets for the furniture art:  npx tsx src/furniture/sheet.ts
 * Writes tools/preview/furniture.png (every item, every view) and surfaces.png
 * (each wallpaper and floor tiled 6x6).
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FURNITURE, SURFACES, footprint } from '@study/shared';
import { PixelCanvas } from '../png';
import { renderAllFurnitureImages } from './index';
import { renderSurface } from './surfaces';

const OUT = join(resolve(dirname(fileURLToPath(import.meta.url)), '../..'), 'preview');
const SCALE = 3;

function scaled(src: PixelCanvas, factor: number): PixelCanvas {
  const out = new PixelCanvas(src.width * factor, src.height * factor);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      if (src.data[i + 3] === 0) continue;
      const color = `#${[0, 1, 2, 3].map((k) => src.data[i + k]!.toString(16).padStart(2, '0')).join('')}`;
      for (let dy = 0; dy < factor; dy++) for (let dx = 0; dx < factor; dx++) out.blend(x * factor + dx, y * factor + dy, color);
    }
  }
  return out;
}

export function writeSheets(): void {
  const images = renderAllFurnitureImages();
  const byItem = new Map<string, PixelCanvas[]>();
  for (const img of images) if (img.itemId) (byItem.get(img.itemId) ?? byItem.set(img.itemId, []).get(img.itemId)!).push(img.canvas);

  // Background: oak floor tiles so rugs and shadows read as they will in a room.
  const floor = renderSurface('fl_oak');
  const wall = renderSurface('wp_cream');
  const maxW = 1700;
  type Cell = { id: string; views: PixelCanvas[]; w: number; h: number };
  const cells: Cell[] = FURNITURE.map((f) => {
    const views = byItem.get(f.id)!;
    const w = views.reduce((sum, v) => sum + v.width * SCALE + 8, 0);
    const h = Math.max(...views.map((v) => v.height * SCALE));
    return { id: f.id, views, w, h };
  });

  // Lay out in rows.
  const rows: Cell[][] = [[]];
  let rowW = 0;
  for (const cell of cells) {
    if (rowW + cell.w > maxW && rows[rows.length - 1]!.length > 0) {
      rows.push([]);
      rowW = 0;
    }
    rows[rows.length - 1]!.push(cell);
    rowW += cell.w + 14;
  }
  const rowHeights = rows.map((r) => Math.max(...r.map((c) => c.h)) + 18);
  const sheet = new PixelCanvas(maxW + 20, rowHeights.reduce((a, b) => a + b, 0) + 10);
  // Neutral backdrop, so oak furniture and rugs stay visible.
  sheet.rect(0, 0, sheet.width, sheet.height, '#7d7388');
  for (let y = 0; y < sheet.height; y += 16) for (let x = (y / 16) % 2 ? 16 : 0; x < sheet.width; x += 32) sheet.rect(x, y, 16, 16, '#857b91');
  void floor;
  void wall;
  const legend: string[] = [];
  let y = 8;
  rows.forEach((row, ri) => {
    let x = 10;
    for (const cell of row) {
      let vx = x;
      for (const v of cell.views) {
        const s = scaled(v, SCALE);
        sheet.blit(s, vx, y + (rowHeights[ri]! - 18 - s.height));
        vx += s.width + 8;
      }
      legend.push(`row ${ri + 1}  x=${x}: ${cell.id}`);
      x += cell.w + 14;
    }
    y += rowHeights[ri]!;
  });
  sheet.save(join(OUT, 'furniture.png'));
  console.log(legend.join('\n'));

  // Surfaces: each tiled 6x6, in a grid of two rows.
  const tiles = SURFACES.length;
  const per = 6;
  const sw = per * 16 * 2 + 8;
  const surf = new PixelCanvas(Math.ceil(tiles / 2) * sw + 8, 2 * (per * 16 * 2 + 8) + 8);
  SURFACES.forEach((s, i) => {
    const tile = renderSurface(s.id);
    const big = new PixelCanvas(per * 16, per * 16);
    for (let ty = 0; ty < per; ty++) for (let tx = 0; tx < per; tx++) big.blit(tile, tx * 16, ty * 16);
    const sc = scaled(big, 2);
    surf.blit(sc, 8 + (i % Math.ceil(tiles / 2)) * sw, 8 + Math.floor(i / Math.ceil(tiles / 2)) * (per * 16 * 2 + 8));
  });
  surf.save(join(OUT, 'surfaces.png'));
  console.log('surfaces (row-major): ' + SURFACES.map((s) => s.id).join(', '));
  void footprint;
}

if (process.argv[1] && process.argv[1].endsWith('sheet.ts')) writeSheets();
