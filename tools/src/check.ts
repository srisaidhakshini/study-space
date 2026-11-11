/**
 * Checks that the generated maps fit together:  npm run check -w tools
 * Every door must point at an existing map and spawn, every map must have an
 * `entrance` spawn, every door and spawn must stand on walkable ground, and
 * every seat, door and spawn must be reachable from the entrance.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEET_BOX, findPath, isBlocked, parseTiledMap, toTile, type AssetManifest, type ParsedMap } from '@study/shared';

const ASSETS = join(resolve(dirname(fileURLToPath(import.meta.url)), '../..'), 'client/public/assets');
const manifest = JSON.parse(readFileSync(join(ASSETS, 'assets.json'), 'utf8')) as AssetManifest;

const maps = new Map<string, ParsedMap>();
for (const [id, entry] of Object.entries(manifest.maps)) {
  maps.set(id, parseTiledMap(JSON.parse(readFileSync(join(ASSETS, entry.path), 'utf8'))));
}

/** Door ids whose target is decided at runtime (house doors, street gates, a home's exit). */
const DYNAMIC_DOORS = /^(exit|west|east|house-\d+)$/;

const problems: string[] = [];
const fail = (message: string): number => problems.push(message);

for (const [id, map] of maps) {
  const { collision, objects } = map;
  // The hub's main spawn is the manifest start point; every other map uses "entrance".
  const mainSpawn = id === manifest.start.map ? manifest.start.spawn : 'entrance';
  const entrance = objects.spawns.find((s) => s.id === mainSpawn);
  if (!entrance) fail(`${id}: no "${mainSpawn}" spawn`);
  const standable = (x: number, y: number): boolean => !isBlocked(collision, toTile(x), toTile(y - FEET_BOX.height / 2));

  for (const spawn of objects.spawns) {
    if (!standable(spawn.x, spawn.y)) fail(`${id}: spawn "${spawn.id}" is inside a wall`);
  }
  for (const door of objects.doors) {
    // Doors of homes and the street depend on the player's house and street page; the server resolves them.
    if (DYNAMIC_DOORS.test(door.id)) continue;
    const target = maps.get(door.targetMap);
    if (!target) fail(`${id}: door "${door.id}" targets unknown map "${door.targetMap}"`);
    else if (!target.objects.spawns.some((s) => s.id === door.targetSpawn)) {
      fail(`${id}: door "${door.id}" targets unknown spawn "${door.targetMap}/${door.targetSpawn}"`);
    }
  }
  for (const zone of objects.zones) {
    if (zone.rect.width <= 0 || zone.rect.height <= 0) fail(`${id}: zone "${zone.id}" has no area`);
  }

  if (!entrance) continue;
  const start = { x: toTile(entrance.x), y: toTile(entrance.y - 1) };
  const reachable = (tx: number, ty: number): boolean => {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (!isBlocked(collision, tx + dx, ty + dy) && findPath(collision, start, { x: tx + dx, y: ty + dy })) return true;
    }
    return false;
  };
  for (const seat of objects.seats) {
    if (!reachable(seat.tx, seat.ty)) fail(`${id}: seat "${seat.id}" cannot be reached from the entrance`);
  }
  for (const door of objects.doors) {
    if (!reachable(toTile(door.rect.x + door.rect.width / 2), toTile(door.rect.y + door.rect.height / 2))) {
      fail(`${id}: door "${door.id}" cannot be reached from the entrance`);
    }
  }
  for (const spawn of objects.spawns) {
    if (!reachable(toTile(spawn.x), toTile(spawn.y - 1))) fail(`${id}: spawn "${spawn.id}" is cut off from the entrance`);
  }
}

const summary = [...maps].map(([id, m]) => `${id} (${m.objects.seats.length} seats, ${m.objects.doors.length} doors)`);
console.log(`Checked ${maps.size} maps: ${summary.join(', ')}`);
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('All doors, spawns and seats are consistent.');
