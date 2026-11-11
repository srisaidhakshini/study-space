import { FEET_BOX, TILE } from './constants';

/** Walkability of a map: one byte per tile, 1 = blocked. */
export interface CollisionGrid {
  width: number;
  height: number;
  blocked: Uint8Array;
}

export function createGrid(width: number, height: number): CollisionGrid {
  return { width, height, blocked: new Uint8Array(width * height) };
}

/** Tiles outside the map count as blocked. */
export function isBlocked(grid: CollisionGrid, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= grid.width || ty >= grid.height) return true;
  return grid.blocked[ty * grid.width + tx] === 1;
}

export function toTile(pixel: number): number {
  return Math.floor(pixel / TILE);
}

/** True if the feet box of a character standing at (x, y) touches a blocked tile. */
export function feetBlocked(grid: CollisionGrid, x: number, y: number): boolean {
  const left = toTile(x - FEET_BOX.halfW);
  const right = toTile(x + FEET_BOX.halfW - 0.001);
  const top = toTile(y - FEET_BOX.height);
  const bottom = toTile(y - 0.001);
  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (isBlocked(grid, tx, ty)) return true;
    }
  }
  return false;
}

/**
 * Moves a feet position by (dx, dy), sliding along walls. Each axis is
 * resolved on its own so diagonal movement into a wall still glides.
 */
export function moveWithCollision(
  grid: CollisionGrid,
  x: number,
  y: number,
  dx: number,
  dy: number,
): { x: number; y: number } {
  let nx = x;
  let ny = y;
  if (dx !== 0 && !feetBlocked(grid, x + dx, y)) nx = x + dx;
  if (dy !== 0 && !feetBlocked(grid, nx, y + dy)) ny = y + dy;
  return { x: nx, y: ny };
}
