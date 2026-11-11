import { CHAR_H, CHAR_W, DIRECTIONS, SHEET_COLUMNS, SHEET_ROWS } from '@study/shared';
import { PixelCanvas } from '../png';
import type { LayerDraw } from './body';
import { buildColumnPoses } from './poses';
import { buildRig, type View } from './rig';

const POSES = buildColumnPoses();

/** Renders one layer across every animation frame and direction. */
export function renderLayerSheet(draw: LayerDraw): PixelCanvas {
  const sheet = new PixelCanvas(SHEET_COLUMNS * CHAR_W, SHEET_ROWS * CHAR_H);
  DIRECTIONS.forEach((direction, row) => {
    const view: View = direction === 'down' ? 'down' : direction === 'up' ? 'up' : 'side';
    POSES.forEach((pose, column) => {
      const cell = new PixelCanvas(CHAR_W, CHAR_H);
      draw(cell, buildRig(view, pose));
      sheet.blit(cell, column * CHAR_W, row * CHAR_H, direction === 'right');
    });
  });
  return sheet;
}
