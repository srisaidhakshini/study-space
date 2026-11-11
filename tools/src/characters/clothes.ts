import { MARK_PRIMARY, MARK_SECONDARY, PAL } from '../palette';
import type { PixelCanvas } from '../png';
import type { LayerDraw } from './body';
import { HEAD_SIZE, headShape, shadeUndersides, strokeArm, type Box, type Rig } from './rig';

export type TopStyle = 'tee' | 'hoodie' | 'sailor' | 'blazer' | 'sweater';
export type BottomStyle = 'pants' | 'shorts' | 'skirt';
export type ShoeStyle = 'sneaker' | 'boot';

const [L, M, D] = MARK_PRIMARY;
const [SL, SM] = MARK_SECONDARY;

function topDetailsFront(c: PixelCanvas, style: TopStyle, t: Box): void {
  const cx = t.x + t.w / 2;
  switch (style) {
    case 'tee':
      c.hline(cx - 2, t.y, 4, SM);
      break;
    case 'hoodie':
      c.rect(t.x + 1, t.y, t.w - 2, 2, L);
      c.vline(cx - 2, t.y + 2, 2, SL);
      c.vline(cx + 1, t.y + 2, 2, SL);
      c.hline(cx - 3, t.y + 6, 6, D);
      break;
    case 'sailor':
      c.rect(t.x, t.y, 3, 2, SM);
      c.rect(t.x + t.w - 3, t.y, 3, 2, SM);
      c.rect(t.x + 1, t.y + 2, 3, 1, SM);
      c.rect(t.x + t.w - 4, t.y + 2, 3, 1, SM);
      c.rect(cx - 2, t.y + 3, 4, 1, SM);
      c.rect(cx - 1, t.y + 4, 2, 2, SL);
      break;
    case 'blazer':
      c.rect(cx - 2, t.y, 4, t.h, PAL.cream);
      c.rect(cx - 1, t.y + 1, 2, 5, SM);
      c.vline(cx - 3, t.y, 4, D);
      c.vline(cx + 2, t.y, 4, D);
      break;
    case 'sweater':
      c.hline(cx - 2, t.y, 4, SM);
      c.rect(t.x, t.y + 4, t.w, 2, SM);
      break;
  }
}

function topDetailsBack(c: PixelCanvas, style: TopStyle, t: Box): void {
  switch (style) {
    case 'hoodie':
      c.roundRect(t.x + 1, t.y - 1, t.w - 2, 6, [1], [2, 1], L);
      break;
    case 'sailor':
      c.rect(t.x, t.y, t.w, 4, SM);
      c.hline(t.x, t.y + 2, t.w, SL);
      break;
    case 'sweater':
      c.rect(t.x, t.y + 4, t.w, 2, SM);
      break;
    default:
      break;
  }
}

function topDetailsSide(c: PixelCanvas, style: TopStyle, t: Box): void {
  switch (style) {
    case 'hoodie':
      c.rect(t.x + t.w - 2, t.y - 1, 3, 4, L);
      break;
    case 'sailor':
      c.rect(t.x + 3, t.y, t.w - 3, 3, SM);
      break;
    case 'blazer':
      c.vline(t.x, t.y, t.h, PAL.cream);
      c.set(t.x, t.y + 2, SM);
      break;
    case 'sweater':
      c.rect(t.x, t.y + 4, t.w, 2, SM);
      break;
    default:
      break;
  }
}

/** Shirt layer: torso plus sleeves that follow the arms. */
export function topLayer(style: TopStyle): LayerDraw {
  const longSleeves = style === 'hoodie' || style === 'blazer' || style === 'sweater';
  return (c, rig: Rig) => {
    const t = rig.torso;
    c.rect(t.x, t.y, t.w, t.h, M);
    c.hline(t.x + 1, t.y, t.w - 2, L);
    if (rig.view !== 'side') {
      c.vline(t.x, t.y + 3, t.h - 3, D);
      c.vline(t.x + t.w - 1, t.y + 3, t.h - 3, D);
    }
    if (rig.view === 'down') topDetailsFront(c, style, t);
    else if (rig.view === 'up') topDetailsBack(c, style, t);
    else topDetailsSide(c, style, t);

    // A lowered head (nodding, sleeping) sits in front of the collar.
    if (rig.head.y + HEAD_SIZE > t.y) headShape(c, rig, null);

    const sleeve = rig.view === 'side' ? L : M;
    for (const arm of rig.arms) {
      const end = longSleeves ? arm.length - 2 : 3;
      strokeArm(c, arm, 0, end, sleeve);
      if (style === 'sweater' && end > 3) strokeArm(c, arm, end - 1, end, SM);
    }
    shadeUndersides(c, MARK_PRIMARY, MARK_SECONDARY);
  };
}

function skirt(c: PixelCanvas, rig: Rig): void {
  const t = rig.torso;
  if (rig.thighs.length > 0) {
    for (const th of rig.thighs) c.rect(th.x, th.y - 1, th.w + 1, th.h + 2, M);
    return;
  }
  const top = t.y + t.h - 3;
  const rows = rig.pose.seated ? 5 : 6;
  for (let i = 0; i < rows; i++) {
    const flare = i < 2 ? 0 : i < 4 ? 1 : 2;
    c.hline(t.x - flare, top + i, t.w + flare * 2, M);
    if (i >= rows - 3) {
      for (let x = t.x - flare + 1; x < t.x + t.w + flare; x += 3) c.set(x, top + i, D);
    }
  }
}

/** Legwear layer. */
export function bottomLayer(style: BottomStyle): LayerDraw {
  return (c, rig: Rig) => {
    if (style === 'skirt') {
      skirt(c, rig);
    } else {
      for (const th of rig.thighs) c.rect(th.x, th.y, th.w, th.h, M);
      for (const leg of rig.legs) {
        const h = style === 'shorts' ? Math.min(2, leg.h) : leg.h;
        c.rect(leg.x, leg.y, leg.w, h, M);
      }
      if (rig.view !== 'side') c.rect(15, rig.legs[0]!.y, 2, 1, M);
    }
    shadeUndersides(c, MARK_PRIMARY);
  };
}

/** Footwear layer. */
export function shoeLayer(style: ShoeStyle): LayerDraw {
  return (c, rig: Rig) => {
    rig.shoes.forEach((shoe, i) => {
      c.rect(shoe.x, shoe.y, shoe.w, shoe.h, M);
      c.hline(shoe.x + 1, shoe.y, 2, L);
      if (style === 'sneaker') c.hline(shoe.x, shoe.y + shoe.h - 1, shoe.w, PAL.cream);
      if (style === 'boot') {
        const leg = rig.legs[i];
        if (leg && leg.h >= 3) c.rect(leg.x, shoe.y - 2, leg.w, 2, M);
      }
    });
    shadeUndersides(c, MARK_PRIMARY);
  };
}
