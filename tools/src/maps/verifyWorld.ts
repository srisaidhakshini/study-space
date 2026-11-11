import { isBlocked, parseTiledMap, TILE, type Rect } from '@study/shared';
import type { MapBuilder } from './builder';

const tileRange = (r: Rect): { x0: number; y0: number; x1: number; y1: number } => ({
  x0: Math.floor(r.x / TILE),
  y0: Math.floor(r.y / TILE),
  x1: Math.floor((r.x + r.width - 1) / TILE),
  y1: Math.floor((r.y + r.height - 1) / TILE),
});

/**
 * Throws if the map cannot be played: every seat, door and spawn must be
 * reachable from the `entrance` spawn, and the walkable area may only touch
 * the map border inside a door.
 */
export function verifyArea(id: string, builder: MapBuilder): void {
  const { collision: grid, objects } = parseTiledMap(builder.toTiled(''));
  const fail = (message: string): never => {
    throw new Error(`Map "${id}": ${message}`);
  };
  const entrance = objects.spawns.find((s) => s.id === 'entrance') ?? fail('no "entrance" spawn');
  const start = { x: Math.floor(entrance.x / TILE), y: Math.floor(entrance.y / TILE) };
  if (isBlocked(grid, start.x, start.y)) fail(`entrance (${start.x}, ${start.y}) is blocked`);

  const reach = new Uint8Array(grid.width * grid.height);
  const queue = [start];
  reach[start.y * grid.width + start.x] = 1;
  while (queue.length > 0) {
    const { x, y } = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (isBlocked(grid, nx, ny) || reach[ny * grid.width + nx]) continue;
      reach[ny * grid.width + nx] = 1;
      queue.push({ x: nx, y: ny });
    }
  }
  const reached = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < grid.width && y < grid.height && reach[y * grid.width + x] === 1;

  for (const seat of objects.seats) {
    const ok = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reached(seat.tx + dx!, seat.ty + dy!));
    if (!ok) fail(`seat ${seat.id} at (${seat.tx}, ${seat.ty}) has no reachable neighbour`);
  }
  const inDoor = new Set<number>();
  for (const door of objects.doors) {
    const { x0, y0, x1, y1 } = tileRange(door.rect);
    let any = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        inDoor.add(y * grid.width + x);
        if (reached(x, y)) any = true;
      }
    }
    if (!any) fail(`door ${door.id} is unreachable`);
  }
  for (const spawn of objects.spawns) {
    const tx = Math.floor(spawn.x / TILE);
    const ty = Math.floor(spawn.y / TILE);
    if (!reached(tx, ty)) fail(`spawn ${spawn.id} at (${tx}, ${ty}) is blocked or unreachable`);
  }
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const border = x === 0 || y === 0 || x === grid.width - 1 || y === grid.height - 1;
      if (border && reached(x, y) && !inDoor.has(y * grid.width + x)) fail(`walkable border tile (${x}, ${y}) outside any door`);
    }
  }
}
