import {
  DEFAULT_FLOOR,
  DEFAULT_WALLPAPER,
  VISIBILITIES,
  getFurniture,
  getSurface,
  starterInventory,
  type HomeFailure,
  type InventoryMessage,
  type PlacedItem,
  type Visibility,
} from '@study/shared';
import { HomeVisibility } from '../generated/prisma/enums';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { starterLayout } from '../homes/starter';
import { withDb } from './client';

/** A home as the rooms use it. */
export interface HomeRecord {
  id: string;
  ownerId: string;
  ownerName: string;
  /** House number: which door of which street page leads here. */
  number: number;
  tier: number;
  visibility: Visibility;
  wallpaper: string;
  floor: string;
  layout: PlacedItem[];
  version: number;
}

/** Owning at most this many copies of one item keeps inventories and messages bounded. */
export const MAX_OWNED_PER_ITEM = 50;

export const visibilityFromDb = (v: HomeVisibility): Visibility => v.toLowerCase() as Visibility;
export const visibilityToDb = (v: Visibility): HomeVisibility => v.toUpperCase() as HomeVisibility;

/** Reads a stored layout defensively: anything malformed is dropped rather than trusted. */
export function parseLayout(json: unknown): PlacedItem[] {
  if (!Array.isArray(json)) return [];
  const items: PlacedItem[] = [];
  for (const raw of json) {
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.itemId !== 'string' || !Number.isInteger(r.x) || !Number.isInteger(r.y) || !Number.isInteger(r.rotation)) continue;
    items.push({ itemId: r.itemId, x: r.x as number, y: r.y as number, rotation: r.rotation as number });
  }
  return items;
}

type HomeWithOwner = Prisma.HomeGetPayload<{ include: { owner: { select: { name: true } } } }>;

function toRecord(row: HomeWithOwner): HomeRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    ownerName: row.owner.name,
    number: row.number,
    tier: row.tier,
    visibility: visibilityFromDb(row.visibility),
    wallpaper: row.wallpaper,
    floor: row.floor,
    layout: parseLayout(row.layout),
    version: row.version,
  };
}

const withOwner = { include: { owner: { select: { name: true } } } } as const;

export function loadHome(ownerId: string): Promise<HomeRecord | null> {
  return withDb(async (prisma) => {
    const row = await prisma.home.findUnique({ where: { ownerId }, ...withOwner });
    return row ? toRecord(row) : null;
  });
}

export function loadHomeByNumber(number: number): Promise<HomeRecord | null> {
  return withDb(async (prisma) => {
    const row = await prisma.home.findUnique({ where: { number }, ...withOwner });
    return row ? toRecord(row) : null;
  });
}

/**
 * The account's home, created on first use: a house number from the database
 * sequence, the starter furniture (granted once) and a tidy starter layout.
 */
export function ensureHome(userId: string): Promise<{ home: HomeRecord; created: boolean }> {
  return withDb(async (prisma) => {
    const existing = await prisma.home.findUnique({ where: { ownerId: userId }, ...withOwner });
    if (existing) return { home: toRecord(existing), created: false };
    try {
      return await prisma.$transaction(async (tx) => {
        const layout = starterLayout();
        const row = await tx.home.create({
          data: {
            ownerId: userId,
            tier: layout.tier,
            wallpaper: layout.wallpaper,
            floor: layout.floor,
            layout: layout.items as unknown as Prisma.InputJsonValue,
          },
          ...withOwner,
        });
        for (const [itemId, count] of Object.entries(starterInventory())) {
          await tx.inventoryItem.upsert({
            where: { userId_itemId: { userId, itemId } },
            create: { userId, itemId, count },
            // A starter item the player already owns is never topped up twice.
            update: {},
          });
        }
        return { home: toRecord(row), created: true };
      });
    } catch (error) {
      // Two connections creating the same home at once: the loser reads the winner's.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const row = await prisma.home.findUniqueOrThrow({ where: { ownerId: userId }, ...withOwner });
        return { home: toRecord(row), created: false };
      }
      throw error;
    }
  });
}

/** What the player owns: furniture counts, surfaces (the defaults are always included) and coins. */
export function loadInventory(userId: string): Promise<InventoryMessage> {
  return withDb(async (prisma) => readInventory(prisma, userId));
}

async function readInventory(prisma: Pick<PrismaClient, 'inventoryItem' | 'ownedSurface' | 'user'>, userId: string): Promise<InventoryMessage> {
  const [items, surfaces, user] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { userId, count: { gt: 0 } } }),
    prisma.ownedSurface.findMany({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { coins: true } }),
  ]);
  const owned: Record<string, number> = {};
  for (const row of items) owned[row.itemId] = row.count;
  const surfaceIds = new Set<string>([DEFAULT_WALLPAPER, DEFAULT_FLOOR, ...surfaces.map((s) => s.surfaceId)]);
  return { owned, surfaces: [...surfaceIds], coins: user?.coins ?? 0 };
}

/** Thrown inside a transaction to roll it back with a reason. */
class Refusal extends Error {
  constructor(readonly reason: HomeFailure) {
    super(reason);
  }
}

export type SpendResult = { ok: true; inventory: InventoryMessage } | { ok: false; reason: HomeFailure };

/**
 * Takes `cost` coins from the user inside the caller's transaction. The balance
 * check is part of the UPDATE, so two simultaneous purchases can never take
 * the balance below zero.
 */
