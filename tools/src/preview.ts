/**
 * Writes enlarged contact sheets to tools/preview/ so generated art can be
 * checked without starting the game:  npm run preview -w tools
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAR_H, CHAR_W, randomAppearance, SHEET_COLUMNS, TILE, type Appearance, type CharacterManifest, type Ramp } from '@study/shared';
import { buildCharacterCatalog } from './characters/catalog';
import { renderLayerSheet } from './characters/sheets';
import { buildAllAreas } from './areas';
import type { MapBuilder } from './maps/builder';
import { PAL } from './palette';
import { makeRng, PixelCanvas } from './png';
import type { Tileset } from './tiles/tileset';

const OUT = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'preview');

function scale(src: PixelCanvas, factor: number, background: string): PixelCanvas {
  const out = new PixelCanvas(src.width * factor, src.height * factor);
  out.rect(0, 0, out.width, out.height, background);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const color = src.get(x, y);
      if (color && src.alpha(x, y) > 127) out.rect(x * factor, y * factor, factor, factor, color);
    }
  }
  return out;
}

const catalog = buildCharacterCatalog();
const rendered = new Map<string, PixelCanvas>();
const layerSheet = (key: string): PixelCanvas => {
  let sheet = rendered.get(key);
  if (!sheet) {
    sheet = renderLayerSheet(catalog.sheets.get(key)!);
    rendered.set(key, sheet);
  }
  return sheet;
};

function recolored(key: string, m: CharacterManifest, primary?: Ramp | null, secondary?: Ramp | null): PixelCanvas {
  const src = layerSheet(key);
  const out = new PixelCanvas(src.width, src.height);
  out.blit(src, 0, 0);
  const swaps = new Map<string, string>();
  if (primary) m.markers.primary.forEach((marker, i) => swaps.set(marker, primary[i]!));
  if (secondary) m.markers.secondary.forEach((marker, i) => swaps.set(marker, secondary[i]!));
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const to = swaps.get(out.get(x, y) ?? '');
      if (to) out.set(x, y, to);
    }
  }
  return out;
}

/** Mirrors the client compositor so previews match the game. */
function compose(m: CharacterManifest, a: Appearance): PixelCanvas {
  const find = <T extends { id: string }>(list: T[], id: string): T | undefined => list.find((v) => v.id === id);
  const hairRamp = find(m.hairColors, a.hairColor)?.ramp;
  const hair = find(m.hairStyles, a.hair);
  const out = new PixelCanvas(SHEET_COLUMNS * CHAR_W, 4 * CHAR_H);
  if (hair?.backSheet) out.blit(recolored(hair.backSheet, m, hairRamp), 0, 0);
  out.blit(recolored(m.bodySheet, m, find(m.skins, a.skin)?.ramp), 0, 0);
  for (const v of [find(m.shoes, a.shoes), find(m.bottoms, a.bottom), find(m.tops, a.top)]) {
    if (v?.sheet) out.blit(recolored(v.sheet, m, v.palette?.primary, v.palette?.secondary), 0, 0);
  }
  out.blit(recolored(m.eyesSheet, m, find(m.eyeColors, a.eyes)?.ramp), 0, 0);
  if (hair?.sheet) out.blit(recolored(hair.sheet, m, hairRamp), 0, 0);
  const acc = find(m.accessories, a.accessory);
  if (acc?.sheet) {
    out.blit(recolored(acc.sheet, m, acc.inherit ? hairRamp : acc.palette?.primary, acc.palette?.secondary), 0, 0);
  }
  if (m.outline) out.outline(m.outline);
  return out;
}

function renderMap(builder: MapBuilder, set: Tileset): PixelCanvas {
  const tiled = builder.toTiled('') as { layers: { name: string; data?: number[] }[] };
  const sheet = set.render();
  const out = new PixelCanvas(builder.width * TILE, builder.height * TILE);
  for (const layer of tiled.layers) {
    if (!layer.data || layer.name === 'collision') continue;
    layer.data.forEach((gid, i) => {
      if (gid === 0) return;
      const id = gid - 1;
      const tile = sheet.crop((id % 16) * TILE, Math.floor(id / 16) * TILE, TILE, TILE);
      out.blit(tile, (i % builder.width) * TILE, Math.floor(i / builder.width) * TILE);
    });
  }
  return out;
}

const m = catalog.manifest;
const rand = makeRng(9);

// One full sheet for the first hair style, to check every animation frame.
const base: Appearance = { ...randomAppearance(m, rand), hair: 'long', accessory: 'none', top: 'hoodie-moss' };
scale(compose(m, base), 3, PAL.leaf).save(join(OUT, 'character_sheet.png'));

// A line-up: every hair style and accessory, front / side / back.
const lineup = new PixelCanvas(CHAR_W * 9, CHAR_H * 6);
m.hairStyles.forEach((style, i) => {
  const look: Appearance = {
    ...randomAppearance(m, rand),
    hair: style.id,
    accessory: m.accessories[i % m.accessories.length]!.id,
  };
  const sheet = compose(m, look);
  [0, 1, 3].forEach((row, j) => lineup.blit(sheet.crop(0, row * CHAR_H, CHAR_W, CHAR_H), i * CHAR_W, j * CHAR_H));
  [7, 11, 16].forEach((col, j) => lineup.blit(sheet.crop(col * CHAR_W, 0, CHAR_W, CHAR_H), i * CHAR_W, (j + 3) * CHAR_H));
});
scale(lineup, 4, PAL.leaf).save(join(OUT, 'character_lineup.png'));

const seen = new Set<string>();
for (const def of buildAllAreas()) {
  if (!seen.has(def.tileset.name)) {
    seen.add(def.tileset.name);
    scale(def.tileset.render(), 3, PAL.ash).save(join(OUT, `tiles_${def.tileset.name}.png`));
  }
  scale(renderMap(def.map, def.tileset), 2, PAL.ink).save(join(OUT, `map_${def.id}.png`));
}
console.log(`Previews written to ${OUT}`);
