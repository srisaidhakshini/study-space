import {
  FURNITURE,
  getFurniture,
  getSurface,
  getTier,
  HOME_TIERS,
  homeMapId,
  isValidSurface,
  layoutError,
  MAX_PLACED_ITEMS,
  placeError,
  type HomeEditOp,
  type HomeFailure,
  type HomeInfoMessage,
  type HomeLayout,
  type InventoryMessage,
  type PlacedItem,
} from '@study/shared';
import { app } from '../../app';

/**
 * Development shortcut: try a home without a server.
 *
 *   http://localhost:5173/?home=1          walk around a furnished home (solo only)
 *   http://localhost:5173/?home=1&edit=1   the same, with edit mode on
 *
 * It fills `app.homes` with a made-up home owned by "You" and installs a stub
 * sender that applies edits locally with the same shared rules the server
 * uses, so placing, moving, rotating, removing and buying all work offline.
 * It only exists in dev builds and never runs while connected to a server.
 */
const DEV_OWNER = 'dev';

const STARTER_ITEMS: PlacedItem[] = [
  { itemId: 'desk_basic', x: 5, y: 4, rotation: 0 },
  { itemId: 'bed_single', x: 7, y: 3, rotation: 0 },
  { itemId: 'lamp_floor', x: 9, y: 3, rotation: 0 },
  { itemId: 'rug_small', x: 2, y: 5, rotation: 0 },
  { itemId: 'poster_stars', x: 2, y: 1, rotation: 0 },
  { itemId: 'window_small', x: 4, y: 0, rotation: 0 },
  { itemId: 'sofa', x: 3, y: 8, rotation: 0 },
  { itemId: 'plant_small', x: 0, y: 3, rotation: 0 },
];

/** Extra items to place in edit mode, with a few coins to shop. */
const SPARE: Record<string, number> = {
  plant_small: 3,
  rug_round: 1,
  desk_wide: 1,
  poster_cat: 2,
  lamp_wall: 1,
  table_round: 1,
  shelf_tall: 2,
  window_wide: 1,
  armchair: 1,
};

function infoOf(layout: HomeLayout, version: number, visibility: HomeInfoMessage['visibility']): HomeInfoMessage {
  return { ownerId: DEV_OWNER, ownerName: 'You', number: 1, mine: true, visibility, version, ...layout };
}

export function devHomeRequested(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get('home') === '1';
}

/** Builds the fake home and the stub sender. Returns the runtime map id to start on. */
export function installDevHome(): string {
  const owned: Record<string, number> = { ...SPARE };
  for (const placed of STARTER_ITEMS) owned[placed.itemId] = (owned[placed.itemId] ?? 0) + 1;
  const surfaces = new Set<string>(['wp_cream', 'fl_oak']);
  let coins = 900;
  let layout: HomeLayout = { tier: 1, wallpaper: 'wp_cream', floor: 'fl_oak', items: STARTER_ITEMS.map((p) => ({ ...p })) };
  let version = 1;
  let visibility: HomeInfoMessage['visibility'] = 'private';

  const publishInventory = (): void => {
    const inventory: InventoryMessage = { owned: { ...owned }, surfaces: [...surfaces], coins };
    app.homes.setInventory(inventory);
  };
  const publish = (): void => {
    version += 1;
    app.homes.setInfo(infoOf(layout, version, visibility));
    publishInventory();
  };
  const result = (op: string, failure?: HomeFailure): void => {
    app.homes.results.emit({ op, ok: !failure, ...(failure ? { reason: failure } : {}) });
  };

  const applyEdit = (clientVersion: number, edit: HomeEditOp): void => {
    if (clientVersion !== version) return result(edit.op, 'stale');
    switch (edit.op) {
      case 'place': {
        const item = getFurniture(edit.itemId);
        if (!item) return result('place', 'unknown-item');
        const placedCount = layout.items.filter((i) => i.itemId === edit.itemId).length;
        if ((owned[edit.itemId] ?? 0) - placedCount < 1) return result('place', 'not-owned');
        if (layout.items.length >= MAX_PLACED_ITEMS) return result('place', 'too-many-items');
        const placed: PlacedItem = { itemId: edit.itemId, x: edit.x, y: edit.y, rotation: edit.rotation };
        const error = placeError(layout, placed);
        if (error) return result('place', error);
        layout = { ...layout, items: [...layout.items, placed] };
        break;
      }
      case 'move': {
        const current = layout.items[edit.index];
        if (!current) return result('move', 'bad-index');
        const placed: PlacedItem = { itemId: current.itemId, x: edit.x, y: edit.y, rotation: edit.rotation };
        const error = placeError(layout, placed, edit.index);
        if (error) return result('move', error);
        layout = { ...layout, items: layout.items.map((p, i) => (i === edit.index ? placed : p)) };
        break;
      }
      case 'remove': {
        if (!layout.items[edit.index]) return result('remove', 'bad-index');
        const items = layout.items.filter((_, i) => i !== edit.index);
        if (layoutError({ ...layout, items })) return result('remove', 'blocks-room');
        layout = { ...layout, items };
        break;
      }
      case 'surface': {
        if (!isValidSurface(edit.kind, edit.id)) return result('surface', 'invalid');
        if (!surfaces.has(edit.id)) return result('surface', 'not-owned');
        layout = edit.kind === 'wallpaper' ? { ...layout, wallpaper: edit.id } : { ...layout, floor: edit.id };
        break;
      }
      case 'visibility':
        visibility = edit.visibility;
        break;
      case 'upgrade': {
        const next = HOME_TIERS[getTier(layout.tier).tier];
        if (!next) return result('upgrade', 'already-max-tier');
        if (coins < next.price) return result('upgrade', 'not-enough-coins');
        coins -= next.price;
        layout = { ...layout, tier: next.tier };
        break;
      }
    }
    result(edit.op);
    publish();
  };

  const buy = (itemId: string, quantity: number): void => {
    const qty = Math.max(1, Math.min(20, Math.floor(quantity)));
    const furniture = FURNITURE.find((f) => f.id === itemId);
    const surface = getSurface(itemId);
    const price = furniture?.price ?? surface?.price;
    if (price === undefined) return result('buy', 'unknown-item');
    if (coins < price * qty) return result('buy', 'not-enough-coins');
    coins -= price * qty;
    if (furniture) owned[itemId] = (owned[itemId] ?? 0) + qty;
    else surfaces.add(itemId);
    result('buy');
    publishInventory();
  };

  app.homes.sender = {
    enter: () => result('enter', 'unavailable'),
    edit: applyEdit,
    buy,
  };
  app.homes.setInfo(infoOf(layout, version, visibility));
  publishInventory();
  if (new URLSearchParams(window.location.search).get('edit') === '1') app.homes.setEditing(true);
  return homeMapId(DEV_OWNER);
}
