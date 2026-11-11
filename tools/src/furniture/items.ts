import { footprint, type FurnitureItem } from '@study/shared';
import { PAL, mix } from '../palette';
import { PixelCanvas } from '../png';
import { CLOTHS, WOODS, Painter, ViewCtx, drawBox, insetRect, type Cloth, type Rect, type Wood } from './kit';
import {
  drawArmchair,
  drawBeanbag,
  drawBed,
  drawCabinet,
  drawChair,
  drawClock,
  drawDesk,
  drawDrawer,
  drawFloorLamp,
  drawFrame,
  drawLeaf,
  drawPot,
  drawRoundTable,
  drawRug,
  drawShelf,
  drawSofa,
  drawTvStand,
  drawWallLamp,
  drawWindow,
  tabletopProps,
} from './painters';

/** Draws one view of one catalog item. The canvas is (fw*16) x ((fh+lift)*16). */

interface DeskSet {
  wood: Wood;
  chair: Cloth;
  props: Array<'books' | 'laptop' | 'mug' | 'lamp'>;
  /** Cells of the desk top row, and which cells below are chairs / drawers. */
  width: number;
  chairs: number[];
}

const DESKS: Record<string, DeskSet> = {
  desk_basic: { wood: WOODS.oak, chair: CLOTHS.coral, props: ['books', 'mug'], width: 2, chairs: [0] },
  desk_wide: { wood: WOODS.walnut, chair: CLOTHS.blue, props: ['laptop', 'lamp', 'mug'], width: 3, chairs: [1] },
  desk_pair: { wood: WOODS.white, chair: CLOTHS.sage, props: ['books', 'laptop', 'mug', 'books'], width: 4, chairs: [1, 2] },
};

function paintDeskSet(c: PixelCanvas, ctx: ViewCtx, set: DeskSet): void {
  const painter = new Painter();
  const deskRect = insetRect(ctx.rect(0, 0, set.width - 1, 0), 1, 1, 1, 1);
  painter.add(deskRect.y + deskRect.h, () => drawDesk(c, deskRect, set.wood, set.props));
  for (let x = 0; x < set.width; x++) {
    const cell = ctx.rect(x, 1, x, 1);
    if (set.chairs.includes(x)) {
      painter.add(cell.y + cell.h, () => drawChair(c, cell, ctx.facing('up'), set.wood, set.chair));
    } else {
      painter.add(cell.y + cell.h, () => drawDrawer(c, cell, ctx.facing('down'), set.wood));
    }
  }
  painter.flush();
}

function paintBed(c: PixelCanvas, ctx: ViewCtx, frame: Wood, quilt: Cloth, pillows: number): void {
  const p = insetRect(ctx.rect(0, 0, ctx.item.w - 1, ctx.item.h - 1), 1, 1, 1, 1);
  drawBed(c, p, ctx.facing('down'), frame, quilt, pillows);
}

function paintTall(_c: PixelCanvas, ctx: ViewCtx, run: (p: Rect, faceH: number) => void): void {
  const up = ctx.item.lift * 16;
  const p = insetRect(ctx.rect(0, 0, ctx.item.w - 1, ctx.item.h - 1, up), 1, 1, 1, 1);
  run(p, up + 6);
}

