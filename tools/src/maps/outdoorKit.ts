import { findPath, isBlocked, parseTiledMap, TILE, type CollisionGrid } from '@study/shared';
import type { MapBuilder } from './builder';

/** Tracks which cells hold props so nothing is placed twice or on a path. */
export class Layout {
  private readonly taken = new Map<string, string>();

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly forbidden: (x: number, y: number) => boolean = () => false,
  ) {}

  /** True when the whole rectangle is inside the map and unclaimed. */
  fits(x: number, y: number, w: number, h: number): boolean {
    if (x < 0 || y < 0 || x + w > this.width || y + h > this.height) return false;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (this.taken.has(`${xx},${yy}`) || this.forbidden(xx, yy)) return false;
      }
    }
    return true;
  }

  /** Claims a rectangle for `label`, or throws naming the clash. */
  take(x: number, y: number, w: number, h: number, label: string): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const key = `${xx},${yy}`;
        if (xx < 0 || yy < 0 || xx >= this.width || yy >= this.height) {
          throw new Error(`${label} at (${x},${y}) ${w}x${h} leaves the map`);
        }
        const other = this.taken.get(key);
        if (other) throw new Error(`${label} at (${x},${y}) overlaps ${other} at (${xx},${yy})`);
        if (this.forbidden(xx, yy)) throw new Error(`${label} at (${x},${y}) sits on a path at (${xx},${yy})`);
        this.taken.set(key, label);
      }
    }
  }

  /** Claims without clash checks (ground decoration such as paths and beds). */
  mark(x: number, y: number, label: string): void {
    this.taken.set(`${x},${y}`, label);
  }

  isTaken(x: number, y: number): boolean {
    return this.taken.has(`${x},${y}`);
  }
}

/**
 * Self-test run while building a map: every seat must have a walkable
 * neighbour reachable from the entrance, and so must every door.
 */
export function assertReachable(map: string, builder: MapBuilder, entrance: { x: number; y: number }): void {
  const parsed = parseTiledMap(builder.toTiled(''));
  const grid: CollisionGrid = parsed.collision;
  const start = { x: Math.floor(entrance.x / TILE), y: Math.floor(entrance.y / TILE) };
  if (isBlocked(grid, start.x, start.y)) throw new Error(`${map}: entrance (${start.x},${start.y}) is blocked`);

  const reach = (x: number, y: number): boolean => !isBlocked(grid, x, y) && findPath(grid, start, { x, y }) !== null;
  const problems: string[] = [];

  for (const seat of parsed.objects.seats) {
    const ok = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach(seat.tx + dx!, seat.ty + dy!));
    if (!ok) problems.push(`seat ${seat.id} at (${seat.tx},${seat.ty}) is unreachable`);
  }
  for (const door of parsed.objects.doors) {
    const cx = Math.floor((door.rect.x + door.rect.width / 2) / TILE);
    const cy = Math.floor((door.rect.y + door.rect.height / 2 - 1) / TILE);
    if (!reach(cx, cy)) problems.push(`door ${door.id} at (${cx},${cy}) is unreachable`);
  }
  if (problems.length > 0) throw new Error(`${map}: ${problems.join('; ')}`);
}

/** Cheap deterministic hash for scattering decoration. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
