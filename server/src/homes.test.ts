/**
 * Player homes, the shop, friends and the residential street. Needs Postgres
 * (`docker compose up -d db` and `npm run db:migrate -w server`). Every test
 * user has a unique "@example.test" email and is deleted at the end (their
 * homes, inventory and friendships go with them); nothing else is touched.
 * Run with `npm run test:db -w server`.
 */
import { Client, type Room } from '@colyseus/sdk';
import {
  C2S,
  DOOR_MARGIN,
  FEET_ANCHOR,
  HOUSES_PER_STREET,
  S2C,
  TILE,
  coinsForMinutes,
  defaultAppearance,
  findPath,
  getTier,
  homeCollision,
  homeMapId,
  homeSeats,
  houseNumber,
  layoutError,
  slotOf,
  starterInventory,
  streetPageOf,
  type AuthResponse,
  type CollisionGrid,
  type FriendsResponse,
  type HomeEditOp,
  type HomeInfoMessage,
  type HomeLayout,
  type HomeResultMessage,
  type InventoryMessage,
  type NoticeMessage,
  type PlayerSnapshot,
  type StatsMessage,
  type StreetInfoMessage,
  type TeleportMessage,
} from '@study/shared';
import { resetRateLimits } from './api/accountRoutes';
import { resetFriendLimits } from './api/friendRoutes';
import { closeDb, db } from './db/client';
import { buy, ensureHome, loadHome, parseLayout } from './db/homes';
import { createServer } from './createServer';
import { evaluateEdit } from './homes/edits';
import { starterLayout } from './homes/starter';
import { houseSlotOfDoor, streetDoorTarget } from './homes/travel';
import { getWorld } from './world/maps';

const PORT = 20000 + Math.floor(Math.random() * 20000);
const HTTP = `http://localhost:${PORT}`;
const RUN = Math.random().toString(36).slice(2, 8);

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function until(cond: () => boolean | Promise<boolean>, ms = 4000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return true;
    await sleep(40);
  }
  return cond();
}

let emailCounter = 0;
const newEmail = (): string => `t-${RUN}-${++emailCounter}@example.test`;
const PASSWORD = 'correct horse battery';

interface Reply<T = Record<string, unknown>> {
  status: number;
  json: T;
}

async function api<T = Record<string, unknown>>(method: string, path: string, body?: unknown, token?: string): Promise<Reply<T>> {
  const res = await fetch(`${HTTP}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as T };
}

async function register(name: string): Promise<{ email: string; name: string; id: string; token: string }> {
  const email = newEmail();
  const { status, json } = await api<AuthResponse>('POST', '/api/auth/register', { email, password: PASSWORD, name });
  if (status !== 201) throw new Error(`register failed: ${status} ${JSON.stringify(json)}`);
  return { email, name, id: json.account.id, token: json.token };
}

const world = getWorld();
let seq = 0;
let clockOffset = 0;
const MIN = 60_000;

interface Player {
  room: Room;
  id: string;
  userId: string | null;
  x: number;
  y: number;
  map: string;
  /** Index in `log` up to which teleports have been applied to x, y and map. */
  syncedAt: number;
  log: { type: string | number; message: unknown }[];
  snapshot(): PlayerSnapshot | undefined;
  messages<T>(type: string): T[];
}

/** Joins an instance of "Maple" (the fullest one with room, so repeat joins share it). */
async function join(token?: string, userId: string | null = null): Promise<Player> {
  const res = await api<{ roomId: string }>('POST', '/api/join', { server: 'Maple' });
  const room = await new Client(`ws://localhost:${PORT}`).joinById(res.json.roomId, {
    name: 'Visitor',
    appearance: defaultAppearance(world.manifest.character),
    pet: 'cat',
    tzOffsetMin: 0,
    ...(token ? { token } : {}),
  });
  const log: Player['log'] = [];
  room.onMessage('*', (type, message) => log.push({ type, message }));
  const p: Player = {
    room,
    id: room.sessionId,
    userId,
    x: 0,
    y: 0,
    map: '',
    syncedAt: 0,
    log,
    snapshot: () => (room.state as { players: Map<string, PlayerSnapshot> }).players?.get(room.sessionId),
    messages: <T>(type: string) => log.filter((m) => m.type === type).map((m) => m.message as T),
  };
  await until(() => p.snapshot() !== undefined && log.some((m) => m.type === S2C.welcome));
  const welcome = log.find((m) => m.type === S2C.welcome)!.message as { x: number; y: number; map: string };
  p.x = welcome.x;
  p.y = welcome.y;
  p.map = welcome.map;
  if (token) await until(() => p.messages(S2C.inventory).length > 0 && p.messages(S2C.stats).length > 0, 6000);
  return p;
}

/** Applies any teleports the server sent since last time (doors, kicks, standing up). */
function sync(p: Player): void {
  for (let i = p.syncedAt; i < p.log.length; i++) {
    const entry = p.log[i]!;
    if (entry.type !== S2C.teleport) continue;
    const t = entry.message as TeleportMessage;
    p.x = t.x;
    p.y = t.y;
    p.map = t.map;
  }
  p.syncedAt = p.log.length;
}

const lastOf = <T>(p: Player, type: string): T | undefined => p.messages<T>(type).at(-1);
const homeOf = (p: Player): HomeInfoMessage | undefined => lastOf<HomeInfoMessage>(p, S2C.homeInfo);

function gridOf(p: Player): CollisionGrid {
  sync(p);
  if (p.map.startsWith('home:')) {
    const info = homeOf(p)!;
    return homeCollision({ tier: info.tier, wallpaper: info.wallpaper, floor: info.floor, items: info.items });
  }
  if (p.map.startsWith('street:')) return world.maps.get('street')!.collision;
  return world.maps.get(p.map)!.collision;
}

