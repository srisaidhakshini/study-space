import { findPath, isBlocked, parseTiledMap, TILE, zoneAt } from '@study/shared';
import type { MapBuilder } from './builder';

/**
 * Checks that a finished map is playable: the arrival spawn is on open floor,
 * every seat has a free neighbouring tile reachable from it, every spawn can
 * be reached, and the listed zones are completely walkable. Throws a
 * descriptive error instead of shipping an unusable room.
 */
export function verifyReachable(name: string, map: MapBuilder, options: { openZones?: string[] } = {}): void {
  const parsed = parseTiledMap(map.toTiled(''));
  const { collision, objects } = parsed;
  const entrance = objects.spawns.find((s) => s.id === 'entrance');
  if (!entrance) throw new Error(`${name}: no "entrance" spawn`);
  const start = { x: Math.floor(entrance.x / TILE), y: Math.floor(entrance.y / TILE) };
  if (isBlocked(collision, start.x, start.y)) throw new Error(`${name}: entrance spawn (${start.x}, ${start.y}) is blocked`);
  if (!objects.doors.some((d) => d.id === 'to-hub')) throw new Error(`${name}: no "to-hub" door`);

  for (const spawn of objects.spawns) {
    const tile = { x: Math.floor(spawn.x / TILE), y: Math.floor(spawn.y / TILE) };
    if (!findPath(collision, start, tile)) throw new Error(`${name}: spawn "${spawn.id}" at (${tile.x}, ${tile.y}) is unreachable`);
  }

  const neighbours = [
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];
  for (const seat of objects.seats) {
    const reachable = neighbours.some((n) => {
      const tile = { x: seat.tx + n.x, y: seat.ty + n.y };
      return !isBlocked(collision, tile.x, tile.y) && findPath(collision, start, tile) !== null;
    });
    if (!reachable) throw new Error(`${name}: seat ${seat.id} at (${seat.tx}, ${seat.ty}) has no reachable free neighbour`);
  }

  for (const id of options.openZones ?? []) {
    const zone = objects.zones.find((z) => z.id === id);
    if (!zone) throw new Error(`${name}: zone "${id}" is missing`);
    for (let y = Math.floor(zone.rect.y / TILE); y < Math.ceil((zone.rect.y + zone.rect.height) / TILE); y++) {
      for (let x = Math.floor(zone.rect.x / TILE); x < Math.ceil((zone.rect.x + zone.rect.width) / TILE); x++) {
        if (isBlocked(collision, x, y)) throw new Error(`${name}: zone "${id}" has a blocked tile at (${x}, ${y})`);
      }
    }
  }
  if (!zoneAt(objects.zones, entrance.x, entrance.y)) throw new Error(`${name}: the entrance is outside every zone`);
}
