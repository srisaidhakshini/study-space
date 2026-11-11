import { mix, PAL } from '../palette';
import { makeRng, PixelCanvas } from '../png';
import { addAutotile, speckle, type Tileset } from './tileset';

/** Colours of one room's walls. */
export interface WallStyle {
  upper: string;
  stripe: string;
  trim: string;
  trimDark: string;
  panel: string;
  panelHi: string;
  panelDark: string;
}

/** Cream walls over warm wood panelling. */
export const WARM_WALL: WallStyle = {
  upper: mix(PAL.paper, PAL.peach, 0.22),
  stripe: mix(PAL.paper, PAL.peach, 0.5),
  trim: PAL.wood,
  trimDark: PAL.bark,
  panel: PAL.wood,
  panelHi: PAL.tan,
  panelDark: PAL.bark,
};

/** Soft sage walls over pale panelling, for the common room. */
export const SAGE_WALL: WallStyle = {
  upper: mix(PAL.fog, PAL.leafLight, 0.3),
  stripe: mix(PAL.fog, PAL.leaf, 0.35),
  trim: PAL.tan,
  trimDark: PAL.wood,
  panel: mix(PAL.sand, PAL.leaf, 0.3),
  panelHi: mix(PAL.paper, PAL.leafLight, 0.3),
  panelDark: mix(PAL.wood, PAL.pine, 0.35),
};

export type Draw = (c: PixelCanvas) => void;

/** Wraps a painter so it is drawn mirrored left-to-right. */
export function mirrored(draw: Draw): Draw {
  return (c) => {
    const tmp = new PixelCanvas(c.width, c.height);
    draw(tmp);
    c.blit(tmp, 0, 0, true);
  };
}

// ---------------------------------------------------------------- walls

export function wallCap(c: PixelCanvas): void {
  c.rect(0, 0, 16, 16, PAL.cocoa);
  c.hline(0, 0, 16, PAL.bark);
  c.set(4, 6, PAL.bark);
  c.set(11, 11, PAL.bark);
}

export function wallUpper(c: PixelCanvas, s: WallStyle): void {
  c.rect(0, 0, 16, 16, s.upper);
  for (let x = 1; x < 16; x += 4) c.vline(x, 0, 16, s.stripe);
  c.hline(0, 0, 16, PAL.ink);
  c.hline(0, 1, 16, s.trim);
  c.hline(0, 2, 16, s.trimDark);
}

export function wallLower(c: PixelCanvas, s: WallStyle): void {
  c.rect(0, 0, 16, 16, s.upper);
  for (let x = 1; x < 16; x += 4) c.vline(x, 0, 16, s.stripe);
  c.rect(0, 5, 16, 9, s.panel);
  c.hline(0, 5, 16, s.panelHi);
  c.hline(0, 6, 16, s.panelDark);
  for (const x of [0, 8]) {
    c.frame(x + 1, 8, 6, 5, s.panelDark);
    c.hline(x + 2, 9, 4, s.panelHi);
  }
  c.rect(0, 14, 16, 2, PAL.cocoa);
}

export function windowUpper(c: PixelCanvas, s: WallStyle): void {
  wallUpper(c, s);
  c.rect(2, 4, 12, 12, PAL.bark);
  c.rect(3, 5, 10, 11, PAL.sky);
  c.rect(3, 5, 10, 3, PAL.cream);
  c.vline(7, 5, 11, PAL.bark);
  c.vline(8, 5, 11, PAL.bark);
  c.hline(3, 10, 10, PAL.bark);
}

export function windowSill(c: PixelCanvas, s: WallStyle): void {
  wallLower(c, s);
  c.rect(2, 0, 12, 3, PAL.bark);
  c.rect(3, 0, 10, 2, PAL.sky);
  c.vline(7, 0, 2, PAL.bark);
  c.vline(8, 0, 2, PAL.bark);
  c.rect(1, 3, 14, 2, PAL.tan);
  c.hline(1, 3, 14, PAL.sand);
}

/** Fills a multi-tile area with plain wall: upper wall on row 0, panelling below. */
export function wallBackdrop(c: PixelCanvas, s: WallStyle, columns: number, rows: number): void {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const tile = new PixelCanvas(16, 16);
      if (row === 0) wallUpper(tile, s);
      else wallLower(tile, s);
      c.blit(tile, col * 16, row * 16);
    }
  }
}

// --------------------------------------------------------------- floors

