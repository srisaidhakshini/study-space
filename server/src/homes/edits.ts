import {
  HOME_TIERS,
  MAX_PLACED_ITEMS,
  VISIBILITIES,
  getFurniture,
  getTier,
  isValidSurface,
  layoutError,
  placeError,
  type HomeEditOp,
  type HomeFailure,
  type HomeLayout,
  type InventoryMessage,
  type PlacedItem,
  type Visibility,
} from '@study/shared';
import type { HomeRecord, LayoutPatch } from '../db/homes';
import { isPlainObject } from '../rooms/text';

/** The decision on an edit: refuse it, write a patch, or upgrade the room (which costs coins). */
export type EditOutcome =
  | { ok: false; reason: HomeFailure }
  | { ok: true; kind: 'patch'; patch: LayoutPatch; sideEffects: { visibility?: boolean } }
  | { ok: true; kind: 'upgrade'; nextTier: number; price: number };

export function layoutOf(home: HomeRecord): HomeLayout {
  return { tier: home.tier, wallpaper: home.wallpaper, floor: home.floor, items: home.layout };
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Reads a homeEdit message from untrusted input, or null if it is malformed. */
export function parseEditMessage(raw: unknown): { version: number; edit: HomeEditOp } | null {
  if (!isPlainObject(raw) || !isInt(raw.version) || !isPlainObject(raw.edit)) return null;
  const e = raw.edit;
  switch (e.op) {
    case 'place':
      if (typeof e.itemId !== 'string' || !isInt(e.x) || !isInt(e.y) || !isInt(e.rotation)) return null;
      return { version: raw.version, edit: { op: 'place', itemId: e.itemId, x: e.x, y: e.y, rotation: e.rotation } };
    case 'move':
      if (!isInt(e.index) || !isInt(e.x) || !isInt(e.y) || !isInt(e.rotation)) return null;
      return { version: raw.version, edit: { op: 'move', index: e.index, x: e.x, y: e.y, rotation: e.rotation } };
    case 'remove':
      if (!isInt(e.index)) return null;
      return { version: raw.version, edit: { op: 'remove', index: e.index } };
    case 'surface':
      if ((e.kind !== 'wallpaper' && e.kind !== 'floor') || typeof e.id !== 'string') return null;
      return { version: raw.version, edit: { op: 'surface', kind: e.kind, id: e.id } };
    case 'visibility':
      if (typeof e.visibility !== 'string' || !VISIBILITIES.includes(e.visibility as Visibility)) return null;
      return { version: raw.version, edit: { op: 'visibility', visibility: e.visibility as Visibility } };
    case 'upgrade':
      return { version: raw.version, edit: { op: 'upgrade' } };
    default:
      return null;
  }
}

const placedCount = (items: readonly PlacedItem[], itemId: string): number => items.filter((i) => i.itemId === itemId).length;

/**
 * Applies the shared layout rules and the ownership rules to one edit. Pure:
 * it reads the home and inventory and says what to write; the caller persists.
 */
export function evaluateEdit(home: HomeRecord, inventory: InventoryMessage, edit: HomeEditOp): EditOutcome {
  const layout = layoutOf(home);
  switch (edit.op) {
    case 'place': {
      const item = getFurniture(edit.itemId);
      if (!item) return { ok: false, reason: 'unknown-item' };
      if (layout.items.length >= MAX_PLACED_ITEMS) return { ok: false, reason: 'too-many-items' };
      if (placedCount(layout.items, edit.itemId) + 1 > (inventory.owned[edit.itemId] ?? 0)) return { ok: false, reason: 'not-owned' };
      const placed: PlacedItem = { itemId: edit.itemId, x: edit.x, y: edit.y, rotation: edit.rotation };
      const problem = placeError(layout, placed);
      if (problem) return { ok: false, reason: problem };
      return { ok: true, kind: 'patch', patch: { layout: [...layout.items, placed] }, sideEffects: {} };
    }
    case 'move': {
      const current = layout.items[edit.index];
      if (!current) return { ok: false, reason: 'bad-index' };
      const placed: PlacedItem = { itemId: current.itemId, x: edit.x, y: edit.y, rotation: edit.rotation };
      const problem = placeError(layout, placed, edit.index);
      if (problem) return { ok: false, reason: problem };
      const items = layout.items.map((item, i) => (i === edit.index ? placed : item));
      return { ok: true, kind: 'patch', patch: { layout: items }, sideEffects: {} };
    }
    case 'remove': {
      if (!layout.items[edit.index]) return { ok: false, reason: 'bad-index' };
      const items = layout.items.filter((_, i) => i !== edit.index);
      // Taking an item away can strand a seat (a chair cannot be reached once a table moves):
      // removal never makes the room less usable, but check so a bad stored layout cannot persist.
      return { ok: true, kind: 'patch', patch: { layout: items }, sideEffects: {} };
    }
    case 'surface': {
      if (!isValidSurface(edit.kind, edit.id)) return { ok: false, reason: 'unknown-item' };
      if (!inventory.surfaces.includes(edit.id)) return { ok: false, reason: 'not-owned' };
      return { ok: true, kind: 'patch', patch: edit.kind === 'wallpaper' ? { wallpaper: edit.id } : { floor: edit.id }, sideEffects: {} };
    }
    case 'visibility':
      return { ok: true, kind: 'patch', patch: { visibility: edit.visibility }, sideEffects: { visibility: true } };
    case 'upgrade': {
      if (home.tier >= HOME_TIERS.length) return { ok: false, reason: 'already-max-tier' };
      const next = getTier(home.tier + 1);
      if (layoutError({ ...layout, tier: next.tier })) return { ok: false, reason: 'blocks-room' };
      return { ok: true, kind: 'upgrade', nextTier: next.tier, price: next.price };
    }
  }
}