const art = {
  stars(c: PixelCanvas, r: Rect): void {
    c.rect(r.x, r.y, r.w, r.h, '#2e3f6e');
    for (const [x, y] of [[1, 1], [6, 3], [3, 6], [9, 7], [10, 2]] as const) c.set(r.x + x, r.y + y, PAL.glow);
    c.ellipse(r.x + r.w - 4, r.y + 3, 2, 2, PAL.cream);
    c.set(r.x + r.w - 3, r.y + 2, '#2e3f6e');
  },
  cat(c: PixelCanvas, r: Rect): void {
    c.rect(r.x, r.y, r.w, r.h, '#f2d9a8');
    const cx = r.x + Math.floor(r.w / 2);
    c.rect(cx - 3, r.y + 4, 7, 5, PAL.ash);
    c.set(cx - 3, r.y + 3, PAL.ash);
    c.set(cx + 3, r.y + 3, PAL.ash);
    c.set(cx - 2, r.y + 5, PAL.glow);
    c.set(cx + 2, r.y + 5, PAL.glow);
    c.set(cx, r.y + 7, PAL.pink);
  },
  map(c: PixelCanvas, r: Rect): void {
    c.rect(r.x, r.y, r.w, r.h, '#a9c9d6');
    c.rect(r.x + 3, r.y + 2, 6, 4, '#9ab870');
    c.rect(r.x + 4, r.y + 1, 3, 2, '#9ab870');
    c.rect(r.x + 14, r.y + 3, 6, 5, '#c9a864');
    c.rect(r.x + 11, r.y + 6, 3, 3, '#9ab870');
    c.set(r.x + 18, r.y + 5, PAL.brick);
  },
  hills(c: PixelCanvas, r: Rect): void {
    c.rect(r.x, r.y, r.w, r.h, '#f0c68a');
    c.ellipse(r.x + 18, r.y + 3, 2.5, 2.5, PAL.coral);
    for (let x = 0; x < r.w; x++) {
      c.rect(r.x + x, r.y + r.h - 3 - Math.round(Math.sin(x / 3) * 1.5), 1, 5, '#6f8f5c');
    }
    for (let x = 0; x < r.w; x++) c.rect(r.x + x, r.y + r.h - 2, 1, 2, '#4f7050');
  },
};

type Painter3 = (c: PixelCanvas, ctx: ViewCtx) => void;

const BED_STYLES: Record<string, { frame: Wood; quilt: Cloth; pillows: number }> = {
  bed_single: { frame: WOODS.walnut, quilt: CLOTHS.coral, pillows: 1 },
  bed_double: { frame: WOODS.oak, quilt: CLOTHS.blue, pillows: 2 },
};

