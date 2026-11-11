/** Large preview of a few items:  npx tsx src/furniture/zoom.ts desk_basic sofa */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFurniture } from '@study/shared';
import { PixelCanvas } from '../png';
import { renderFurniture } from './items';

const OUT = join(resolve(dirname(fileURLToPath(import.meta.url)), '../..'), 'preview');
const ids = process.argv.slice(2);
const SCALE = 6;
const views: PixelCanvas[] = [];
for (const id of ids) {
  const item = getFurniture(id);
  if (!item) throw new Error('unknown item ' + id);
  for (let v = 0; v < item.rotations; v++) views.push(renderFurniture(item, v));
}
const width = views.reduce((s, v) => s + v.width * SCALE + 16, 16);
const height = Math.max(...views.map((v) => v.height * SCALE)) + 32;
const sheet = new PixelCanvas(width, height);
sheet.rect(0, 0, width, height, '#7d7388');
let x = 16;
for (const v of views) {
  for (let py = 0; py < v.height; py++) for (let px = 0; px < v.width; px++) {
    const i = (py * v.width + px) * 4;
    if (v.data[i + 3] === 0) continue;
    const col = '#' + [0, 1, 2].map((k) => v.data[i + k]!.toString(16).padStart(2, '0')).join('');
    sheet.rect(x + px * SCALE, 16 + py * SCALE, SCALE, SCALE, col);
  }
  x += v.width * SCALE + 16;
}
sheet.save(join(OUT, 'zoom.png'));
console.log('wrote zoom.png', width, height);
