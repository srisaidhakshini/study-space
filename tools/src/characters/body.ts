import { MARK_PRIMARY, PAL } from '../palette';
import type { PixelCanvas } from '../png';
import { headShape, shadeUndersides, strokeArm, type Rig } from './rig';

export type LayerDraw = (c: PixelCanvas, rig: Rig) => void;

const [L, M, D] = MARK_PRIMARY;

/** Bare body in skin marker tones: legs, torso, head, face details, arms. */
export const drawBody: LayerDraw = (c, rig) => {
  for (const b of [...rig.thighs, ...rig.legs]) c.rect(b.x, b.y, b.w, b.h, L);
  const t = rig.torso;
  c.rect(t.x, t.y, t.w, t.h, L);
  headShape(c, rig, L);
  for (const arm of rig.arms) strokeArm(c, arm, 0, arm.length, L);
  shadeUndersides(c, MARK_PRIMARY);

  const { x: hx, y: hy } = rig.head;
  if (rig.view === 'down') {
    c.hline(hx + 9, hy + 16, 2, D);
    c.hline(hx + 2, hy + 14, 2, M);
    c.hline(hx + 16, hy + 14, 2, M);
  } else if (rig.view === 'side') {
    c.set(hx + 1, hy + 16, D);
    c.hline(hx + 3, hy + 14, 2, M);
    c.vline(hx + 11, hy + 10, 3, M);
  }

  if (rig.cup) {
    const { x, y } = rig.cup;
    c.rect(x, y, 3, 4, PAL.cream);
    c.hline(x, y, 3, PAL.wood);
    c.hline(x, y + 2, 3, PAL.coral);
  }
};

/** Eyes with a marker-coloured iris; nothing is drawn from behind. */
export const drawEyes: LayerDraw = (c, rig) => {
  if (rig.view === 'up') return;
  const { x: hx, y: hy } = rig.head;
  const ey = hy + 10;
  const eyes = rig.view === 'down' ? [hx + 4, hx + 13] : [hx + 2];
  const w = rig.view === 'down' ? 3 : 2;
  for (const ex of eyes) {
    if (rig.pose.eyesClosed) {
      c.hline(ex, ey + 2, w, PAL.ink);
      continue;
    }
    c.hline(ex, ey, w, PAL.ink);
    c.hline(ex, ey + 1, w, D);
    c.set(ex + w - 1, ey + 1, '#ffffff');
    c.hline(ex, ey + 2, w, M);
    c.hline(ex, ey + 3, w, L);
  }
};