const PAINTERS: Record<string, Painter3> = {
  desk_basic: (c, ctx) => paintDeskSet(c, ctx, DESKS.desk_basic!),
  desk_wide: (c, ctx) => paintDeskSet(c, ctx, DESKS.desk_wide!),
  desk_pair: (c, ctx) => paintDeskSet(c, ctx, DESKS.desk_pair!),
  bed_single: (c, ctx) => paintBed(c, ctx, BED_STYLES.bed_single!.frame, BED_STYLES.bed_single!.quilt, 1),
  bed_double: (c, ctx) => paintBed(c, ctx, BED_STYLES.bed_double!.frame, BED_STYLES.bed_double!.quilt, 2),
  shelf_low: (c, ctx) => paintTall(c, ctx, (p, fh) => drawShelf(c, p, fh, ctx.facing('down'), WOODS.oak, 11)),
  shelf_tall: (c, ctx) => paintTall(c, ctx, (p, fh) => drawShelf(c, p, fh, ctx.facing('down'), WOODS.pine, 23)),
  bookcase_wide: (c, ctx) => paintTall(c, ctx, (p, fh) => drawShelf(c, p, fh, ctx.facing('down'), WOODS.walnut, 37)),
  sofa: (c, ctx) =>
    paintTall(c, ctx, (p) => drawSofa(c, p, ctx.facing('down'), 3, CLOTHS.plum, WOODS.walnut)),
  armchair: (c, ctx) =>
    paintTall(c, ctx, (p) => drawArmchair(c, p, ctx.facing('down'), CLOTHS.gold, WOODS.walnut)),
  dresser: (c, ctx) => paintTall(c, ctx, (p, fh) => drawCabinet(c, p, fh, ctx.facing('down'), WOODS.pine, 'dresser')),
  wardrobe: (c, ctx) => paintTall(c, ctx, (p, fh) => drawCabinet(c, p, fh, ctx.facing('down'), WOODS.walnut, 'wardrobe')),
  tv_stand: (c, ctx) => paintTall(c, ctx, (p) => drawTvStand(c, p, ctx.facing('down'), WOODS.oak)),
  beanbag: (c) => drawBeanbag(c, CLOTHS.rose),
  table_round: (c, ctx) => drawRoundTable(c, ctx.width, ctx.height, WOODS.oak),
  table_coffee: (c, ctx) => {
    const p = insetRect(ctx.rect(0, 0, ctx.item.w - 1, ctx.item.h - 1), 1, 1, 1, 1);
    const { top, face } = drawBox(c, p, 8, WOODS.walnut);
    c.hline(face.x + 1, face.y + 1, face.w - 2, WOODS.walnut.light);
    c.rect(face.x + 1, face.y + 2, 2, face.h - 2, WOODS.walnut.dark);
    c.rect(face.x + face.w - 3, face.y + 2, 2, face.h - 2, WOODS.walnut.dark);
    tabletopProps(c, top, 'mug');
    tabletopProps(c, { ...top, x: top.x + Math.max(8, top.w - 14) }, 'books');
  },
  plant_small: (c, ctx) => {
    const bottom = ctx.height - 2;
    drawPot(c, 4, bottom - 5, 8, 6);
    drawLeaf(c, 8, bottom - 6, 7, 0);
    drawLeaf(c, 7, bottom - 6, 6, -3);
    drawLeaf(c, 9, bottom - 6, 6, 3);
  },
  plant_tall: (c, ctx) => {
    const bottom = ctx.height - 2;
    drawPot(c, 3, bottom - 7, 10, 8);
    for (const [x, len, lean] of [[7, 19, 0], [5, 15, -2], [10, 16, 2], [8, 12, 1]] as const) drawLeaf(c, x, bottom - 8, len, lean);
  },
  plant_big: (c, ctx) => {
    const bottom = ctx.height - 2;
    drawPot(c, 9, bottom - 9, 14, 10);
    for (const [x, len, lean] of [[16, 30, 0], [12, 24, -5], [20, 26, 5], [10, 16, -7], [22, 17, 7], [15, 20, -2], [18, 21, 3]] as const) {
      drawLeaf(c, x, bottom - 10, len, lean);
      drawLeaf(c, x + 1, bottom - 10, Math.max(3, len - 3), lean);
    }
  },
  rug_small: (c, ctx) => drawRug(c, ctx.width, ctx.height, 'rect', CLOTHS.coral, PAL.gold),
  rug_round: (c, ctx) => drawRug(c, ctx.width, ctx.height, 'round', CLOTHS.blue, PAL.cream),
  rug_rect: (c, ctx) => drawRug(c, ctx.width, ctx.height, 'rect', CLOTHS.sage, PAL.cream),
  rug_runner: (c, ctx) => drawRug(c, ctx.width, ctx.height, 'rect', CLOTHS.plum, PAL.gold),
  poster_stars: (c) => art.stars(c, drawFrame(c, 16, 16, WOODS.walnut)),
  poster_cat: (c) => art.cat(c, drawFrame(c, 16, 16, WOODS.oak)),
  poster_map: (c) => art.map(c, drawFrame(c, 32, 16, WOODS.walnut)),
  poster_art: (c) => art.hills(c, drawFrame(c, 32, 16, WOODS.white)),
  window_small: (c, ctx) => drawWindow(c, ctx.width, ctx.height),
  window_wide: (c, ctx) => drawWindow(c, ctx.width, ctx.height),
  clock_wall: (c) => drawClock(c),
  lamp_wall: (c) => drawWallLamp(c),
  lamp_floor: (c) => drawFloorLamp(c),
};

/** Items drawn flat on the floor: no outline, so characters walking over them stay readable. */
const NO_OUTLINE = new Set(['rug_small', 'rug_round', 'rug_rect', 'rug_runner']);

export function hasPainter(itemId: string): boolean {
  return itemId in PAINTERS;
}

export function renderFurniture(item: FurnitureItem, view: number): PixelCanvas {
  const painter = PAINTERS[item.id];
  if (!painter) throw new Error(`No painter for furniture "${item.id}"`);
  const ctx = new ViewCtx(item, view);
  const c = new PixelCanvas(ctx.width, ctx.height);
  painter(c, ctx);
  if (!NO_OUTLINE.has(item.id)) c.outline(PAL.ink);
  const fp = footprint(item, view);
  if (c.width !== fp.w * 16 || c.height !== (fp.h + item.lift) * 16) throw new Error(`Wrong size for ${item.id}`);
  return c;
}

void mix;
