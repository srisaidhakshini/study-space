import type { BuddyLink } from '@study/shared';
import { respondToRequest } from '../db/friends';
import { withDb } from '../db/client';

export interface StoredBuddyLink extends BuddyLink {
  userId: string;
  acceptedAt: number | null;
}

const containsUser = (id: string) => ({ OR: [{ requesterId: id }, { addresseeId: id }] });

export function loadBuddyLinks(userId: string): Promise<StoredBuddyLink[]> {
  return withDb(async (db) => {
    const rows = await db.$queryRaw<(Omit<StoredBuddyLink, 'acceptedAt'> & { acceptedAt: Date | null })[]>`
      SELECT f."id", u."id" AS "userId", u."name", f."acceptedAt",
        CASE WHEN f."status" = 'ACCEPTED' THEN 'accepted'
          WHEN f."requesterId" = ${userId} THEN 'outgoing' ELSE 'incoming' END AS "status",
        COALESCE((SELECT SUM(p."durationMs") / 60000 FROM "BuddyFocus" AS p WHERE p."pairId" = f."id"), 0)::int AS "focusMinutes"
      FROM "Friendship" AS f
      JOIN "User" AS u ON u."id" = CASE WHEN f."requesterId" = ${userId} THEN f."addresseeId" ELSE f."requesterId" END
      WHERE f."requesterId" = ${userId} OR f."addresseeId" = ${userId}
    `;
    return rows.map((row) => ({ ...row, acceptedAt: row.acceptedAt?.getTime() ?? null }));
  });
}

export function changeBuddy(
  userId: string,
  linkId: string,
  kind: 'accept' | 'decline' | 'cancel' | 'remove',
): Promise<string | null> {
  return withDb(async (db) => {
    const link = await db.friendship.findFirst({ where: { id: linkId, ...containsUser(userId) } });
    if (!link) return null;
    const requester = link.requesterId === userId;
    const other = requester ? link.addresseeId : link.requesterId;
    const valid = link.status === 'ACCEPTED'
      ? kind === 'remove'
      : requester ? kind === 'cancel' : kind === 'accept' || kind === 'decline';
    if (!valid) return null;
    if (kind === 'accept') return await respondToRequest(userId, other, true) ? other : null;
    const deleted = await db.friendship.deleteMany({ where: { id: linkId, status: link.status } });
    return deleted.count ? other : null;
  });
}

/** The same overlap can be saved repeatedly or retried without double credit. */
export function saveBuddyFocus(pairId: string, periodId: string, durationMs: number): Promise<number> {
  return withDb((db) => db.$executeRaw`
    INSERT INTO "BuddyFocus" ("id", "pairId", "durationMs")
    SELECT ${periodId}, "id", ${durationMs}::integer FROM "Friendship"
    WHERE "id" = ${pairId} AND "status" = 'ACCEPTED'
    ON CONFLICT ("id") DO UPDATE SET "durationMs" =
      GREATEST("BuddyFocus"."durationMs", EXCLUDED."durationMs")
  `);
}
