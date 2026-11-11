import { getFurniture, homeCollision, homeMapId, homeSeats, streetMapId, type HomeLayout, type SeatDef } from '@study/shared';
import type { ServerMap, WorldData } from './maps';

/**
 * Maps that are made at run time from a shared base map: a street page is a
 * copy of the `street` map under the id `street:<n>`, and a home is the
 * room of its tier with collision and seats computed from its furniture.
 */

const streetPages = new Map<number, ServerMap>();

/** The map of one street page. The pages share every object; only the id differs. */
export function streetPageMap(world: WorldData, page: number): ServerMap {
  let map = streetPages.get(page);
  if (!map) {
    const base = world.maps.get('street');
    if (!base) throw new Error('The "street" base map is missing.');
    map = { ...base, id: streetMapId(page) };
    streetPages.set(page, map);
  }
  return map;
}

/** The map of one home, for its current layout. */
export function homeRuntimeMap(world: WorldData, ownerId: string, layout: HomeLayout): ServerMap {
  const base = world.maps.get(`home_${layout.tier}`);
  if (!base) throw new Error(`The "home_${layout.tier}" base map is missing.`);
  const collision = homeCollision(layout);
  const seats: SeatDef[] = homeSeats(layout);
  return {
    ...base,
    id: homeMapId(ownerId),
    width: collision.width,
    height: collision.height,
    collision,
    objects: { ...base.objects, seats },
    seats: new Map(seats.map((s) => [s.id, s])),
  };
}

/** Glow radius (pixels) of the lit furniture in a layout, for clients that light the room. */
export function glowingItems(layout: HomeLayout): number {
  let count = 0;
  for (const placed of layout.items) if (getFurniture(placed.itemId)?.glow) count += 1;
  return count;
}