/** Walks along a path of 30 px steps, the way a client would. */
async function walkOn(p: Player, tx: number, ty: number): Promise<void> {
  const grid = gridOf(p);
  const route = findPath(grid, { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) }, { x: tx, y: ty });
  if (!route) throw new Error(`no path to ${p.map} ${tx},${ty}`);
  for (const step of route.slice(1)) {
    const targetX = step.x * TILE + TILE / 2;
    const targetY = step.y * TILE + FEET_ANCHOR.y;
    for (;;) {
      const dist = Math.hypot(targetX - p.x, targetY - p.y);
      if (dist < 0.01) break;
      const k = Math.min(1, 30 / dist);
      p.x += (targetX - p.x) * k;
      p.y += (targetY - p.y) * k;
      p.room.send(C2S.move, { seq: ++seq, x: p.x, y: p.y, dir: 'down', moving: true });
      await sleep(260);
    }
  }
}

/** Walks to a free tile beside (tx, ty) and returns once there. */
async function walkNextTo(p: Player, tx: number, ty: number): Promise<void> {
  const grid = gridOf(p);
  const spots = ([[0, 1], [0, -1], [1, 0], [-1, 0]] as const)
    .map(([dx, dy]) => ({ x: tx + dx, y: ty + dy }))
    .filter((c) => !grid.blocked[c.y * grid.width + c.x]);
  for (const spot of spots) {
    if (findPath(grid, { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) }, spot)) return walkOn(p, spot.x, spot.y);
  }
  throw new Error(`nowhere to stand next to ${tx},${ty}`);
}

/** Walks to the door of the current map and returns its id's rect centre reached. */
async function walkToDoor(p: Player, doorId: string): Promise<void> {
  const base = p.map.startsWith('home:') ? world.maps.get(`home_${homeOf(p)!.tier}`)! : p.map.startsWith('street:') ? world.maps.get('street')! : world.maps.get(p.map)!;
  const door = base.doors.get(doorId);
  if (!door) throw new Error(`no door ${doorId} on ${p.map}`);
  const grid = gridOf(p);
  const cx = door.rect.x + door.rect.width / 2;
  const cy = door.rect.y + door.rect.height / 2;
  const candidates: { x: number; y: number; d: number }[] = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const tx = Math.floor(cx / TILE) + dx;
      const ty = Math.floor(cy / TILE) + dy;
      if (tx < 0 || ty < 0 || tx >= grid.width || ty >= grid.height || grid.blocked[ty * grid.width + tx]) continue;
      const fx = tx * TILE + TILE / 2;
      const fy = ty * TILE + FEET_ANCHOR.y;
      const inside = fx >= door.rect.x - DOOR_MARGIN + 4 && fx <= door.rect.x + door.rect.width + DOOR_MARGIN - 4 && fy >= door.rect.y - DOOR_MARGIN + 4 && fy <= door.rect.y + door.rect.height + DOOR_MARGIN - 4;
      if (inside) candidates.push({ x: tx, y: ty, d: Math.hypot(fx - cx, fy - cy) });
    }
  }
  candidates.sort((a, b) => a.d - b.d);
  const pick = candidates[0];
  if (!pick) throw new Error(`no standable spot at door ${doorId} on ${p.map}`);
  await walkOn(p, pick.x, pick.y);
}

/** Sends a message and waits for the next messages of a type after it. */
async function ask<T>(p: Player, send: () => void, type: string, count = 1, ms = 5000): Promise<T[]> {
  const before = p.messages(type).length;
  send();
  await until(() => p.messages(type).length >= before + count, ms);
  return p.messages<T>(type).slice(before);
}

const result = async (p: Player, send: () => void): Promise<HomeResultMessage | undefined> => (await ask<HomeResultMessage>(p, send, S2C.homeResult))[0];

const edit = (p: Player, op: HomeEditOp, version = homeOf(p)?.version ?? 0): Promise<HomeResultMessage | undefined> =>
  result(p, () => p.room.send(C2S.homeEdit, { version, edit: op }));

const buyMsg = (p: Player, itemId: string, quantity = 1): Promise<HomeResultMessage | undefined> =>
  result(p, () => p.room.send(C2S.shopBuy, { itemId, quantity }));

/** Enters a home and reports whether homeInfo arrived before the teleport. */
async function enterHome(p: Player, ownerId: string): Promise<{ result: HomeResultMessage | undefined; infoFirst: boolean }> {
  const before = p.log.length;
  const res = await result(p, () => p.room.send(C2S.homeEnter, { ownerId }));
  await sleep(120);
  const fresh = p.log.slice(before);
  const infoAt = fresh.findIndex((m) => m.type === S2C.homeInfo);
  const teleportAt = fresh.findIndex((m) => m.type === S2C.teleport);
  sync(p);
  return { result: res, infoFirst: infoAt !== -1 && teleportAt !== -1 && infoAt < teleportAt };
}

async function useDoor(p: Player, doorId: string): Promise<TeleportMessage | undefined> {
  await walkToDoor(p, doorId);
  const [t] = await ask<TeleportMessage>(p, () => p.room.send(C2S.door, { doorId }), S2C.teleport, 1, 3000);
  sync(p);
  return t;
}

