import { FEET_ANCHOR, LAYERS, TILE, type Direction, type MapObjectType, type SeatKind } from '@study/shared';
import type { Tileset } from '../tiles/tileset';
import { E, N, S, W } from '../tiles/tileset';

/** Tile blocks that carry a light, with the radius of their glow in pixels. */
const LIGHT_BLOCKS: Record<string, number> = { lamppost: 56, lantern: 48 };

type TileLayer = 'ground' | 'walls' | 'furniture' | 'above';
const TILE_LAYERS: TileLayer[] = ['ground', 'walls', 'furniture', 'above'];

type PropValue = string | number | boolean;

interface MapObject {
  id: number;
  name: string;
  type: MapObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  point: boolean;
  props: Record<string, PropValue>;
}

/** Builds a Tiled map in code: paint tiles by name, add objects, export JSON. */
export class MapBuilder {
  private readonly layers: Record<TileLayer, Uint32Array>;
  private readonly forced = new Map<number, boolean>();
  private readonly objects: MapObject[] = [];
  private seatCount = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly tiles: Tileset,
  ) {
    const make = (): Uint32Array => new Uint32Array(width * height);
    this.layers = { ground: make(), walls: make(), furniture: make(), above: make() };
  }

  private index(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      throw new Error(`Tile (${x}, ${y}) is outside the ${this.width}x${this.height} map`);
    }
    return y * this.width + x;
  }

  set(layer: TileLayer, x: number, y: number, tile: string | null): void {
    this.layers[layer][this.index(x, y)] = tile ? this.tiles.gid(tile) : 0;
  }

  isEmpty(layer: TileLayer, x: number, y: number): boolean {
    return this.layers[layer][this.index(x, y)] === 0;
  }

  fill(layer: TileLayer, x: number, y: number, w: number, h: number, tile: string | ((x: number, y: number) => string | null)): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        this.set(layer, xx, yy, typeof tile === 'string' ? tile : tile(xx, yy));
      }
    }
  }

  /** Places a multi-tile block (see Tileset.addBlock) with its top-left at (x, y). */
  block(layer: TileLayer, x: number, y: number, name: string, columns: number, rows: number): void {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        this.set(layer, x + column, y + row, `${name}:${column}:${row}`);
      }
    }
    // Street lamps and lanterns glow at night: add a light at the lamp head.
    const radius = LIGHT_BLOCKS[name];
    if (radius !== undefined) {
      this.add('light', `light-${this.objects.length + 1}`, x * TILE + (columns * TILE) / 2, y * TILE + 8, 0, 0, { radius });
    }
  }

  /**
   * Paints an autotile over the cells where `member` is true, choosing each
   * tile from its neighbours. `joins` lets other terrain count as connected.
   */
  autotile(layer: TileLayer, prefix: string, member: (x: number, y: number) => boolean, joins = member): void {
    const linked = (x: number, y: number): boolean =>
      x < 0 || y < 0 || x >= this.width || y >= this.height || member(x, y) || joins(x, y);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!member(x, y)) continue;
        const mask =
          (linked(x, y - 1) ? N : 0) | (linked(x + 1, y) ? E : 0) | (linked(x, y + 1) ? S : 0) | (linked(x - 1, y) ? W : 0);
        this.set(layer, x, y, `${prefix}_${mask}`);
      }
    }
  }

  /** Overrides the computed collision for one cell. */
  setBlocked(x: number, y: number, blocked: boolean): void {
    this.forced.set(this.index(x, y), blocked);
  }

  private add(type: MapObjectType, name: string, x: number, y: number, w: number, h: number, props: Record<string, PropValue>): void {
    this.objects.push({ id: this.objects.length + 1, name, type, x, y, width: w, height: h, point: w === 0 && h === 0, props });
  }

  /** A seat on tile (tx, ty). Returns the generated seat id. */
  seat(tx: number, ty: number, facing: Direction, zoneId: string, kind: SeatKind): string {
    const id = `seat-${++this.seatCount}`;
    this.add('seat', id, tx * TILE + TILE / 2, ty * TILE + TILE / 2, 0, 0, { facing, zoneId, kind });
    return id;
  }

  /** A desk lamp at a pixel position, lit by the given seat. */
  lamp(x: number, y: number, seatId: string): void {
    this.add('lamp', `lamp-${seatId}`, x, y, 0, 0, { seatId });
  }

  /**
   * A spawn point standing on tile row `ty`. `tx` is in tiles and may be
   * fractional (20 is the seam between columns 19 and 20).
   */
  spawn(id: string, tx: number, ty: number, facing: Direction): void {
    this.add('spawn', id, Math.round(tx * TILE), ty * TILE + FEET_ANCHOR.y, 0, 0, { facing });
  }

  /** A door trigger given in pixels. */
  door(id: string, x: number, y: number, w: number, h: number, targetMap: string, targetSpawn: string): void {
    this.add('door', id, x, y, w, h, { targetMap, targetSpawn });
  }

  /** A zone given in tiles. */
  zone(id: string, name: string, tx: number, ty: number, tw: number, th: number, silent: boolean, subject = ''): void {
    this.add('zone', id, tx * TILE, ty * TILE, tw * TILE, th * TILE, { name, silent, subject });
  }

  private collision(): number[] {
    const marker = this.tiles.gid('collision');
    const out = new Array<number>(this.width * this.height).fill(0);
    for (let i = 0; i < out.length; i++) {
      const forced = this.forced.get(i);
      const solid =
        forced ??
        (this.tiles.isSolid(this.layers.ground[i]!) ||
          this.tiles.isSolid(this.layers.walls[i]!) ||
          this.tiles.isSolid(this.layers.furniture[i]!));
      out[i] = solid ? marker : 0;
    }
    return out;
  }

  /** The finished map in Tiled's JSON format. */
  toTiled(tilesetImage: string): Record<string, unknown> {
    const tileLayer = (id: number, name: string, data: number[], visible = true, opacity = 1): Record<string, unknown> => ({
      id,
      name,
      type: 'tilelayer',
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      opacity,
      visible,
      data,
    });
    const layers = TILE_LAYERS.map((name, i) => tileLayer(i + 1, LAYERS[name], Array.from(this.layers[name])));
    layers.push(tileLayer(5, LAYERS.collision, this.collision(), true, 0.4));
    layers.push({
      id: 6,
      name: LAYERS.objects,
      type: 'objectgroup',
      draworder: 'topdown',
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      objects: this.objects.map((o) => ({
        id: o.id,
        name: o.name,
        type: o.type,
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
        rotation: 0,
        visible: true,
        ...(o.point ? { point: true } : {}),
        properties: Object.entries(o.props).map(([name, value]) => ({
          name,
          type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? 'float' : 'string',
          value,
        })),
      })),
    });
    return {
      type: 'map',
      version: '1.10',
      tiledversion: '1.10.2',
      orientation: 'orthogonal',
      renderorder: 'right-down',
      infinite: false,
      compressionlevel: -1,
      width: this.width,
      height: this.height,
      tilewidth: TILE,
      tileheight: TILE,
      nextlayerid: 7,
      nextobjectid: this.objects.length + 1,
      layers,
      tilesets: [this.tiles.toTiled(tilesetImage)],
    };
  }
}
