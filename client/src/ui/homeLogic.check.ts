/** Checks of the Home panel's pure helpers:  npx tsx client/src/ui/homeLogic.check.ts */
import { FURNITURE, SURFACES, getFurniture, type HomeFailure, type HomeInfoMessage, type InventoryMessage } from '@study/shared';
import {
  CATEGORY_ORDER,
  affordability,
  canTurn,
  groupByCategory,
  nextRotation,
  nextTier,
  ownedCards,
  ownedSurfaceIds,
  placedCount,
  rotateInPlace,
  shopEntries,
} from './homeLogic';
import { ALL_HOME_REASONS, HOME_FAILURE_TEXT, homeFailureText, visibilityLabel } from './homeText';

let failed = 0;
const check = (name: string, ok: boolean): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed += 1;
};

// Failure wording covers every HomeFailure in the shared protocol.
const failures: HomeFailure[] = [
  'not-signed-in', 'not-owner', 'not-in-home', 'stale', 'unknown-item', 'bad-rotation', 'out-of-room', 'not-on-wall',
  'not-on-floor', 'overlap', 'blocks-door', 'blocks-room', 'not-owned', 'not-enough-coins', 'too-many-items',
  'bad-index', 'already-max-tier', 'invalid', 'unavailable',
];
check('every HomeFailure has readable text', failures.every((f) => (HOME_FAILURE_TEXT[f] ?? '').length > 8));
check('visit refusals have text', ['private', 'friends-only', 'no-such-home'].every((r) => homeFailureText(r).length > 8));
check('texts are distinct', new Set(ALL_HOME_REASONS.map((r) => HOME_FAILURE_TEXT[r])).size === ALL_HOME_REASONS.length);
check('an unknown reason falls back politely', homeFailureText('???') === homeFailureText(undefined));
check('private is worded', homeFailureText('private') === 'That home is private.');
check('friends-only is worded', homeFailureText('friends-only') === "Only the owner's friends can visit.");
check('no-such-home is worded', homeFailureText('no-such-home') === 'No one lives there yet.');
check('visibility labels', visibilityLabel('friends') === 'Friends only' && visibilityLabel('open') === 'Open');

// Grouping covers the whole catalog and respects the order
const groups = groupByCategory(FURNITURE, (f) => f.category);
check('grouping keeps every item', groups.reduce((n, g) => n + g.entries.length, 0) === FURNITURE.length);
check('every category is in the display order', FURNITURE.every((f) => CATEGORY_ORDER.includes(f.category)));
check('groups come in display order', groups.map((g) => g.category).join() === CATEGORY_ORDER.filter((c) => groups.some((g) => g.category === c)).join());

// Affordability
check('exact change is enough', affordability(100, 50, 2).canBuy);
check('one coin short', affordability(99, 50, 2).missing === 1 && !affordability(99, 50, 2).canBuy);
check('quantity below one counts as one', affordability(10, 10, 0).total === 10);
check('negative coins are treated as none', affordability(-5, 10, 1).missing === 10);

// Inventory and shop
const inventory: InventoryMessage = { owned: { desk_basic: 1, plant_small: 3 }, surfaces: ['wp_sage'], coins: 120 };
const info: Pick<HomeInfoMessage, 'tier' | 'wallpaper' | 'floor' | 'items'> = {
  tier: 1,
  wallpaper: 'wp_cream',
  floor: 'fl_oak',
  items: [
    { itemId: 'desk_basic', x: 5, y: 4, rotation: 0 },
    { itemId: 'plant_small', x: 1, y: 3, rotation: 0 },
    { itemId: 'plant_small', x: 9, y: 3, rotation: 0 },
  ],
};
const cards = ownedCards(inventory, info.items);
check('owned cards list only owned items', cards.length === 2);
check('free copies are owned minus placed', cards.find((c) => c.item.id === 'plant_small')?.free === 1 && cards.find((c) => c.item.id === 'desk_basic')?.free === 0);
check('placed count', placedCount(info.items, 'plant_small') === 2);
check('no inventory means no cards', ownedCards(null, []).length === 0);
check('free surfaces always count as owned', ownedSurfaceIds(null).has('wp_cream') && ownedSurfaceIds(null).has('fl_oak'));
check('bought surfaces count as owned', ownedSurfaceIds(inventory).has('wp_sage'));
const shop = shopEntries(inventory);
check('the shop skips starter freebies', shop.every((e) => e.price > 0));
check('the shop skips surfaces you own', !shop.some((e) => e.kind === 'surface' && e.id === 'wp_sage'));
check('the shop lists furniture you already own (you may want more)', shop.some((e) => e.id === 'desk_wide') && FURNITURE.filter((f) => f.price > 0).length === shop.filter((e) => e.kind === 'furniture').length);
check('every unowned surface is for sale', SURFACES.filter((s) => s.price > 0 && s.id !== 'wp_sage').every((s) => shop.some((e) => e.id === s.id)));

// Tiers and rotation
check('tier 1 upgrades to tier 2', nextTier(1)?.tier === 2);
check('the biggest tier has no upgrade', nextTier(3) === null);
const desk = getFurniture('desk_basic')!;
const poster = getFurniture('poster_stars')!;
const rug = getFurniture('rug_rect')!;
check('a desk turns through four views', [0, 1, 2, 3].map((r) => nextRotation(desk, r)).join() === '1,2,3,0');
check('a wall poster cannot turn', !canTurn(poster) && nextRotation(poster, 0) === 0);
check('a rug with two views toggles', nextRotation(rug, 0) === 1 && nextRotation(rug, 1) === 0);
const turned = rotateInPlace(info, 0);
check('a desk with room to turn may turn', turned?.ok === true && turned.placed.rotation === 1);
const cramped = rotateInPlace(
  {
    ...info,
    items: [
      { itemId: 'bed_single', x: 8, y: 3, rotation: 0 },
      { itemId: 'plant_small', x: 7, y: 3, rotation: 0 },
      { itemId: 'plant_small', x: 7, y: 4, rotation: 0 },
    ],
  },
  0,
);
check('turning into the wall is refused with a reason', cramped?.ok === false && cramped.error !== null);
check('a missing index gives nothing', rotateInPlace(info, 9) === null);
const nudged = rotateInPlace({ ...info, items: [{ itemId: 'bed_single', x: 8, y: 3, rotation: 0 }] }, 0);
check('a bed against the right wall turns around its centre (nudged left)', nudged?.ok === true && nudged.placed.x === 7 && nudged.placed.rotation === 1);

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll home panel checks passed.');
