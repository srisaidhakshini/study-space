import { FURNITURE, SURFACES, furnitureImageKey, surfaceImageKey, type FurnitureItem } from '@study/shared';
import type { PixelCanvas } from '../png';
import { renderFurniture } from './items';
import { renderBaseboard, renderSurface } from './surfaces';

export const BASEBOARD_KEY = 'home_baseboard';

export interface FurnitureImage {
  key: string;
  path: string;
  canvas: PixelCanvas;
  itemId: string | null;
  view: number;
}

/** Every furniture view, surface tile and the baseboard, with their manifest keys and output paths. */
export function renderAllFurnitureImages(): FurnitureImage[] {
  const out: FurnitureImage[] = [];
  for (const item of FURNITURE) {
    for (let view = 0; view < item.rotations; view++) {
      const key = furnitureImageKey(item.id, view);
      out.push({ key, path: `furniture/${key}.png`, canvas: renderFurniture(item, view), itemId: item.id, view });
    }
  }
  for (const surface of SURFACES) {
    const key = surfaceImageKey(surface.id);
    out.push({ key, path: `furniture/${key}.png`, canvas: renderSurface(surface.id), itemId: null, view: 0 });
  }
  out.push({ key: BASEBOARD_KEY, path: `furniture/${BASEBOARD_KEY}.png`, canvas: renderBaseboard(), itemId: null, view: 0 });
  return out;
}

export type { FurnitureItem };