export function plankFloor(c: PixelCanvas, shift: number): void {
  const seam = mix(PAL.tan, PAL.wood, 0.55);
  c.rect(0, 0, 16, 16, PAL.tan);
  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    c.hline(0, y + 3, 16, seam);
    c.vline((row * 5 + shift) % 16, y, 3, seam);
    c.hline((row * 7 + shift + 3) % 12, y + 1, 3, mix(PAL.tan, PAL.sand, 0.6));
  }
}

/** One square of a checker floor with a soft grout line on two edges. */
export function checkerFloor(c: PixelCanvas, base: string, seed: number): void {
  c.rect(0, 0, 16, 16, base);
  speckle(c, makeRng(seed), 7, mix(base, PAL.cream, 0.5));
  speckle(c, makeRng(seed + 9), 5, mix(base, PAL.wood, 0.18));
  const grout = mix(base, PAL.wood, 0.28);
  c.hline(0, 15, 16, grout);
  c.vline(15, 0, 16, grout);
}

export function doorway(c: PixelCanvas): void {
  c.rect(0, 0, 16, 16, PAL.bark);
  c.rect(0, 0, 16, 3, PAL.tan);
  c.rect(0, 9, 16, 7, PAL.paper);
  c.hline(0, 8, 16, PAL.sand);
  c.hline(0, 3, 16, PAL.cocoa);
}

export function doormat(c: PixelCanvas): void {
  c.rect(1, 3, 14, 10, PAL.leafDark);
  c.frame(1, 3, 14, 10, PAL.pine);
  c.hline(4, 6, 8, PAL.leafLight);
  c.hline(4, 9, 8, PAL.leafLight);
}

/** Registers the standard shell tiles under the given style. */
export function addShell(set: Tileset, s: WallStyle): void {
  set.add('wall_cap', wallCap, { solid: true });
  set.add('wall_upper', (c) => wallUpper(c, s), { solid: true });
  set.add('wall_lower', (c) => wallLower(c, s), { solid: true });
  set.add('wall_window', (c) => windowUpper(c, s), { solid: true });
  set.add('wall_window_sill', (c) => windowSill(c, s), { solid: true });
  set.add('doorway', doorway);
  set.add('mat', doormat);
}

// -------------------------------------------------------------- seating

const slat = (c: PixelCanvas, xs: number[], y: number, h: number): void => {
  for (const x of xs) c.vline(x, y, h, PAL.bark);
};

/** A chair seen from the front: the sitter faces the camera. */
export function chairFront(c: PixelCanvas, cushion: string): void {
  c.rect(3, 1, 10, 7, PAL.wood);
  c.hline(3, 1, 10, PAL.tan);
  slat(c, [5, 8, 10], 3, 4);
  c.rect(3, 8, 10, 5, cushion);
  c.hline(3, 8, 10, mix(cushion, PAL.cream, 0.4));
  c.hline(3, 12, 10, mix(cushion, PAL.ink, 0.3));
  c.rect(3, 13, 2, 2, PAL.bark);
  c.rect(11, 13, 2, 2, PAL.bark);
  c.outline(PAL.ink);
}

/** A chair seen from behind: the sitter faces away. */
export function chairBack(c: PixelCanvas, cushion: string): void {
  c.rect(3, 4, 10, 4, cushion);
  c.hline(3, 4, 10, mix(cushion, PAL.cream, 0.4));
  c.rect(3, 6, 10, 7, PAL.wood);
  c.hline(3, 6, 10, PAL.tan);
  slat(c, [5, 8, 10], 8, 4);
  c.rect(3, 13, 2, 2, PAL.bark);
  c.rect(11, 13, 2, 2, PAL.bark);
  c.outline(PAL.ink);
}

/** A chair to the right of its table: the sitter faces left. */
export function chairFacingLeft(c: PixelCanvas, cushion: string): void {
  c.rect(11, 2, 3, 11, PAL.wood);
  c.vline(11, 2, 11, PAL.tan);
  c.rect(11, 3, 3, 3, cushion);
  c.rect(3, 8, 10, 4, cushion);
  c.hline(3, 8, 10, mix(cushion, PAL.cream, 0.4));
  c.hline(3, 11, 10, mix(cushion, PAL.ink, 0.3));
  c.rect(4, 12, 2, 3, PAL.bark);
  c.rect(11, 13, 2, 2, PAL.bark);
  c.outline(PAL.ink);
}

