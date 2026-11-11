import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseTiledMap,
  sanitizeAppearance,
  type Appearance,
  type AssetManifest,
  type DoorDef,
  type ParsedMap,
  type SeatDef,
  type SpawnDef,
} from '@study/shared';

/** A map with its objects indexed by id. */
export interface ServerMap extends ParsedMap {
  id: string;
  seats: Map<string, SeatDef>;
  doors: Map<string, DoorDef>;
  spawns: Map<string, SpawnDef>;
}

export interface WorldData {
  manifest: AssetManifest;
  maps: Map<string, ServerMap>;
  start: { map: string; spawn: SpawnDef };
  petIds: string[];
  sanitizeAppearance(input: Partial<Appearance> | null | undefined): Appearance;
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Folder holding assets.json; override with ASSETS_DIR (used by the Docker image). */
export function assetsDir(): string {
  return process.env.ASSETS_DIR ? resolve(process.env.ASSETS_DIR) : join(REPO_ROOT, 'client/public/assets');
}

function indexBy<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

function load(): WorldData {
  const dir = assetsDir();
  const manifestPath = join(dir, 'assets.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath}. Run "npm run assets" from the repository root first.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as AssetManifest;

  const maps = new Map<string, ServerMap>();
  for (const [id, entry] of Object.entries(manifest.maps)) {
    const parsed = parseTiledMap(JSON.parse(readFileSync(join(dir, entry.path), 'utf8')));
    maps.set(id, {
      ...parsed,
      id,
      seats: indexBy(parsed.objects.seats),
      doors: indexBy(parsed.objects.doors),
      spawns: indexBy(parsed.objects.spawns),
    });
  }

  const startMap = maps.get(manifest.start.map);
  const startSpawn = startMap?.spawns.get(manifest.start.spawn);
  if (!startMap || !startSpawn) {
    throw new Error(`Start spawn "${manifest.start.map}/${manifest.start.spawn}" does not exist in the map files.`);
  }

  // A door must lead somewhere real, or a player could be teleported into the void.
  // Doors to maps that are not built yet are dropped (with a warning) rather than
  // stopping the server, so content can be added one map at a time.
  for (const map of maps.values()) {
    for (const door of [...map.doors.values()]) {
      if (maps.get(door.targetMap)?.spawns.has(door.targetSpawn)) continue;
      console.warn(`[maps] Door "${door.id}" in "${map.id}" targets missing spawn "${door.targetMap}/${door.targetSpawn}"; ignoring it.`);
      map.doors.delete(door.id);
    }
  }

  return {
    manifest,
    maps,
    start: { map: startMap.id, spawn: startSpawn },
    petIds: manifest.pets.map((p) => p.id),
    sanitizeAppearance: (input) => sanitizeAppearance(manifest.character, input),
  };
}

let cached: WorldData | null = null;

/** The loaded maps and manifest. Throws a readable error if assets are missing. */
export function getWorld(): WorldData {
  cached ??= load();
  return cached;
}
