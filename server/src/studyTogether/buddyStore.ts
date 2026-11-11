import type { BuddyLink } from '@study/shared';
import { withDb } from '../db/client';

export interface StoredBuddyLink extends BuddyLink {
  userId: string;
  acceptedAt: number | null;
}

const containsUser = (id: string) => ({ OR: [{ firstId: id }, { secondId: id }] });

export function loadBuddyLinks(userId: string): Promise<StoredBuddyLink[]> {
  return withDb(async (db) => {
    const links = await db.buddyPair.findMany({
      where: containsUser(userId),
      include: { first: { select: { name: true } }, second: { select: { name: true } } },
    });
    const acceptedIds = links.filter((link) => link.acceptedAt).map((link) => link.id);
    const focus = acceptedIds.length ? await db.buddyFocus.groupBy({
      by: ['pairId'],
      where: { pairId: { in: acceptedIds } },
      _sum: { durationMs: true },
    }) : [];
    const totals = new Map(focus.map((entry) => [entry.pairId, entry._sum.durationMs ?? 0]));

    return links.map((link) => {
      const first = link.firstId === userId;
      return {
        id: link.id,
        name: first ? link.second.name : link.first.name,
        userId: first ? link.secondId : link.firstId,
        acceptedAt: link.acceptedAt?.getTime() ?? null,
        status: link.acceptedAt ? 'accepted' : first === link.requestedByFirst ? 'outgoing' : 'incoming',
        focusMinutes: Math.floor((totals.get(link.id) ?? 0) / 60_000),
      };
    });
  });
}

export function requestBuddy(userId: string, targetId: string): Promise<boolean> {
  const [firstId, secondId] = [userId, targetId].sort();
  return withDb(async (db) => {
    const created = await db.buddyPair.createMany({
      data: [{ firstId, secondId, requestedByFirst: firstId === userId }],
      skipDuplicates: true,
    });
    return created.count > 0;
  });
}

export function changeBuddy(
  userId: string,
  linkId: string,
  kind: 'accept' | 'decline' | 'cancel' | 'remove',
  now: number,
): Promise<string | null> {
  return withDb(async (db) => {
    const link = await db.buddyPair.findFirst({ where: { id: linkId, ...containsUser(userId) } });
    if (!link) return null;
    const first = link.firstId === userId;
    const requester = first === link.requestedByFirst;
    const valid = link.acceptedAt ? kind === 'remove' : requester ? kind === 'cancel' : kind === 'accept' || kind === 'decline';
    if (!valid) return null;
    const where = { id: linkId, acceptedAt: link.acceptedAt };
    const result = kind === 'accept'
      ? await db.buddyPair.updateMany({ where, data: { acceptedAt: new Date(now) } })
      : await db.buddyPair.deleteMany({ where });
    return result.count ? (first ? link.secondId : link.firstId) : null;
  });
}

/** The same overlap can be saved repeatedly or retried without double credit. */
export function saveBuddyFocus(pairId: string, periodId: string, durationMs: number): Promise<number> {
  return withDb((db) => db.$executeRaw`
    INSERT INTO "BuddyFocus" ("id", "pairId", "durationMs")
    SELECT ${periodId}, "id", ${durationMs}::integer FROM "BuddyPair"
    WHERE "id" = ${pairId} AND "acceptedAt" IS NOT NULL
    ON CONFLICT ("id") DO UPDATE SET "durationMs" =
      GREATEST("BuddyFocus"."durationMs", EXCLUDED."durationMs")
  `);
}