/** Registers `${prefix}_down`, `_up`, `_left` and `_right` chair tiles. */
export function addChairs(set: Tileset, prefix: string, cushion: string): void {
  set.add(`${prefix}_down`, (c) => chairFront(c, cushion), { solid: true });
  set.add(`${prefix}_up`, (c) => chairBack(c, cushion), { solid: true });
  set.add(`${prefix}_left`, (c) => chairFacingLeft(c, cushion), { solid: true });
  set.add(`${prefix}_right`, mirrored((c) => chairFacingLeft(c, cushion)), { solid: true });
}

// ------------------------------------------------------------ sofas

/** Upholstered tones for a piece of soft furniture. */
function upholstery(color: string): { hi: string; mid: string; dark: string } {
  return { hi: mix(color, PAL.cream, 0.35), mid: color, dark: mix(color, PAL.ink, 0.35) };
}

type Seg = 'l' | 'm' | 'r';

/** Backrest row of a sofa whose sitters face the camera. */
function sofaBackDown(c: PixelCanvas, seg: Seg, color: string): void {
  const u = upholstery(color);
  c.rect(0, 4, 16, 12, u.mid);
  c.hline(0, 4, 16, u.hi);
  c.hline(0, 5, 16, u.hi);
  c.vline(7, 6, 10, u.dark);
  c.vline(8, 6, 10, u.dark);
  if (seg === 'l') c.rect(0, 2, 4, 14, u.mid), c.vline(0, 2, 14, u.dark), c.hline(0, 2, 4, u.hi);
  if (seg === 'r') c.rect(12, 2, 4, 14, u.mid), c.vline(15, 2, 14, u.dark), c.hline(12, 2, 4, u.hi);
  c.outline(PAL.ink);
}

/** Seat row of a sofa whose sitters face the camera. */
function sofaSeatDown(c: PixelCanvas, seg: Seg, color: string): void {
  const u = upholstery(color);
  c.rect(0, 0, 16, 11, u.mid);
  c.rect(0, 0, 16, 6, u.hi);
  c.hline(0, 6, 16, u.dark);
  c.vline(7, 0, 6, u.mid);
  c.rect(0, 11, 16, 3, u.dark);
  c.rect(1, 14, 2, 2, PAL.bark);
  c.rect(13, 14, 2, 2, PAL.bark);
  if (seg === 'l') c.rect(0, 0, 3, 13, u.mid), c.hline(0, 0, 3, u.hi), c.vline(0, 0, 13, u.dark);
  if (seg === 'r') c.rect(13, 0, 3, 13, u.mid), c.hline(13, 0, 3, u.hi), c.vline(15, 0, 13, u.dark);
  c.outline(PAL.ink);
}

/** A sofa whose sitters face away from the camera, seen from behind. */
function sofaUp(c: PixelCanvas, seg: Seg, color: string): void {
  const u = upholstery(color);
  c.rect(0, 5, 16, 9, u.mid);
  c.hline(0, 5, 16, u.hi);
  c.hline(0, 6, 16, u.hi);
  c.vline(7, 7, 6, u.dark);
  c.vline(8, 7, 6, u.dark);
  c.hline(0, 13, 16, u.dark);
  c.rect(1, 14, 2, 1, PAL.bark);
  c.rect(13, 14, 2, 1, PAL.bark);
  if (seg === 'l') c.rect(0, 3, 3, 11, u.mid), c.hline(0, 3, 3, u.hi), c.vline(0, 3, 11, u.dark);
  if (seg === 'r') c.rect(13, 3, 3, 11, u.mid), c.hline(13, 3, 3, u.hi), c.vline(15, 3, 11, u.dark);
  c.outline(PAL.ink);
}

/**
 * Registers a three-piece sofa facing the camera: `${prefix}_back_{l,m,r}` goes
 * on the row above the seat row `${prefix}_seat_{l,m,r}`.
 */
export function addSofaDown(set: Tileset, prefix: string, color: string): void {
  for (const seg of ['l', 'm', 'r'] as const) {
    set.add(`${prefix}_back_${seg}`, (c) => sofaBackDown(c, seg, color), { solid: true });
    set.add(`${prefix}_seat_${seg}`, (c) => sofaSeatDown(c, seg, color), { solid: true });
  }
}

/** Registers `${prefix}_up_{l,m,r}`: a sofa seen from behind, sitters face up. */
export function addSofaUp(set: Tileset, prefix: string, color: string): void {
  for (const seg of ['l', 'm', 'r'] as const) {
    set.add(`${prefix}_up_${seg}`, (c) => sofaUp(c, seg, color), { solid: true });
  }
}

