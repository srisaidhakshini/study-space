import { mix, PAL, withAlpha } from '../palette';
import { PixelCanvas } from '../png';
import type { Tileset } from './tileset';

/** Colours of one portal: the swirl ramp (dark to light), stone frame and runes. */
export interface PortalStyle {
  /** Swirl colours, darkest first. */
  ramp: string[];
  /** Stone frame: light, mid, dark. */
  stone: [string, string, string];
  /** Keystone and rune colour. */
  accent: string;
}

const wrap = (n: number, len: number): number => ((n % len) + len) % len;

/** Fills an ellipse with a spiral that winds into a bright centre. */
function swirl(c: PixelCanvas, cx: number, cy: number, rx: number, ry: number, ramp: string[], clip: PixelCanvas): void {
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (clip.alpha(x, y) === 0) continue;
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const r = Math.hypot(dx, dy);
      const theta = Math.atan2(dy, dx);
      const v = (theta / (Math.PI * 2)) * 3 + r * 2.4 + 12;
      let idx = wrap(Math.floor(v * 2), ramp.length * 2);
      idx = idx >= ramp.length ? ramp.length * 2 - 1 - idx : idx;
      let color = ramp[idx]!;
      if (r < 0.16) color = ramp[ramp.length - 1]!;
      else if (r > 0.88) color = ramp[Math.max(0, idx - 1)]!;
      c.set(x, y, color);
    }
  }
}

/**
 * Registers a standing portal arch of `cols` x 3 tiles as `${name}` (solid, sorts
 * as one piece) and its glowing floor plate as `${name}_pad` (`cols` x 1, walkable).
 */
export function addPortal(set: Tileset, name: string, cols: number, style: PortalStyle): void {
  const W = cols * 16;
  const H = 48;
  const [stoneL, stoneM, stoneD] = style.stone;
  set.addBlock(
    name,
    cols,
    3,
    (c) => {
      const frame = new PixelCanvas(W, H);
      frame.roundRect(1, 1, W - 2, H - 1, [10, 6, 4, 3, 2, 1, 1], [], stoneM);
      const inner = 10;
      const opening = new PixelCanvas(W, H);
      opening.roundRect(inner, 11, W - inner * 2, H - 11, [9, 6, 4, 3, 2, 2, 1, 1], [], '#ffffff');

      // Stone ring with bevel and brick seams.
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (frame.alpha(x, y) === 0 || opening.alpha(x, y) !== 0) continue;
          let color = stoneM;
          if (frame.alpha(x, y - 1) === 0 || frame.alpha(x - 1, y) === 0) color = stoneL;
          else if (opening.alpha(x, y + 1) !== 0 || opening.alpha(x + 1, y) !== 0 || frame.alpha(x + 1, y) === 0) color = stoneD;
          else if (y % 6 === 5 || (x + Math.floor(y / 6) * 5) % 10 === 0) color = mix(stoneM, stoneD, 0.55);
          c.set(x, y, color);
        }
      }
      // Dark well behind the swirl, then the swirl itself.
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (opening.alpha(x, y) !== 0) c.set(x, y, style.ramp[0]!);
      swirl(c, W / 2, 31, (W - inner * 2) / 2, 19, style.ramp, opening);
      // Light falling inside the arch.
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (opening.alpha(x, y) === 0) continue;
          if (opening.alpha(x - 1, y) === 0 || opening.alpha(x, y - 1) === 0) c.set(x, y, mix(c.get(x, y) ?? style.ramp[0]!, '#000000', 0.35));
        }
      }
      // Keystone and runes.
      c.rect(W / 2 - 4, 1, 8, 9, style.accent);
      c.frame(W / 2 - 4, 1, 8, 9, PAL.ink);
      c.hline(W / 2 - 2, 4, 4, mix(style.accent, PAL.ink, 0.4));
      c.vline(W / 2, 2, 7, mix(style.accent, PAL.ink, 0.4));
      for (const y of [22, 30, 38]) {
        c.pattern(3, y, ['x.x', '.x.', 'x.x'], { x: style.accent });
        c.pattern(W - 6, y, ['x.x', '.x.', 'x.x'], { x: style.accent });
      }
      c.outline(PAL.ink);
    },
    (_x, row) => ({ solid: true, sortOffset: 2 - row }),
  );

  set.addBlock(
    `${name}_pad`,
    cols,
    1,
    (c) => {
      c.ellipse(W / 2, 8, W / 2 - 1, 7, stoneD);
      c.ellipse(W / 2, 7.5, W / 2 - 2, 6.5, stoneM);
      c.ellipse(W / 2, 8, W / 2 - 5, 5, style.ramp[1]!);
      c.ellipse(W / 2, 8, W / 2 - 9, 3.5, style.ramp[style.ramp.length - 2]!);
      c.ellipse(W / 2, 8, W / 2 - 15, 2, style.ramp[style.ramp.length - 1]!);
      for (let x = 6; x < W - 6; x += 8) c.set(x, 14, style.accent);
      c.outline(PAL.ink);
    },
    () => ({}),
  );
}

/** A faceted crystal standing on (cx, baseY). */
export function crystal(c: PixelCanvas, cx: number, baseY: number, h: number, maxW: number, ramp: [string, string, string]): void {
  const [l, m, d] = ramp;
  const widest = Math.floor(h * 0.4);
  for (let i = 0; i < h; i++) {
    const half = i <= widest ? 1 + Math.round(((maxW / 2 - 1) * i) / Math.max(1, widest)) : Math.max(1, Math.round((maxW / 2) * (1 - (i - widest) / (h - widest))));
    const y = baseY - h + 1 + i;
    for (let x = -half; x < half; x++) c.set(cx + x, y, x < -half / 3 ? l : x < half / 3 ? m : d);
  }
  c.vline(cx - 1, baseY - h + 3, Math.max(2, h - 6), '#ffffff');
}

/** A soft round glow, for lamps and portals. */
export function glow(c: PixelCanvas, cx: number, cy: number, radius: number, color: string, strength = 0.5): void {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      if (d < 1) c.blend(x, y, withAlpha(color, (1 - d) ** 2 * strength));
    }
  }
}
