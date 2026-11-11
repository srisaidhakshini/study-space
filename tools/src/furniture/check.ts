/**
 * Validates the generated furniture and surface images against the catalog:
 *   npm run check:furniture -w tools      (run `npm run assets` first)
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { FURNITURE, SURFACES, footprint, furnitureImageKey, surfaceImageKey, type AssetManifest } from '@study/shared';

const ASSETS = join(resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), 'client/public/assets');
const manifest = JSON.parse(readFileSync(join(ASSETS, 'assets.json'), 'utf8')) as AssetManifest;

const problems: string[] = [];
const fail = (message: string): number => problems.push(message);

function load(key: string): PNG | null {
  const path = manifest.images[key];
  if (!path) {
    fail(`missing manifest image "${key}"`);
    return null;
  }
  try {
    return PNG.sync.read(readFileSync(join(ASSETS, path)));
  } catch {
    fail(`cannot read "${path}"`);
    return null;
  }
}

const alphaAt = (png: PNG, x: number, y: number): number => png.data[(y * png.width + x) * 4 + 3]!;
const rgbAt = (png: PNG, x: number, y: number): [number, number, number] => {
  const i = (y * png.width + x) * 4;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
};
const dist = (a: [number, number, number], b: [number, number, number]): number =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

const rows: string[] = [];
const perCategory = new Map<string, { items: number; images: number }>();

for (const item of FURNITURE) {
  const stat = perCategory.get(item.category) ?? { items: 0, images: 0 };
  stat.items += 1;
  for (let view = 0; view < item.rotations; view++) {
    const key = furnitureImageKey(item.id, view);
    const png = load(key);
    if (!png) continue;
    stat.images += 1;
    const fp = footprint(item, view);
    const w = fp.w * 16;
    const h = (fp.h + item.lift) * 16;
    if (png.width !== w || png.height !== h) fail(`${key}: is ${png.width}x${png.height}, expected ${w}x${h}`);
    let opaque = 0;
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) if (alphaAt(png, x, y) > 0) opaque += 1;
    if (opaque < png.width * 3) fail(`${key}: nearly empty (${opaque} opaque pixels)`);
    let bottom = 0;
    for (let x = 0; x < png.width; x++) if (alphaAt(png, x, png.height - 1) > 0) bottom += 1;
    if (bottom === 0) fail(`${key}: nothing touches the bottom row, so it would float above its footprint`);
    let top = 0;
    for (let x = 0; x < png.width; x++) if (alphaAt(png, x, 0) > 0) top += 1;
    // Tall pieces must actually use the extra height they declare.
    if (item.lift > 0 && view % 2 === 0 && item.category !== 'seating') {
      let rowsUsed = 0;
      for (let y = 0; y < item.lift * 16; y++) {
        for (let x = 0; x < png.width; x++) if (alphaAt(png, x, y) > 0) {
          rowsUsed += 1;
          break;
        }
      }
      if (rowsUsed < 4) fail(`${key}: declares lift ${item.lift} but the picture does not rise above its footprint`);
    }
    rows.push(`${key.padEnd(24)} ${String(png.width).padStart(3)}x${String(png.height).padEnd(3)} opaque ${String(opaque).padStart(4)}`);
  }
  perCategory.set(item.category, stat);
}

for (const surface of SURFACES) {
  const key = surfaceImageKey(surface.id);
  const png = load(key);
  if (!png) continue;
  if (png.width !== 16 || png.height !== 16) {
    fail(`${key}: is ${png.width}x${png.height}, expected 16x16`);
    continue;
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (alphaAt(png, x, y) !== 255) fail(`${key}: has a transparent pixel at ${x},${y}`);
  // Seams: the jump across the wrap should be no bigger than the biggest jump inside the tile.
  let insideX = 0;
  let wrapX = 0;
  let insideY = 0;
  let wrapY = 0;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 15; x++) insideX = Math.max(insideX, dist(rgbAt(png, x, y), rgbAt(png, x + 1, y)));
    wrapX = Math.max(wrapX, dist(rgbAt(png, 15, y), rgbAt(png, 0, y)));
  }
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 15; y++) insideY = Math.max(insideY, dist(rgbAt(png, x, y), rgbAt(png, x, y + 1)));
    wrapY = Math.max(wrapY, dist(rgbAt(png, x, 15), rgbAt(png, x, 0)));
  }
  if (wrapX > insideX + 10) fail(`${key}: visible horizontal seam (wrap jump ${wrapX}, largest inner jump ${insideX})`);
  if (wrapY > insideY + 10) fail(`${key}: visible vertical seam (wrap jump ${wrapY}, largest inner jump ${insideY})`);
  rows.push(`${key.padEnd(24)} 16x16  seams ok (x ${wrapX}/${insideX}, y ${wrapY}/${insideY})`);
}

const base = load('home_baseboard');
if (base && (base.width !== 16 || base.height !== 16)) fail('home_baseboard: expected 16x16');

console.log(rows.join('\n'));
console.log('\nCategory       items  images');
for (const [category, stat] of perCategory) console.log(`${category.padEnd(14)} ${String(stat.items).padStart(5)}  ${String(stat.images).padStart(6)}`);
console.log(`\n${FURNITURE.length} items, ${SURFACES.length} surfaces`);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('All furniture and surfaces match the catalog.');
