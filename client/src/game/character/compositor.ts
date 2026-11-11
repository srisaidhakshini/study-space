import type { Appearance, CharacterManifest, LayerVariant, Ramp } from '@study/shared';

export type ImageLookup = (key: string) => CanvasImageSource | null;

interface Layer {
  sheet: string;
  primary?: Ramp | null;
  secondary?: Ramp | null;
}

const rgbKey = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function find<T extends { id: string }>(list: T[], id: string): T | undefined {
  return list.find((v) => v.id === id);
}

/** The ordered stack of sheets (back to front) that make up an appearance. */
function layersFor(m: CharacterManifest, a: Appearance): Layer[] {
  const hairRamp = find(m.hairColors, a.hairColor)?.ramp ?? null;
  const hair = find(m.hairStyles, a.hair);
  const layers: Layer[] = [];
  const pushVariant = (v: LayerVariant | undefined): void => {
    if (!v?.sheet) return;
    layers.push({
      sheet: v.sheet,
      primary: v.inherit === 'hairColor' ? hairRamp : v.palette?.primary,
      secondary: v.palette?.secondary,
    });
  };

  if (hair?.backSheet) layers.push({ sheet: hair.backSheet, primary: hairRamp });
  layers.push({ sheet: m.bodySheet, primary: find(m.skins, a.skin)?.ramp });
  pushVariant(find(m.shoes, a.shoes));
  pushVariant(find(m.bottoms, a.bottom));
  pushVariant(find(m.tops, a.top));
  layers.push({ sheet: m.eyesSheet, primary: find(m.eyeColors, a.eyes)?.ramp });
  if (hair?.sheet) layers.push({ sheet: hair.sheet, primary: hairRamp });
  pushVariant(find(m.accessories, a.accessory));
  return layers;
}

/** Replaces marker colours with the layer's ramps, in place. */
function recolor(data: Uint8ClampedArray, m: CharacterManifest, layer: Layer): void {
  const swaps = new Map<number, [number, number, number]>();
  const add = (markers: Ramp, ramp: Ramp | null | undefined): void => {
    if (!ramp) return;
    markers.forEach((marker, i) => swaps.set(rgbKey(...hexToRgb(marker)), hexToRgb(ramp[i]!)));
  };
  add(m.markers.primary, layer.primary);
  add(m.markers.secondary, layer.secondary);
  if (swaps.size === 0) return;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const to = swaps.get(rgbKey(data[i]!, data[i + 1]!, data[i + 2]!));
    if (to) {
      data[i] = to[0];
      data[i + 1] = to[1];
      data[i + 2] = to[2];
    }
  }
}

/** Draws a dark line around the silhouette of every frame. */
function outline(data: Uint8ClampedArray, width: number, height: number, color: string): void {
  const [r, g, b] = hexToRgb(color);
  const solid = new Uint8Array(width * height);
  for (let i = 0; i < solid.length; i++) solid[i] = data[i * 4 + 3]! > 127 ? 1 : 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (solid[i]) continue;
      const touches =
        (x > 0 && solid[i - 1]) ||
        (x < width - 1 && solid[i + 1]) ||
        (y > 0 && solid[i - width]) ||
        (y < height - 1 && solid[i + width]);
      if (!touches) continue;
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
    }
  }
}

/**
 * Composites every layer of an appearance into one sheet with the standard
 * frame layout. Pure canvas code: used by both the game and the creator.
 */
export function composeCharacter(m: CharacterManifest, appearance: Appearance, images: ImageLookup): HTMLCanvasElement {
  const width = m.frameWidth * m.columns;
  const height = m.frameHeight * m.rows;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d', { willReadFrequently: true })!;

  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  const sctx = scratch.getContext('2d', { willReadFrequently: true })!;

  for (const layer of layersFor(m, appearance)) {
    const image = images(layer.sheet);
    if (!image) continue;
    sctx.clearRect(0, 0, width, height);
    sctx.drawImage(image, 0, 0);
    const pixels = sctx.getImageData(0, 0, width, height);
    recolor(pixels.data, m, layer);
    sctx.putImageData(pixels, 0, 0);
    ctx.drawImage(scratch, 0, 0);
  }

  if (m.outline) {
    const pixels = ctx.getImageData(0, 0, width, height);
    outline(pixels.data, width, height, m.outline);
    ctx.putImageData(pixels, 0, 0);
  }
  return out;
}