/** A single armchair seen from behind. */
export function addArmchairUp(set: Tileset, name: string, color: string): void {
  set.add(
    name,
    (c) => {
      const u = upholstery(color);
      c.rect(1, 4, 14, 10, u.mid);
      c.hline(1, 4, 14, u.hi);
      c.hline(1, 5, 14, u.hi);
      c.rect(0, 6, 3, 8, u.mid);
      c.rect(13, 6, 3, 8, u.mid);
      c.vline(7, 7, 6, u.dark);
      c.vline(8, 7, 6, u.dark);
      c.hline(1, 13, 14, u.dark);
      c.rect(2, 14, 2, 1, PAL.bark);
      c.rect(12, 14, 2, 1, PAL.bark);
      c.outline(PAL.ink);
    },
    { solid: true },
  );
}

/** A single armchair in side view; the sitter faces left, the back is on the right. */
function armchairFacingLeft(c: PixelCanvas, color: string): void {
  const u = upholstery(color);
  c.rect(10, 1, 5, 13, u.mid);
  c.vline(10, 1, 13, u.hi);
  c.hline(10, 1, 5, u.hi);
  c.rect(2, 8, 10, 6, u.mid);
  c.hline(2, 8, 10, u.hi);
  c.rect(2, 11, 10, 3, u.dark);
  c.rect(3, 6, 8, 2, u.mid);
  c.hline(3, 6, 8, u.hi);
  c.rect(3, 14, 2, 1, PAL.bark);
  c.rect(12, 14, 2, 1, PAL.bark);
  c.outline(PAL.ink);
}

export function addArmchairSides(set: Tileset, prefix: string, color: string): void {
  set.add(`${prefix}_left`, (c) => armchairFacingLeft(c, color), { solid: true });
  set.add(`${prefix}_right`, mirrored((c) => armchairFacingLeft(c, color)), { solid: true });
}

// ------------------------------------------------------- small pieces

/** Tall plant in a coral pot; registers `plant:0:0` and `plant:0:1`. */
export function addPlant(set: Tileset): void {
  set.addBlock(
    'plant',
    1,
    2,
    (c) => {
      c.rect(4, 23, 8, 7, PAL.coral);
      c.rect(3, 22, 10, 2, PAL.peach);
      c.hline(4, 29, 8, PAL.brick);
      c.ellipse(7.5, 15, 5.5, 7, PAL.pine);
      c.ellipse(5, 11, 3, 5, PAL.leafDark);
      c.ellipse(10.5, 12, 3, 5.5, PAL.leafDark);
      c.ellipse(7.5, 9, 2.5, 5, PAL.leaf);
      c.set(7, 6, PAL.leafLight);
      c.set(5, 9, PAL.leafLight);
      c.set(11, 10, PAL.leafLight);
      c.outline(PAL.ink);
    },
    (_x, row) => ({ solid: row === 1, sortOffset: 1 - row }),
  );
}

/** A little cup and saucer at (x, y), 4 px wide. */
export function cup(c: PixelCanvas, x: number, y: number, band: string = PAL.coral): void {
  c.rect(x, y, 3, 3, PAL.cream);
  c.hline(x, y + 1, 3, band);
  c.set(x + 3, y + 1, PAL.cream);
  c.hline(x - 1, y + 3, 5, PAL.fog);
}

/** A patterned rug as a 16-tile autotile registered under `${prefix}_0..15`. */
export function addRug(set: Tileset, prefix: string, base: string, accent: string): void {
  addAutotile(set, prefix, {
    fill: (c) => {
      c.rect(0, 0, 16, 16, base);
      for (let y = 3; y < 16; y += 8) for (let x = 3; x < 16; x += 8) c.set(x, y, accent);
      for (let y = 7; y < 16; y += 8) for (let x = 7; x < 16; x += 8) c.set(x, y, mix(base, PAL.ink, 0.25));
      c.set(7, 3, mix(base, PAL.cream, 0.5));
      c.set(3, 7, mix(base, PAL.cream, 0.5));
    },
    rim: PAL.gold,
    inset: 1,
    wobble: false,
  });
}

/** Wood surface used by counters, desks and tables. */
export function woodSurface(c: PixelCanvas, y: number, h: number): void {
  c.rect(0, y, 16, h, PAL.tan);
  c.hline(0, y, 16, PAL.sand);
  c.hline(2, y + 2, 5, mix(PAL.tan, PAL.sand, 0.5));
  c.hline(9, y + 4, 5, mix(PAL.tan, PAL.sand, 0.5));
}