async function spend(tx: Prisma.TransactionClient, userId: string, cost: number, reason: string): Promise<void> {
  if (cost > 0) {
    const taken = await tx.user.updateMany({ where: { id: userId, coins: { gte: cost } }, data: { coins: { decrement: cost } } });
    if (taken.count === 0) throw new Refusal('not-enough-coins');
  }
  await tx.coinTransaction.create({ data: { userId, amount: -cost, reason } });
}

/** Buys furniture (price x quantity) or a surface (once). Coins and the ledger change together. */
export function buy(userId: string, itemId: string, quantity: number): Promise<SpendResult> {
  const furniture = getFurniture(itemId);
  const surface = furniture ? undefined : getSurface(itemId);
  if (!furniture && !surface) return Promise.resolve({ ok: false, reason: 'unknown-item' });
  const price = furniture ? furniture.price : surface!.price;
  // Starter items and the default surfaces are free to have but not free to farm.
  if (price <= 0) return Promise.resolve({ ok: false, reason: 'invalid' });
  const qty = surface ? 1 : quantity;
  if (!Number.isInteger(qty) || qty < 1 || qty > 20) return Promise.resolve({ ok: false, reason: 'invalid' });

  return withDb(async (prisma) => {
    try {
      return await prisma.$transaction(async (tx) => {
        if (furniture) {
          const row = await tx.inventoryItem.findUnique({ where: { userId_itemId: { userId, itemId } } });
          if ((row?.count ?? 0) + qty > MAX_OWNED_PER_ITEM) throw new Refusal('too-many-items');
          await spend(tx, userId, price * qty, `buy:${itemId}`);
          await tx.inventoryItem.upsert({
            where: { userId_itemId: { userId, itemId } },
            create: { userId, itemId, count: qty },
            update: { count: { increment: qty } },
          });
        } else {
          const have = await tx.ownedSurface.findUnique({ where: { userId_surfaceId: { userId, surfaceId: itemId } } });
          if (have) throw new Refusal('invalid');
          await spend(tx, userId, price, `surface:${itemId}`);
          await tx.ownedSurface.create({ data: { userId, surfaceId: itemId } });
        }
        return { ok: true as const, inventory: await readInventory(tx, userId) };
      });
    } catch (error) {
      if (error instanceof Refusal) return { ok: false as const, reason: error.reason };
      throw error;
    }
  });
}

export interface LayoutPatch {
  layout?: PlacedItem[];
  visibility?: Visibility;
  wallpaper?: string;
  floor?: string;
}

/**
 * Writes an edit if the stored version is still `expectedVersion`; otherwise
 * returns null (someone else, perhaps in another room instance, edited first).
 */
export function saveHome(homeId: string, expectedVersion: number, patch: LayoutPatch): Promise<HomeRecord | null> {
  if (patch.visibility !== undefined && !VISIBILITIES.includes(patch.visibility)) return Promise.resolve(null);
  return withDb(async (prisma) => {
    const updated = await prisma.home.updateMany({
      where: { id: homeId, version: expectedVersion },
      data: {
        version: { increment: 1 },
        ...(patch.layout === undefined ? {} : { layout: patch.layout as unknown as Prisma.InputJsonValue }),
        ...(patch.visibility === undefined ? {} : { visibility: visibilityToDb(patch.visibility) }),
        ...(patch.wallpaper === undefined ? {} : { wallpaper: patch.wallpaper }),
        ...(patch.floor === undefined ? {} : { floor: patch.floor }),
      },
    });
    if (updated.count === 0) return null;
    const row = await prisma.home.findUnique({ where: { id: homeId }, ...withOwner });
    return row ? toRecord(row) : null;
  });
}

export type UpgradeResult = { ok: true; home: HomeRecord; inventory: InventoryMessage } | { ok: false; reason: HomeFailure };

/** Moves the home to the next tier and charges for it in one transaction. */
export function upgrade(userId: string, homeId: string, expectedVersion: number, nextTier: number, price: number): Promise<UpgradeResult> {
  return withDb(async (prisma) => {
    try {
      return await prisma.$transaction(async (tx) => {
        await spend(tx, userId, price, `upgrade:${nextTier}`);
        const updated = await tx.home.updateMany({
          where: { id: homeId, version: expectedVersion },
          data: { tier: nextTier, version: { increment: 1 } },
        });
        if (updated.count === 0) throw new Refusal('stale');
        const row = await tx.home.findUniqueOrThrow({ where: { id: homeId }, ...withOwner });
        return { ok: true as const, home: toRecord(row), inventory: await readInventory(tx, userId) };
      });
    } catch (error) {
      if (error instanceof Refusal) return { ok: false as const, reason: error.reason };
      throw error;
    }
  });
}

/** The highest house number that exists (0 when there are no homes). */
export function highestHouseNumber(): Promise<number> {
  return withDb(async (prisma) => (await prisma.home.aggregate({ _max: { number: true } }))._max.number ?? 0);
}

/** Homes with numbers in [from, to], with their owners' names. */
export function homesInRange(from: number, to: number): Promise<HomeRecord[]> {
  return withDb(async (prisma) => {
    const rows = await prisma.home.findMany({ where: { number: { gte: from, lte: to } }, orderBy: { number: 'asc' }, ...withOwner });
    return rows.map(toRecord);
  });
}
