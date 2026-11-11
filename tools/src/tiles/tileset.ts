import { TILE, TILE_PROP_SORT_OFFSET } from '@study/shared';
import { PAL, withAlpha } from '../palette';
import { PixelCanvas } from '../png';

export interface TileOptions {
  /** Blocks movement when placed on the ground, walls or furniture layer. */
  solid?: boolean;
  /** Tiles lower the tile sorts, for the upper parts of tall furniture. */
  sortOffset?: number;
}

interface TileEntry {
  name: string;
  canvas: PixelCanvas;
  solid: boolean;
  sortOffset: number;
}

const COLUMNS = 16;

/** Collects named 16x16 tiles and writes them out as one tileset image. */
export class Tileset {
  private readonly tiles: TileEntry[] = [];
  private readonly byName = new Map<string, number>();

  constructor(readonly name: string) {
    // Tile 0 marks blocked cells on the collision layer.
    this.add('collision', (c) => c.rect(0, 0, TILE, TILE, withAlpha(PAL.brick, 0.5)));
  }

  add(name: string, draw: (c: PixelCanvas) => void, options: TileOptions = {}): void {
    const canvas = new PixelCanvas(TILE, TILE);
    draw(canvas);
    this.push(name, canvas, options);
  }

  /**
   * Draws one picture spanning several tiles and slices it up. Tiles are
   * named `${name}:${column}:${row}`; `options` is asked for each slice.
   */
  addBlock(
    name: string,
    columns: number,
    rows: number,
    draw: (c: PixelCanvas) => void,
    options: (column: number, row: number) => TileOptions,
  ): void {
    const canvas = new PixelCanvas(columns * TILE, rows * TILE);
    draw(canvas);
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        this.push(`${name}:${column}:${row}`, canvas.crop(column * TILE, row * TILE, TILE, TILE), options(column, row));
      }
    }
  }

  private push(name: string, canvas: PixelCanvas, options: TileOptions): void {
    if (this.byName.has(name)) throw new Error(`Duplicate tile "${name}" in tileset ${this.name}`);
    this.byName.set(name, this.tiles.length);
    this.tiles.push({ name, canvas, solid: options.solid === true, sortOffset: options.sortOffset ?? 0 });
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  /** Global tile id as stored in map layers (first gid is 1). */
  gid(name: string): number {
    const id = this.byName.get(name);
    if (id === undefined) throw new Error(`Unknown tile "${name}" in tileset ${this.name}`);
    return id + 1;
  }

  isSolid(gid: number): boolean {
    return gid > 0 && this.tiles[gid - 1]?.solid === true;
  }

  render(): PixelCanvas {
    const rows = Math.ceil(this.tiles.length / COLUMNS);
    const sheet = new PixelCanvas(COLUMNS * TILE, rows * TILE);
    this.tiles.forEach((tile, i) => {
      sheet.blit(tile.canvas, (i % COLUMNS) * TILE, Math.floor(i / COLUMNS) * TILE);
    });
    return sheet;
  }

  /** The embedded tileset block of a Tiled map. */
  toTiled(imagePath: string): Record<string, unknown> {
    const rows = Math.ceil(this.tiles.length / COLUMNS);
    return {
      firstgid: 1,
      name: this.name,
      image: imagePath,
      imagewidth: COLUMNS * TILE,
      imageheight: rows * TILE,
      tilewidth: TILE,
      tileheight: TILE,
      tilecount: rows * COLUMNS,
      columns: COLUMNS,
      margin: 0,
      spacing: 0,
      tiles: this.tiles
        .map((tile, id) => ({ tile, id }))
        .filter(({ tile }) => tile.sortOffset !== 0)
        .map(({ tile, id }) => ({
          id,
          properties: [{ name: TILE_PROP_SORT_OFFSET, type: 'int', value: tile.sortOffset }],
        })),
    };
  }
}

/** Bits of an autotile mask: which neighbours are the same terrain. */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

const WOBBLE = [0, 0, 1, 1, 0, 1, 0, 0];

export interface PatchStyle {
  /** Paints the terrain itself over the whole tile. */
  fill: (c: PixelCanvas) => void;
  /** Paints what shows outside the patch; omit for transparent. */
  outside?: (c: PixelCanvas) => void;
  /** Colour of the one-pixel rim just inside the edge. */
  rim: string;
  /** How far the edge sits from the tile border. */
  inset: number;
  /** Uneven, organic edges (paths, ponds) instead of straight ones (rugs). */
  wobble: boolean;
}

/**
 * Registers the 16 tiles of a 4-neighbour autotile as `${prefix}_${mask}`.
 * Sides without a matching neighbour get an edge; the rest run to the border.
 */
export function addAutotile(set: Tileset, prefix: string, style: PatchStyle, options: TileOptions = {}): void {
  for (let mask = 0; mask < 16; mask++) {
    set.add(
      `${prefix}_${mask}`,
      (c) => {
        const fill = new PixelCanvas(TILE, TILE);
        style.fill(fill);
        style.outside?.(c);
        const depth = (along: number, side: number): number =>
          style.inset + (style.wobble ? WOBBLE[(along + side * 3) % WOBBLE.length]! : 0);
        const inside = (x: number, y: number): boolean => {
          if (x < 0 || y < 0 || x >= TILE || y >= TILE) return true;
          if (!(mask & N) && y < depth(x, 0)) return false;
          if (!(mask & S) && TILE - 1 - y < depth(x, 1)) return false;
          if (!(mask & W) && x < depth(y, 2)) return false;
          if (!(mask & E) && TILE - 1 - x < depth(y, 3)) return false;
          return true;
        };
        for (let y = 0; y < TILE; y++) {
          for (let x = 0; x < TILE; x++) {
            if (!inside(x, y)) continue;
            const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
            c.set(x, y, edge ? style.rim : (fill.get(x, y) ?? style.rim));
          }
        }
      },
      options,
    );
  }
}

/** Scatters single pixels of a colour, for texture. */
export function speckle(c: PixelCanvas, rand: () => number, count: number, color: string): void {
  for (let i = 0; i < count; i++) {
    c.set(Math.floor(rand() * c.width), Math.floor(rand() * c.height), color);
  }
}
