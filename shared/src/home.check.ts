/** Quick checks of the home layout rules:  npx tsx shared/src/home.check.ts */
import { FURNITURE, SURFACES, getFurniture, starterInventory } from './furniture';
import {
  WALL_ROWS,
  defaultLayout,
  homeCollision,
  homeEntryTile,
  homeSeats,
  itemCells,
  layoutError,
  placeError,
  rotateCell,
  rotateFacing,
  streetPageOf,
  slotOf,
  houseNumber,
  parseMapId,
  homeMapId,
  type HomeLayout,
  type PlacedItem,
} from './home';
import { isBlocked } from './collision';

let failed = 0;
const check = (name: string, ok: boolean): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed += 1;
};

// Catalog sanity
check('item ids are unique', new Set(FURNITURE.map((f) => f.id)).size === FURNITURE.length);
check('surface ids are unique', new Set(SURFACES.map((s) => s.id)).size === SURFACES.length);
check(
  'every seat lies inside its item footprint',
  FURNITURE.every((f) => f.seats.every((s) => s.dx >= 0 && s.dx < f.w && s.dy >= 0 && s.dy < f.h)),
);
check('starter items exist and cost nothing', Object.keys(starterInventory()).every((id) => getFurniture(id)?.price === 0));
check('wall items fit in the wall rows', FURNITURE.filter((f) => f.placement === 'wall').every((f) => f.h <= WALL_ROWS));

// Rotation maps every cell to a distinct cell inside the rotated footprint
for (const f of FURNITURE) {
  for (let r = 0; r < 4; r++) {
    const cells = new Set<string>();
    const w = r % 2 ? f.h : f.w;
    const h = r % 2 ? f.w : f.h;
    let inside = true;
    for (let dy = 0; dy < f.h; dy++) {
      for (let dx = 0; dx < f.w; dx++) {
        const c = rotateCell(f, dx, dy, r);
        if (c.dx < 0 || c.dx >= w || c.dy < 0 || c.dy >= h) inside = false;
        cells.add(`${c.dx},${c.dy}`);
      }
    }
    if (!inside || cells.size !== f.w * f.h) {
      check(`rotation ${r} of ${f.id} is a bijection onto its footprint`, false);
    }
  }
}
check('four quarter turns face the same way again', rotateFacing('down', 4) === 'down' && rotateFacing('down', 1) === 'left');

// A starter-style layout
const desk: PlacedItem = { itemId: 'desk_basic', x: 5, y: 4, rotation: 0 };
const bed: PlacedItem = { itemId: 'bed_single', x: 8, y: 3, rotation: 0 };
const layout: HomeLayout = { ...defaultLayout(), items: [desk, bed] };
check('starter layout is valid', layoutError(layout) === null);
const chairs = homeSeats(layout).filter((seat) => seat.kind === 'chair');
check('a desk provides one seat facing the desk', chairs.length === 1 && chairs[0]!.facing === 'up');
const seat = chairs[0]!;
check('the seat sits on its tile (solid)', isBlocked(homeCollision(layout), seat.tx, seat.ty));
check('the entry tile is walkable', !isBlocked(homeCollision(layout), homeEntryTile(layout).tx, homeEntryTile(layout).ty));

// Rules
check('overlap is refused', placeError(layout, { itemId: 'desk_basic', x: 5, y: 4, rotation: 0 }) === 'overlap');
check('outside the room is refused', placeError(layout, { itemId: 'bed_single', x: 9, y: 4, rotation: 0 }) === 'out-of-room');
check('floor furniture cannot go on the wall', placeError(layout, { itemId: 'plant_small', x: 0, y: 1, rotation: 0 }) === 'not-on-floor');
check('posters must be on the wall', placeError(layout, { itemId: 'poster_stars', x: 2, y: 4, rotation: 0 }) === 'not-on-wall');
check('a poster fits on the wall', placeError(layout, { itemId: 'poster_stars', x: 2, y: 1, rotation: 0 }) === null);
check('wall items cannot be rotated', placeError(layout, { itemId: 'poster_stars', x: 2, y: 1, rotation: 1 }) === 'bad-rotation');
check('the door entrance stays clear', placeError(layout, { itemId: 'plant_small', x: 0, y: WALL_ROWS + 5, rotation: 0 }) === 'blocks-door');
check('rugs may lie under furniture', placeError({ ...layout }, { itemId: 'rug_small', x: 5, y: 4, rotation: 0 }) === null);
check('moving an item ignores its old place', placeError(layout, { ...desk, x: 6 }, 0) === null);

// Walling in a seat is refused
const walled: HomeLayout = {
  ...defaultLayout(),
  items: [
    { itemId: 'desk_basic', x: 0, y: 3, rotation: 0 },
    { itemId: 'shelf_low', x: 0, y: 5, rotation: 0 },
    { itemId: 'plant_small', x: 1, y: 5, rotation: 0 },
  ],
};
check('a seat boxed in by furniture is refused', layoutError(walled) !== null);

// A rotated desk turns its seat
const sideways: HomeLayout = { ...defaultLayout(), items: [{ itemId: 'desk_basic', x: 4, y: 4, rotation: 1 }] };
check('a rotated desk has a valid layout', layoutError(sideways) === null);
check('quarter turn moves the seat and the facing', homeSeats(sideways)[0]!.facing === 'right' || homeSeats(sideways)[0]!.facing === 'left');
check('itemCells matches the rotated footprint', itemCells(getFurniture('desk_basic')!, 4, 4, 1).length === 4);

// Map ids and street arithmetic
for (const rotation of [0, 1, 2, 3]) {
  for (const [itemId, capacity] of [['bed_single', 1], ['bed_double', 2]] as const) {
    const spots = homeSeats({ ...layout, items: [{ itemId, x: 3, y: 3, rotation }] });
    check(`${itemId} holds ${capacity} at rotation ${rotation}`,
      spots.length === capacity && spots.every((spot) => spot.kind === 'bed') &&
      new Set(spots.map((spot) => spot.id)).size === capacity);
  }
}
check('house numbers round-trip', slotOf(houseNumber(3, 5)) === 5 && streetPageOf(houseNumber(3, 5)) === 3);
check('map ids parse', parseMapId(homeMapId('abc')).kind === 'home' && parseMapId('street:4').kind === 'street' && parseMapId('hub').kind === 'place');

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll home checks passed.');
