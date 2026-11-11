import { mix, PAL } from '../palette';
import { makeRng, type PixelCanvas } from '../png';

/** Plain grass, the same look as the town's ground, for tile edges to sit on. */
export function grassFill(c: PixelCanvas, seed = 11): void {
  const rand = makeRng(seed);
  c.rect(0, 0, c.width, c.height, PAL.leaf);
  for (let i = 0; i < (c.width * c.height) / 28; i++) {
    c.set(Math.floor(rand() * c.width), Math.floor(rand() * c.height), PAL.leafLight);
    c.set(Math.floor(rand() * c.width), Math.floor(rand() * c.height), PAL.leafDark);
  }
}

/** A round blob of foliage: layered ellipses with a lit upper-left. */
export function foliage(c: PixelCanvas, cx: number, cy: number, rx: number, ry: number, tones: readonly string[]): void {
  tones.forEach((tone, i) => {
    const shrink = 1 - i * 0.2;
    c.ellipse(cx - i * (rx * 0.06), cy - i * (ry * 0.07), rx * shrink, ry * shrink, tone);
  });
}

/** Darkens or lightens scattered pixels of known leaf tones for a leafy texture. */
export function leafTexture(c: PixelCanvas, rand: () => number, count: number): void {
  const darker: Record<string, string> = {
    [PAL.leafLight]: PAL.leaf,
    [PAL.leaf]: PAL.leafDark,
    [PAL.leafDark]: PAL.pine,
    [PAL.pine]: PAL.moss,
  };
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * c.width);
    const y = Math.floor(rand() * c.height);
    const here = c.get(x, y);
    const to = here ? darker[here] : undefined;
    if (to) c.set(x, y, to);
  }
}

/** Soil colour for flower beds. */
export const SOIL = mix(PAL.bark, PAL.wood, 0.35);