async function main(): Promise<void> {
  const prisma = db();
  try {
    await prisma.$queryRaw`SELECT 1`;
    await prisma.home.count();
  } catch {
    console.error('Cannot reach Postgres or the homes tables are missing. Run "docker compose up -d db" and "npm run db:migrate -w server".');
    process.exit(1);
  }

  const grant = async (userId: string, amount: number): Promise<void> => {
    await prisma.$transaction([
      prisma.coinTransaction.create({ data: { userId, amount, reason: 'test-grant' } }),
      prisma.user.update({ where: { id: userId }, data: { coins: { increment: amount } } }),
    ]);
  };
  const coinsOf = async (userId: string): Promise<number> => (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coins;

  let game = createServer({ testClock: () => Date.now() + clockOffset });
  await game.listen(PORT);
  const players: Player[] = [];
  const track = <T extends Player>(p: T): T => {
    players.push(p);
    return p;
  };

  try {
    // ---- pure rules ---------------------------------------------------------------------
    {
      check('(unit) the starter layout is valid', layoutError(starterLayout()) === null);
      check('(unit) house doors parse', houseSlotOfDoor('house-3') === 3 && houseSlotOfDoor('house-12') === 12 && houseSlotOfDoor('house-13') === null && houseSlotOfDoor('west') === null);
      check('(unit) a house door names the house number of its page', JSON.stringify(streetDoorTarget(3, 'house-5', 3)) === JSON.stringify({ kind: 'house', number: houseNumber(3, 5) }));
      check('(unit) west on the first street leads to town', streetDoorTarget(1, 'west', 4).kind === 'hub');
      check('(unit) west on a later street goes back a page', JSON.stringify(streetDoorTarget(3, 'west', 4)) === JSON.stringify({ kind: 'street', page: 2, spawn: 'from-east' }));
      check('(unit) east goes forward only if that street has houses', JSON.stringify(streetDoorTarget(2, 'east', 3)) === JSON.stringify({ kind: 'street', page: 3, spawn: 'from-west' }) && streetDoorTarget(3, 'east', 3).kind === 'end');
      check('(unit) an unknown door is not resolved', streetDoorTarget(1, 'back-door', 1).kind === 'unknown');
      check('(unit) street arithmetic round-trips', streetPageOf(houseNumber(4, 7)) === 4 && slotOf(houseNumber(4, 7)) === 7);
      const base = { id: 'h', ownerId: 'o', ownerName: 'O', number: 1, tier: 1, visibility: 'friends' as const, wallpaper: 'wp_cream', floor: 'fl_oak', layout: starterLayout().items, version: 0 };
      const poor: InventoryMessage = { owned: starterInventory(), surfaces: ['wp_cream', 'fl_oak'], coins: 0 };
      const refusal = evaluateEdit(base, poor, { op: 'place', itemId: 'sofa', x: 0, y: 4, rotation: 0 });
      check('(unit) an edit for something not owned is refused', !refusal.ok && refusal.reason === 'not-owned');
    }

    // ---- first home and starter furniture ---------------------------------------------------
    resetRateLimits();
    resetFriendLimits();
    const aInfo = await register(`Aoi${RUN}`);
    const bInfo = await register(`Bea${RUN}`);
    const cInfo = await register(`Cam${RUN}`);
    const a = track(await join(aInfo.token, aInfo.id));
    const inv = lastOf<InventoryMessage>(a, S2C.inventory)!;
    const starter = starterInventory();
    check('joining sends the starter furniture', Object.entries(starter).every(([id, n]) => inv.owned[id] === n) && Object.keys(inv.owned).length === Object.keys(starter).length);
    check('the default wallpaper and floor are owned', inv.surfaces.includes('wp_cream') && inv.surfaces.includes('fl_oak') && inv.coins === 0);
    const row = await prisma.home.findUnique({ where: { ownerId: aInfo.id } });
    check('a home was created with a house number and a valid starter layout', !!row && row.number > 0 && row.version === 0 && row.visibility === 'FRIENDS' && layoutError({ tier: 1, wallpaper: row.wallpaper, floor: row.floor, items: parseLayout(row.layout) }) === null);
    await a.room.leave();
    players.splice(players.indexOf(a), 1);
    const a1 = track(await join(aInfo.token, aInfo.id));
    check('rejoining does not grant the starter furniture twice', (await prisma.inventoryItem.count({ where: { userId: aInfo.id } })) === Object.keys(starter).length && (await prisma.home.count({ where: { ownerId: aInfo.id } })) === 1);
    const bPlayer = track(await join(bInfo.token, bInfo.id));
    const cPlayer = track(await join(cInfo.token, cInfo.id));
    const guest = track(await join());

    // ---- the shop -----------------------------------------------------------------------------
    check('buying without coins is refused', (await buyMsg(a1, 'plant_tall'))?.reason === 'not-enough-coins');
    check('buying an unknown item is refused', (await buyMsg(a1, 'golden-throne'))?.reason === 'unknown-item');
    check('a starter item is not for sale', (await buyMsg(a1, 'desk_basic'))?.reason === 'invalid');
    check('a bad quantity is refused', (await buyMsg(a1, 'plant_tall', 0))?.reason === 'invalid' && (await buyMsg(a1, 'plant_tall', 21))?.reason === 'invalid');
    await grant(aInfo.id, 1000);
    const bought = await buyMsg(a1, 'plant_tall', 4);
    await until(() => (lastOf<StatsMessage>(a1, S2C.stats)?.coins ?? 0) === 1000 - 4 * 45);
    check('buying takes the price from the coins', bought?.ok === true && (await coinsOf(aInfo.id)) === 1000 - 4 * 45);
    check('the inventory and stats are pushed after a purchase', lastOf<InventoryMessage>(a1, S2C.inventory)?.owned.plant_tall === 4 && lastOf<StatsMessage>(a1, S2C.stats)?.coins === 820);
    check('a wallpaper can be bought once', (await buyMsg(a1, 'wp_sage'))?.ok === true && (await buyMsg(a1, 'wp_sage'))?.reason === 'invalid' && lastOf<InventoryMessage>(a1, S2C.inventory)?.surfaces.includes('wp_sage') === true);
    check('the default surface is not for sale', (await buyMsg(a1, 'wp_cream'))?.reason === 'invalid');
    const ledgerOf = async (userId: string): Promise<number> => (await prisma.coinTransaction.aggregate({ where: { userId }, _sum: { amount: true } }))._sum.amount ?? 0;
    check('the ledger equals the balance after purchases', (await ledgerOf(aInfo.id)) === (await coinsOf(aInfo.id)));
    const reasons = (await prisma.coinTransaction.findMany({ where: { userId: aInfo.id, amount: { lt: 0 } } })).map((t) => t.reason);
    check('purchases are recorded as negative ledger rows', reasons.includes('buy:plant_tall') && reasons.includes('surface:wp_sage'));

    // two buys at once cannot overspend (database level, then through the room)
    const poor = await register(`Poor${RUN}`);
    await ensureHome(poor.id);
    await grant(poor.id, 100);
    const racers = await Promise.all([buy(poor.id, 'plant_big', 1), buy(poor.id, 'plant_big', 1), buy(poor.id, 'plant_big', 1)]);
    check('parallel purchases cannot overspend (database)', racers.filter((r) => r.ok).length === 1 && (await coinsOf(poor.id)) === 10 && (await ledgerOf(poor.id)) === 10);
    const poor2 = await register(`Poor2${RUN}`);
    const poorPlayer = track(await join(poor2.token, poor2.id));
    await grant(poor2.id, 100);
    const raced = await ask<HomeResultMessage>(poorPlayer, () => {
      for (let i = 0; i < 3; i++) poorPlayer.room.send(C2S.shopBuy, { itemId: 'plant_big', quantity: 1 });
    }, S2C.homeResult, 3);
    check('parallel purchases cannot overspend (room)', raced.filter((r) => r.ok).length === 1 && raced.filter((r) => r.reason === 'not-enough-coins').length === 2 && (await coinsOf(poor2.id)) === 10);

    // ---- entering the home and editing it -----------------------------------------------------------
    const entered = await enterHome(a1, aInfo.id);
    check('entering your own home works', entered.result?.ok === true && a1.map === homeMapId(aInfo.id) && homeOf(a1)?.mine === true);
    check('homeInfo arrives before the teleport into a home', entered.infoFirst);
    check('the player stands at the entrance of the room', Math.floor(a1.y / TILE) === homeCollision(starterLayout()).height - 2);
    const layout0 = homeOf(a1)!;
    check('the home info carries the number, name and layout', layout0.number > 0 && layout0.ownerName === aInfo.name && layout0.items.length === starterLayout().items.length && layout0.tier === 1);

    const v0 = homeOf(a1)!.version;
    check('placing an owned item works', (await edit(a1, { op: 'place', itemId: 'plant_tall', x: 9, y: 6, rotation: 0 }))?.ok === true);
    await until(() => (homeOf(a1)?.version ?? 0) > v0);
    check('the layout version goes up and everyone gets the new layout', homeOf(a1)!.version === v0 + 1 && homeOf(a1)!.items.length === layout0.items.length + 1);
    check('an overlapping item is refused', (await edit(a1, { op: 'place', itemId: 'plant_tall', x: 9, y: 6, rotation: 0 }))?.reason === 'overlap');
    check('an item outside the room is refused', (await edit(a1, { op: 'place', itemId: 'plant_tall', x: 10, y: 5, rotation: 0 }))?.reason === 'out-of-room');
    check('the door entrance cannot be blocked', (await edit(a1, { op: 'place', itemId: 'plant_tall', x: 0, y: 8, rotation: 0 }))?.reason === 'blocks-door');
    check('furniture that is not owned is refused', (await edit(a1, { op: 'place', itemId: 'bed_double', x: 0, y: 3, rotation: 0 }))?.reason === 'not-owned');
    check('an unknown item is refused', (await edit(a1, { op: 'place', itemId: 'moon-lamp', x: 0, y: 3, rotation: 0 }))?.reason === 'unknown-item');
    check('a rotation the item does not have is refused', (await edit(a1, { op: 'place', itemId: 'plant_tall', x: 5, y: 7, rotation: 2 }))?.reason === 'bad-rotation');
    check('floor furniture cannot hang on the wall', (await edit(a1, { op: 'place', itemId: 'plant_tall', x: 5, y: 1, rotation: 0 }))?.reason === 'not-on-floor');
    check('a malformed edit is refused', (await edit(a1, { op: 'place', itemId: 'plant_tall', x: 1.5, y: 7, rotation: 0 } as HomeEditOp))?.reason === 'invalid');

    check('a second plant fits beside the chair', (await edit(a1, { op: 'place', itemId: 'plant_tall', x: 2, y: 4, rotation: 0 }))?.ok === true);
    check('walling in the desk chair is refused', (await edit(a1, { op: 'place', itemId: 'plant_tall', x: 3, y: 5, rotation: 0 }))?.reason === 'blocks-room');
    const plantAt = homeOf(a1)!.items.findIndex((i) => i.itemId === 'plant_tall' && i.x === 2 && i.y === 4);
    check('moving an item works', (await edit(a1, { op: 'move', index: plantAt, x: 1, y: 6, rotation: 0 }))?.ok === true && homeOf(a1)!.items[plantAt]!.x === 1);
    check('moving an unknown index is refused', (await edit(a1, { op: 'move', index: 99, x: 1, y: 6, rotation: 0 }))?.reason === 'bad-index');
    check('moving onto another item is refused', (await edit(a1, { op: 'move', index: plantAt, x: 9, y: 6, rotation: 0 }))?.reason === 'overlap');
    const countBefore = homeOf(a1)!.items.length;
    check('removing an item works', (await edit(a1, { op: 'remove', index: plantAt }))?.ok === true && homeOf(a1)!.items.length === countBefore - 1);
    check('removing an unknown index is refused', (await edit(a1, { op: 'remove', index: 99 }))?.reason === 'bad-index');
    check('an owned wallpaper can be applied', (await edit(a1, { op: 'surface', kind: 'wallpaper', id: 'wp_sage' }))?.ok === true && homeOf(a1)!.wallpaper === 'wp_sage');
    check('a surface that is not owned is refused', (await edit(a1, { op: 'surface', kind: 'floor', id: 'fl_dark' }))?.reason === 'not-owned');
    check('an unknown or mismatched surface is refused', (await edit(a1, { op: 'surface', kind: 'floor', id: 'zz' }))?.reason === 'unknown-item' && (await edit(a1, { op: 'surface', kind: 'floor', id: 'wp_sage' }))?.reason === 'unknown-item');
    check('an invalid visibility is refused', (await edit(a1, { op: 'visibility', visibility: 'everyone' } as unknown as HomeEditOp))?.reason === 'invalid');

    const staleVersion = homeOf(a1)!.version - 1;
    const infoCount = a1.messages(S2C.homeInfo).length;
    check('an edit against an old version is refused as stale', (await edit(a1, { op: 'remove', index: 0 }, staleVersion))?.reason === 'stale');
    check('a stale edit gets the current room back', await until(() => a1.messages(S2C.homeInfo).length > infoCount));
    const vNow = homeOf(a1)!.version;
    const both = await ask<HomeResultMessage>(a1, () => {
      a1.room.send(C2S.homeEdit, { version: vNow, edit: { op: 'visibility', visibility: 'private' } });
      a1.room.send(C2S.homeEdit, { version: vNow, edit: { op: 'visibility', visibility: 'friends' } });
    }, S2C.homeResult, 2);
    check('two concurrent edits: one is applied, the other is stale', both.filter((r) => r.ok).length === 1 && both.filter((r) => r.reason === 'stale').length === 1);
    check('visibility reflects the edit that won', ['private', 'friends'].includes(homeOf(a1)!.visibility));

    // ownership of the room
    const guestNo = await edit(guest, { op: 'remove', index: 0 }, 0);
    check('a guest cannot edit or buy', guestNo?.reason === 'not-signed-in' && (await buyMsg(guest, 'plant_tall'))?.reason === 'not-signed-in');

    // ---- friends, visibility and access ------------------------------------------------------------------
    const setVisibility = async (visibility: 'private' | 'friends' | 'open'): Promise<void> => {
      const r = await edit(a1, { op: 'visibility', visibility });
      if (!r?.ok) throw new Error(`could not set ${visibility}: ${r?.reason}`);
    };
    await setVisibility('private');
    check('a private home refuses a stranger', (await enterHome(cPlayer, aInfo.id)).result?.reason === 'private');
    check('a private home refuses a friend-to-be and a guest', (await enterHome(bPlayer, aInfo.id)).result?.reason === 'private' && (await enterHome(guest, aInfo.id)).result?.reason === 'private');
    await setVisibility('friends');
    check('a friends-only home refuses a non-friend and a guest', (await enterHome(bPlayer, aInfo.id)).result?.reason === 'friends-only' && (await enterHome(guest, aInfo.id)).result?.reason === 'friends-only');

    check('friend requests need a signed-in user', (await api('GET', '/api/friends')).status === 401);
    check('requesting an unknown person is a 404', (await api('POST', '/api/friends/request', { nameOrEmail: `Nobody${RUN}` }, bInfo.token)).status === 404);
    check('requesting yourself is a 400', (await api('POST', '/api/friends/request', { nameOrEmail: bInfo.email }, bInfo.token)).status === 400);
    check('a missing name is a 400', (await api('POST', '/api/friends/request', {}, bInfo.token)).status === 400);
    await register(`Twin${RUN}`);
    await register(`twin${RUN}`);
    check('a name used by two people asks for an email', (await api('POST', '/api/friends/request', { nameOrEmail: `TWIN${RUN}` }, bInfo.token)).status === 409);
    const sent = await api<FriendsResponse>('POST', '/api/friends/request', { nameOrEmail: aInfo.name.toLowerCase() }, bInfo.token);
    check('a request by display name (any case) is sent', sent.status === 200 && sent.json.friends.some((f) => f.id === aInfo.id && f.status === 'outgoing'));
    check('asking twice is a 409', (await api('POST', '/api/friends/request', { nameOrEmail: aInfo.email }, bInfo.token)).status === 409);
    const incoming = await api<FriendsResponse>('GET', '/api/friends', undefined, aInfo.token);
    check('the other person sees an incoming request', incoming.json.friends.some((f) => f.id === bInfo.id && f.status === 'incoming'));
    check('answering a request that does not exist is a 404', (await api('POST', '/api/friends/respond', { id: cInfo.id, accept: true }, aInfo.token)).status === 404);
    check('a request is not a friendship yet', (await enterHome(bPlayer, aInfo.id)).result?.reason === 'friends-only');
    const accepted = await api<FriendsResponse>('POST', '/api/friends/respond', { id: bInfo.id, accept: true }, aInfo.token);
    check('accepting makes them friends, with the home visibility shown', accepted.status === 200 && accepted.json.friends.some((f) => f.id === bInfo.id && f.status === 'accepted' && f.homeVisibility === 'friends'));
    check('asking an existing friend is a 409', (await api('POST', '/api/friends/request', { nameOrEmail: bInfo.email }, aInfo.token)).status === 409);
    check('the new friend sees it too', (await api<FriendsResponse>('GET', '/api/friends', undefined, bInfo.token)).json.friends.some((f) => f.id === aInfo.id && f.status === 'accepted'));

    const friendEnter = await enterHome(bPlayer, aInfo.id);
    check('a friend can enter a friends-only home', friendEnter.result?.ok === true && bPlayer.map === homeMapId(aInfo.id) && friendEnter.infoFirst);
    check('a visitor sees the room as not theirs', homeOf(bPlayer)?.mine === false && homeOf(bPlayer)?.ownerName === aInfo.name);
    check('a stranger is still refused a friends-only home', (await enterHome(cPlayer, aInfo.id)).result?.reason === 'friends-only');
    check('a visitor cannot edit the room', (await edit(bPlayer, { op: 'remove', index: 0 }))?.reason === 'not-owner');
    check('a player outside any home cannot edit', (await edit(poorPlayer, { op: 'remove', index: 0 }, 0))?.reason === 'not-in-home');
    check('entering a home that does not exist is refused', (await enterHome(cPlayer, 'no-such-account'))?.result?.reason === 'no-such-home');

    await setVisibility('open');
    check('an open home admits a stranger and a guest', (await enterHome(cPlayer, aInfo.id)).result?.ok === true && (await enterHome(guest, aInfo.id)).result?.ok === true);
    check('both visitors are in the same home instance as the owner and friend', [bPlayer, cPlayer, guest].every((p) => p.map === homeMapId(aInfo.id)));
    // send the extra visitors back out
    for (const p of [cPlayer, guest]) await useDoor(p, 'exit');

    const bed = homeSeats(homeOf(a1) as unknown as HomeLayout).find((spot) => spot.kind === 'bed')!;
    await walkNextTo(bPlayer, bed.tx, bed.ty);
    const nap = await ask<{ ok: boolean }>(bPlayer, () => bPlayer.room.send(C2S.sit, { seatId: bed.id }), S2C.sitResult);
    check('a visitor can sleep in the starter bed', nap[0]?.ok === true && (await until(() => bPlayer.snapshot()?.anim === 'sleep')));
    await walkNextTo(a1, bed.tx, bed.ty);
    const full = await ask<{ ok: boolean; reason?: string }>(a1, () => a1.room.send(C2S.sit, { seatId: bed.id }), S2C.sitResult);
    check('a single bed is full with one sleeper', full[0]?.ok === false && full[0]?.reason === 'taken');
    bPlayer.room.send(C2S.timerStart, { mode: 'stopwatch', focusMin: 25, breakMin: 5, subject: 'math' });
    await sleep(300);
    check('sleeping does not start a focus timer', bPlayer.snapshot()?.phase === 'idle');
    await ask(bPlayer, () => bPlayer.room.send(C2S.stand), S2C.teleport);
    sync(bPlayer);
    const reused = await ask<{ ok: boolean }>(a1, () => a1.room.send(C2S.sit, { seatId: bed.id }), S2C.sitResult);
    check('getting up frees the bed', reused[0]?.ok === true);
    await ask(a1, () => a1.room.send(C2S.stand), S2C.teleport);
    sync(a1);

    // ---- visitors follow layout changes -----------------------------------------------------------------------
    const seatsNow = homeSeats(homeOf(a1) as unknown as HomeLayout);
    check('a home with a desk offers a seat to visitors', seatsNow.length >= 1);
    const seat = seatsNow.find((spot) => spot.kind === 'chair')!;
    await walkNextTo(bPlayer, seat.tx, seat.ty);
    const sitReply = await ask<{ ok: boolean; seatId: string }>(bPlayer, () => bPlayer.room.send(C2S.sit, { seatId: seat.id }), S2C.sitResult);
    check('a visitor can sit at the owner\'s desk', sitReply[0]?.ok === true && (await until(() => bPlayer.snapshot()?.seatId === seat.id)), `${JSON.stringify(sitReply[0])} at ${bPlayer.x},${bPlayer.y} seat ${seat.id} tile ${seat.tx},${seat.ty} map ${bPlayer.map} snap ${bPlayer.snapshot()?.seatId}`);
    const coinsBefore = await coinsOf(bInfo.id);
    bPlayer.room.send(C2S.timerStart, { mode: 'pomodoro', focusMin: 25, breakMin: 0, autoRepeat: false, subject: 'math' });
    check('the timer runs at a visitor desk', await until(() => bPlayer.snapshot()?.phase === 'focus'));
    clockOffset += 26 * MIN;
    check('the session finishes there and pays coins', (await until(() => bPlayer.snapshot()?.phase === 'idle')) && (await until(async () => (await coinsOf(bInfo.id)) === coinsBefore + coinsForMinutes(25), 5000)));

    // owner sits too: the same seat id in the owner's own home is a different seat from anyone else's
    await walkNextTo(a1, seat.tx, seat.ty).catch(() => undefined);
    const ownerSit = await ask<{ ok: boolean; reason?: string }>(a1, () => a1.room.send(C2S.sit, { seatId: seat.id }), S2C.sitResult);
    check('a taken seat cannot be taken twice in the same home', ownerSit[0]?.ok === false && ownerSit[0]?.reason === 'taken');
    const cOwn = await enterHome(cPlayer, cInfo.id);
    const cSeat = homeSeats(homeOf(cPlayer) as unknown as HomeLayout).find((spot) => spot.kind === 'chair')!;
    await walkNextTo(cPlayer, cSeat.tx, cSeat.ty);
    const cSit = await ask<{ ok: boolean }>(cPlayer, () => cPlayer.room.send(C2S.sit, { seatId: cSeat.id }), S2C.sitResult);
    check('the same seat id in another home is a different seat', cOwn.result?.ok === true && cSeat.id === seat.id && cSit[0]?.ok === true);
    await ask(cPlayer, () => cPlayer.room.send(C2S.stand), S2C.teleport);
    sync(cPlayer);

    // the owner removes the desk while a visitor sits at it
    const deskAt = homeOf(a1)!.items.findIndex((i) => i.itemId === 'desk_basic');
    const bInfoCount = bPlayer.messages(S2C.homeInfo).length;
    const bTele = bPlayer.messages(S2C.teleport).length;
    check('the owner can remove the desk', (await edit(a1, { op: 'remove', index: deskAt }))?.ok === true);
    check('the visitor is shown the new room', await until(() => bPlayer.messages(S2C.homeInfo).length > bInfoCount && homeOf(bPlayer)!.items.length === homeOf(a1)!.items.length));
    check('a visitor sitting at a removed desk is stood up', (await until(() => bPlayer.snapshot()?.seatId === '')) && bPlayer.messages(S2C.teleport).length > bTele);
    sync(bPlayer);
    check('put the desk back', (await edit(a1, { op: 'place', itemId: 'desk_basic', x: 3, y: 3, rotation: 0 }))?.ok === true);

    // ---- the street ------------------------------------------------------------------------------------------------
    const aNumber = homeOf(a1)!.number;
    const page = streetPageOf(aNumber);
    const slot = slotOf(aNumber);
    const streetBefore = a1.messages(S2C.streetInfo).length;
    const out = await useDoor(a1, 'exit');
    check('leaving through the door puts you on your street page', out?.map === `street:${page}` && a1.map === `street:${page}`);
    check('street info lists the houses with owners and access', await until(() => a1.messages(S2C.streetInfo).length > streetBefore));
    const street = lastOf<StreetInfoMessage>(a1, S2C.streetInfo)!;
    const mine = street.houses.find((h) => h.slot === slot)!;
    check('your house shows your name and that you can enter', street.page === page && street.houses.length === HOUSES_PER_STREET && mine.ownerName === aInfo.name && mine.canEnter && mine.visibility === 'open' && street.lastPage >= page);
    const vacant = street.houses.find((h) => h.ownerId === null);
    const back = await useDoor(a1, `house-${slot}`);
    check('your house door leads into your home', back?.map === homeMapId(aInfo.id) && homeOf(a1)?.mine === true);
    await useDoor(a1, 'exit');
    if (vacant) {
      await walkToDoor(a1, `house-${vacant.slot}`);
      const refused = await result(a1, () => a1.room.send(C2S.door, { doorId: `house-${vacant.slot}` }));
      check('a door with no house behind it is refused', refused?.reason === 'no-such-home');
    } else {
      console.log('SKIP  no vacant house on this street page');
    }

    // the street shows changes in access to people standing on it
    await useDoor(bPlayer, 'exit');
    const bStreet = lastOf<StreetInfoMessage>(bPlayer, S2C.streetInfo)!;
    check('a friend on the street can enter an open home', bStreet.houses.find((h) => h.slot === slot)?.canEnter === true);
    await useDoor(a1, `house-${slot}`);
    const streetCount = bPlayer.messages(S2C.streetInfo).length;
    await setVisibility('private');
    check('the street is re-sent when a home becomes private', await until(() => bPlayer.messages(S2C.streetInfo).length > streetCount));
    check('and shows it as closed to the visitor', lastOf<StreetInfoMessage>(bPlayer, S2C.streetInfo)!.houses.find((h) => h.slot === slot)?.canEnter === false);
    await walkToDoor(bPlayer, `house-${slot}`);
    check('a private home\'s door refuses a friend', (await result(bPlayer, () => bPlayer.room.send(C2S.door, { doorId: `house-${slot}` })))?.reason === 'private');
    await setVisibility('friends');
    const viaDoor = await ask<TeleportMessage>(bPlayer, () => bPlayer.room.send(C2S.door, { doorId: `house-${slot}` }), S2C.teleport, 1, 3000);
    sync(bPlayer);
    check('a friend can walk in through the door once it is friends-only', viaDoor[0]?.map === homeMapId(aInfo.id));

    // visitors are shown out when access tightens
    const noticesBefore = bPlayer.messages<NoticeMessage>(S2C.notice).length;
    await setVisibility('private');
    check('a visitor is moved to the street when the home goes private', await until(() => (sync(bPlayer), bPlayer.map.startsWith('street:'))));
    check('and is told why', bPlayer.messages<NoticeMessage>(S2C.notice).length > noticesBefore);
    await setVisibility('friends');
    await enterHome(bPlayer, aInfo.id);
    const removed = await api('DELETE', `/api/friends/${bInfo.id}`, undefined, aInfo.token);
    check('removing a friend works', removed.status === 200);
    check('a visitor is moved out when the friendship ends', await until(() => (sync(bPlayer), bPlayer.map.startsWith('street:'))));
    check('removing someone who is not a friend is a 404', (await api('DELETE', `/api/friends/${bInfo.id}`, undefined, aInfo.token)).status === 404);

    // east and west along the street
    await useDoor(a1, 'exit');
    const lastPage = lastOf<StreetInfoMessage>(a1, S2C.streetInfo)!.lastPage;
    if (lastPage === page) {
      await walkToDoor(a1, 'east');
      const notices = a1.messages<NoticeMessage>(S2C.notice).length;
      a1.room.send(C2S.door, { doorId: 'east' });
      check('the east end of the last street says so', await until(() => a1.messages<NoticeMessage>(S2C.notice).length > notices && a1.messages<NoticeMessage>(S2C.notice).at(-1)!.text.includes('end of the street')));
    } else {
      console.log('SKIP  this street is not the last one');
    }
    // make sure there is a following street by creating enough dummy homes
    const dummies: string[] = [];
    while ((await prisma.home.aggregate({ _max: { number: true } }))._max.number! < houseNumber(page + 1, 1)) {
      const user = await prisma.user.create({ data: { email: newEmail(), passwordHash: 'x', name: 'Dummy' } });
      dummies.push(user.id);
      await ensureHome(user.id);
    }
    await walkToDoor(a1, 'east');
    const east = await ask<TeleportMessage>(a1, () => a1.room.send(C2S.door, { doorId: 'east' }), S2C.teleport, 1, 3000);
    sync(a1);
    check('east leads to the next street page', east[0]?.map === `street:${page + 1}` && a1.map === `street:${page + 1}`);
    check('the next page sends its own street info', await until(() => lastOf<StreetInfoMessage>(a1, S2C.streetInfo)?.page === page + 1));
    await walkToDoor(a1, 'west');
    const west = await ask<TeleportMessage>(a1, () => a1.room.send(C2S.door, { doorId: 'west' }), S2C.teleport, 1, 3000);
    sync(a1);
    check('west leads back to the previous street page', west[0]?.map === `street:${page}`);

    // the hub's way to the street, when the town map has one
    const hubDoor = world.maps.get('hub')!.doors.get('to-street');
    if (hubDoor) {
      check('the town has a door to the street that resolves to the first page', hubDoor.targetMap === 'street' && world.maps.get('street')!.spawns.has(hubDoor.targetSpawn));
      // Walk there from the town square and go through it.
      const walker = track(await join());
      const viaHub = await useDoor(walker, 'to-street');
      check('walking through the town door arrives on the first street page', viaHub?.map === 'street:1' && walker.map === 'street:1');
      check('and the street page sends its houses', await until(() => lastOf<StreetInfoMessage>(walker, S2C.streetInfo)?.page === 1));
      const toTown = await useDoor(walker, 'west');
      check('the west end of the first street leads back to the town', toTown?.map === world.start.map);
    } else {
      console.log('SKIP  the hub map has no "to-street" door yet');
    }

    // ---- upgrade -----------------------------------------------------------------------------------------------------
    await enterHome(a1, aInfo.id);
    const coinsBeforeUpgrade = await coinsOf(aInfo.id);
    const tierBefore = homeOf(a1)!.tier;
    const teleportsBefore = a1.messages(S2C.teleport).length;
    if (coinsBeforeUpgrade < getTier(2).price) await grant(aInfo.id, getTier(2).price);
    const cost2 = getTier(2).price;
    const balance2 = await coinsOf(aInfo.id);
    check('upgrading to the next tier works', tierBefore === 1 && (await edit(a1, { op: 'upgrade' }))?.ok === true && homeOf(a1)!.tier === 2);
    check('the upgrade costs its price, in the ledger too', (await coinsOf(aInfo.id)) === balance2 - cost2 && (await ledgerOf(aInfo.id)) === (await coinsOf(aInfo.id)));
    check('members are sent to the entrance of the bigger room', a1.messages(S2C.teleport).length > teleportsBefore && (sync(a1), true));
    check('upgrading without enough coins is refused', (await coinsOf(aInfo.id)) < getTier(3).price && (await edit(a1, { op: 'upgrade' }))?.reason === 'not-enough-coins');
    await grant(aInfo.id, getTier(3).price);
    check('upgrading to the largest tier works', (await edit(a1, { op: 'upgrade' }))?.ok === true && homeOf(a1)!.tier === 3);
    check('there is no tier beyond the last', (await edit(a1, { op: 'upgrade' }))?.reason === 'already-max-tier');
    check('the existing furniture is still where it was', layoutError({ tier: 3, wallpaper: homeOf(a1)!.wallpaper, floor: homeOf(a1)!.floor, items: homeOf(a1)!.items }) === null);

    // ---- persistence -------------------------------------------------------------------------------------------------------
    const finalInfo = homeOf(a1)!;
    const stored = await loadHome(aInfo.id);
    check('the stored home matches what players were shown', stored?.version === finalInfo.version && JSON.stringify(stored?.layout) === JSON.stringify(finalInfo.items) && stored?.tier === 3 && stored?.wallpaper === finalInfo.wallpaper);
    for (const p of players) await p.room.leave().catch(() => undefined);
    players.length = 0;
    await game.shutdown();
    game = createServer({ testClock: () => Date.now() + clockOffset });
    await game.listen(PORT);
    const a2 = track(await join(aInfo.token, aInfo.id));
    await enterHome(a2, aInfo.id);
    check('the layout survives a server restart', JSON.stringify(homeOf(a2)?.items) === JSON.stringify(finalInfo.items) && homeOf(a2)?.tier === 3 && homeOf(a2)?.version === finalInfo.version);

    // ---- the database goes away -------------------------------------------------------------------------------------------------
    const guest2 = track(await join());
    await closeDb();
    const savedUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://nobody:nothing@127.0.0.1:1/none?schema=public';
    check('buying while the database is down says so', (await buyMsg(a2, 'plant_tall'))?.reason === 'unavailable');
    check('editing while the database is down says so', (await edit(a2, { op: 'remove', index: 0 }))?.reason === 'unavailable');
    check('entering a home while the database is down says so', (await enterHome(guest2, aInfo.id)).result?.reason === 'unavailable');
    guest2.room.send(C2S.move, { seq: ++seq, x: guest2.x + 1, y: guest2.y, dir: 'right', moving: true });
    check('guests are unaffected', guest2.snapshot() !== undefined && (await api('GET', '/api/servers')).status === 200);
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    await closeDb();
    await grant(aInfo.id, 100);
    check('everything works again once the database is back', (await buyMsg(a2, 'plant_tall'))?.ok === true);

    // ---- invariant across every account made in this run ----------------------------------------------------------------------------------------
    const mineAll = await prisma.user.findMany({ where: { email: { startsWith: `t-${RUN}-` } }, select: { id: true, coins: true } });
    let invariant = true;
    for (const u of mineAll) if ((await ledgerOf(u.id)) !== u.coins) invariant = false;
    check('User.coins equals the ledger sum for every test account', invariant);

    // ---- the friend request limit (last, since it fills the limiter) ------------------------------------------------------------------------------------------
    resetFriendLimits();
    let limited = false;
    for (let i = 0; i < 40 && !limited; i++) limited = (await api('POST', '/api/friends/request', { nameOrEmail: `ghost${i}${RUN}` }, cInfo.token)).status === 429;
    check('too many friend requests are limited', limited);
    void dummies;
  } finally {
    for (const p of players) await p.room.leave().catch(() => undefined);
    await closeDb();
    await db().user.deleteMany({ where: { email: { startsWith: `t-${RUN}-`, endsWith: '@example.test' } } });
    await game.shutdown();
  }

  console.log(failures === 0 ? '\nAll home checks passed.' : `\n${failures} home check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

