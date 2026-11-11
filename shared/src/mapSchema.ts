import { TILE, isDirection, type Direction } from './constants';

/** Layer names every Tiled map must use. */
export const LAYERS = {
  ground: 'ground',
  walls: 'walls',
  furniture: 'furniture',
  above: 'above',
  collision: 'collision',
  objects: 'objects',
} as const;

/** Custom tile property: how many tiles lower a tall furniture tile sorts. */
export const TILE_PROP_SORT_OFFSET = 'sortOffset';

export const OBJECT_TYPES = ['seat', 'door', 'spawn', 'zone', 'lamp', 'light'] as const;
export type MapObjectType = (typeof OBJECT_TYPES)[number];

export const SEAT_KINDS = ['chair', 'bench'] as const;
export type SeatKind = (typeof SEAT_KINDS)[number];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A place to sit. Tiled: point object, type "seat". */
export interface SeatDef {
  id: string;
  /** Tile the seat occupies. */
  tx: number;
  ty: number;
  facing: Direction;
  zoneId: string;
  kind: SeatKind;
}

/** Walking into this rectangle travels to another map. Tiled: rectangle, type "door". */
export interface DoorDef {
  id: string;
  rect: Rect;
  targetMap: string;
  targetSpawn: string;
}

/** Where characters appear. Tiled: point object, type "spawn"; the name is the spawn id. */
export interface SpawnDef {
  id: string;
  x: number;
  y: number;
  facing: Direction;
}

/** A named area with rules. Tiled: rectangle, type "zone". */
export interface ZoneDef {
  id: string;
  name: string;
  rect: Rect;
  /** Chat is disabled inside silent zones. */
  silent: boolean;
  /** Subject id for subject corners, or '' for none. */
  subject: string;
}

/** A desk lamp that lights while its seat has a running session. Tiled: point, type "lamp". */
export interface LampDef {
  id: string;
  x: number;
  y: number;
  seatId: string;
}

/**
 * A street lamp or lantern that glows at night and in heavy rain.
 * Tiled: point, type "light"; properties `radius` (pixels, default 48).
 */
export interface LightDef {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface MapObjects {
  lights: LightDef[];
  seats: SeatDef[];
  doors: DoorDef[];
  spawns: SpawnDef[];
  zones: ZoneDef[];
  lamps: LampDef[];
}

/** The subset of a Tiled object this project reads. */
export interface RawTiledObject {
  id: number;
  name?: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  properties?: { name: string; value: unknown }[] | Record<string, unknown>;
}

function readProps(obj: RawTiledObject): Record<string, unknown> {
  const p = obj.properties;
  if (!p) return {};
  if (Array.isArray(p)) return Object.fromEntries(p.map((e) => [e.name, e.value]));
  return p;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function rectOf(obj: RawTiledObject): Rect {
  return { x: obj.x, y: obj.y, width: obj.width ?? 0, height: obj.height ?? 0 };
}

/** Converts raw Tiled objects into typed definitions, skipping unknown types. */
export function parseMapObjects(raw: readonly RawTiledObject[]): MapObjects {
  const out: MapObjects = { seats: [], doors: [], spawns: [], zones: [], lamps: [], lights: [] };
  for (const obj of raw) {
    const type = obj.type || obj.class || '';
    const props = readProps(obj);
    const id = obj.name || `${type}-${obj.id}`;
    const facing = isDirection(props.facing) ? props.facing : 'down';
    switch (type) {
      case 'seat':
        out.seats.push({
          id,
          tx: Math.floor(obj.x / TILE),
          ty: Math.floor(obj.y / TILE),
          facing,
          zoneId: str(props.zoneId),
          kind: props.kind === 'bench' ? 'bench' : 'chair',
        });
        break;
      case 'door':
        out.doors.push({
          id,
          rect: rectOf(obj),
          targetMap: str(props.targetMap),
          targetSpawn: str(props.targetSpawn),
        });
        break;
      case 'spawn':
        out.spawns.push({ id, x: obj.x, y: obj.y, facing });
        break;
      case 'zone':
        out.zones.push({
          id,
          name: str(props.name, id),
          rect: rectOf(obj),
          silent: props.silent === true,
          subject: str(props.subject),
        });
        break;
      case 'lamp':
        out.lamps.push({ id, x: obj.x, y: obj.y, seatId: str(props.seatId) });
        break;
      case 'light':
        out.lights.push({ id, x: obj.x, y: obj.y, radius: typeof props.radius === 'number' ? props.radius : 48 });
        break;
      default:
        break;
    }
  }
  return out;
}

export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

/** The smallest zone containing a point, so nested corners win over the room. */
export function zoneAt(zones: readonly ZoneDef[], x: number, y: number): ZoneDef | null {
  let best: ZoneDef | null = null;
  let bestArea = Infinity;
  for (const zone of zones) {
    if (!rectContains(zone.rect, x, y)) continue;
    const area = zone.rect.width * zone.rect.height;
    if (area < bestArea) {
      best = zone;
      bestArea = area;
    }
  }
  return best;
}

/**
 * Where a seated character's feet go, relative to the bottom-centre of the
 * seat tile. Chairs facing the camera tuck the legs under the desk in front.
 */
const SEAT_OFFSETS: Record<SeatKind, Record<Direction, { dx: number; dy: number }>> = {
  chair: {
    down: { dx: 0, dy: 6 },
    up: { dx: 0, dy: -2 },
    left: { dx: -1, dy: -2 },
    right: { dx: 1, dy: -2 },
  },
  bench: {
    down: { dx: 0, dy: -3 },
    up: { dx: 0, dy: -2 },
    left: { dx: 0, dy: -2 },
    right: { dx: 0, dy: -2 },
  },
};

export function seatFeetPosition(seat: SeatDef): { x: number; y: number } {
  const off = SEAT_OFFSETS[seat.kind][seat.facing];
  return {
    x: seat.tx * TILE + TILE / 2 + off.dx,
    y: (seat.ty + 1) * TILE + off.dy,
  };
}
