import { FX_KEYS, type Subject } from '@study/shared';
import { app } from '../app';
import { h } from './dom';

const ICON = 10;
const ICON_SCALE = 2;

/** A small canvas showing a subject's icon from the shared icon sheet. */
export function subjectIcon(subject: Subject): HTMLCanvasElement {
  const canvas = h('canvas', { class: 'subject-icon', attrs: { width: ICON * ICON_SCALE, height: ICON * ICON_SCALE } });
  const sheet = app.images(FX_KEYS.subjectIcons);
  const ctx = canvas.getContext('2d');
  if (sheet && ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, subject.icon * ICON, 0, ICON, ICON, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}
