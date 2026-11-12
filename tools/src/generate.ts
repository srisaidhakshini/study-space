import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FX_KEYS, PET_FRAME, TILE, type AssetManifest } from '@study/shared';
import { buildCharacterCatalog } from './characters/catalog';
import { renderLayerSheet } from './characters/sheets';
import { renderBubble, renderDust, renderGlow, renderLamp, renderMarker, renderShadow, renderSubjectIcons, renderZzz } from './fx';
import { buildAllAreas } from './areas';
import type { AreaDef } from './areas/types';
import { PETS, renderPetSheet } from './pets';
import { ALL_AUDIO, AREA_SOUNDS } from './audio/areaSounds';
import { renderAllFurnitureImages } from './furniture';
import { SR } from './audio/dsp';
import { writeWav } from './audio/wav';
import { PixelCanvas } from './png';
import { sharedTree } from './tiles/gardenTiles';
import type { Tileset } from './tiles/tileset';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'client/public/assets');
const OVERRIDES = join(ROOT, 'client/assets.overrides.json');

const manifest: AssetManifest = {
  version: 1,
  images: {},
  spritesheets: {},
  maps: {},
  audio: {},
  character: null as unknown as AssetManifest['character'],
  pets: [{ id: 'none', name: 'No pet', sheet: null }],
  start: { map: 'hub', spawn: 'start' },
};

function image(key: string, path: string, canvas: PixelCanvas): void {
  canvas.save(join(OUT, path));
  manifest.images[key] = path;
}

function sheet(key: string, path: string, canvas: PixelCanvas, frameWidth: number, frameHeight: number): void {
  canvas.save(join(OUT, path));
  manifest.spritesheets[key] = { path, frameWidth, frameHeight };
}

function tileset(set: Tileset): string {
  const key = `tiles_${set.name}`;
  sheet(key, `tiles/${set.name}.png`, set.render(), TILE, TILE);
  return key;
}

function area(def: AreaDef): void {
  const path = `maps/${def.id}.json`;
  mkdirSync(join(OUT, 'maps'), { recursive: true });
  writeFileSync(join(OUT, path), JSON.stringify(def.map.toTiled(`../tiles/${def.tileset.name}.png`)));
  manifest.maps[def.id] = {
    path,
    tilesets: { [def.tileset.name]: `tiles_${def.tileset.name}` },
    name: def.name,
    indoor: def.indoor,
    ambientTint: def.ambientTint,
    ...(AREA_SOUNDS[def.id]?.ambience ? { ambience: AREA_SOUNDS[def.id]!.ambience } : {}),
    ...(AREA_SOUNDS[def.id]?.music ? { music: AREA_SOUNDS[def.id]!.music } : {}),
  };
}

/** Deep-merges plain objects; arrays and scalars in `over` replace the base. */
function merge(base: unknown, over: unknown): unknown {
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!isObject(base) || !isObject(over)) return over;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) out[key] = key in base ? merge(base[key], value) : value;
  return out;
}

// Characters
const catalog = buildCharacterCatalog();
manifest.character = catalog.manifest;
for (const [key, painter] of catalog.sheets) image(key, `characters/${key}.png`, renderLayerSheet(painter));

// Pets
for (const pet of PETS) {
  const key = `pet_${pet.id}`;
  sheet(key, `pets/${pet.id}.png`, renderPetSheet(pet), PET_FRAME, PET_FRAME);
  manifest.pets.push({ id: pet.id, name: pet.name, sheet: key });
}

// Effects and small UI sprites
image(FX_KEYS.shadow, 'fx/shadow.png', renderShadow());
image(FX_KEYS.bubble, 'fx/bubble.png', renderBubble());
image(FX_KEYS.glow, 'fx/glow.png', renderGlow());
image(FX_KEYS.marker, 'fx/marker.png', renderMarker());
image(FX_KEYS.zzz, 'fx/zzz.png', renderZzz());
sheet(FX_KEYS.dust, 'fx/dust.png', renderDust(), 8, 8);
sheet(FX_KEYS.subjectIcons, 'fx/subject_icons.png', renderSubjectIcons(), 10, 10);
sheet(FX_KEYS.lamp, 'fx/lamp.png', renderLamp(), 16, 16);

const buddyTree = new PixelCanvas(6 * TILE, 6 * TILE);
sharedTree(buddyTree);
image('buddy_tree', 'fx/buddy_tree.png', buddyTree);

// Furniture, wallpapers, floors and the baseboard for player homes
for (const f of renderAllFurnitureImages()) image(f.key, f.path, f.canvas);

// Tilesets and maps
const written = new Set<string>();
for (const def of buildAllAreas()) {
  if (!written.has(def.tileset.name)) {
    written.add(def.tileset.name);
    tileset(def.tileset);
  }
  area(def);
}

// Audio: ambience loops and music, synthesised from scratch (see tools/src/audio).
const audioStart = Date.now();
let audioBytes = 0;
for (const [key, render] of Object.entries(ALL_AUDIO)) {
  const path = `audio/${key}.wav`;
  audioBytes += writeWav(join(OUT, path), render(), SR);
  manifest.audio[key] = path;
}
console.log(
  `Synthesised ${Object.keys(ALL_AUDIO).length} sounds (${(audioBytes / 1024 / 1024).toFixed(1)} MB) in ${((Date.now() - audioStart) / 1000).toFixed(1)}s`,
);

// Manifest, with the user's replacements applied on top.
let output: unknown = manifest;
if (existsSync(OVERRIDES)) {
  output = merge(manifest, JSON.parse(readFileSync(OVERRIDES, 'utf8')));
  console.log('Applied client/assets.overrides.json');
}
writeFileSync(join(OUT, 'assets.json'), JSON.stringify(output, null, 2));

const count = Object.keys(manifest.images).length + Object.keys(manifest.spritesheets).length;
console.log(`Generated ${count} sheets and ${Object.keys(manifest.maps).length} maps in client/public/assets`);
