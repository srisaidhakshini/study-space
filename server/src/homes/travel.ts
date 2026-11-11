import { HOUSES_PER_STREET, houseNumber } from '@study/shared';

/** Where a door on a street page leads. */
export type StreetDoorTarget =
  /** A house door: the home with this house number (it may not exist). */
  | { kind: 'house'; number: number }
  /** The west end of the first street is the way back to the town. */
  | { kind: 'hub' }
  | { kind: 'street'; page: number; spawn: 'from-east' | 'from-west' }
  /** The east end of the last street. */
  | { kind: 'end' }
  | { kind: 'unknown' };

/** Which house slot a door id names ("house-3" -> 3), or null. */
export function houseSlotOfDoor(doorId: string): number | null {
  const match = /^house-(\d{1,2})$/.exec(doorId);
  if (!match) return null;
  const slot = Number(match[1]);
  return slot >= 1 && slot <= HOUSES_PER_STREET ? slot : null;
}

/** Resolves a door id on street page `page`, given the last page that has any house. */
export function streetDoorTarget(page: number, doorId: string, lastPage: number): StreetDoorTarget {
  const slot = houseSlotOfDoor(doorId);
  if (slot !== null) return { kind: 'house', number: houseNumber(page, slot) };
  if (doorId === 'west') return page <= 1 ? { kind: 'hub' } : { kind: 'street', page: page - 1, spawn: 'from-east' };
  if (doorId === 'east') return page + 1 <= lastPage ? { kind: 'street', page: page + 1, spawn: 'from-west' } : { kind: 'end' };
  return { kind: 'unknown' };
}

/** Door ids whose target is decided by the server at run time; the base maps' own targets are placeholders. */
export function isDynamicDoor(mapId: string, doorId: string): boolean {
  if (mapId === 'street') return doorId === 'west' || doorId === 'east' || houseSlotOfDoor(doorId) !== null;
  if (mapId.startsWith('home_')) return doorId === 'exit';
  return false;
}
