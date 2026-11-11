import type { FriendEntry } from '@study/shared';
import { Prisma } from '../generated/prisma/client';
import { visibilityFromDb } from './homes';
import { withDb } from './client';

/** Whether two accounts are accepted friends. */
export function areFriends(a: string, b: string): Promise<boolean> {
  if (a === b) return Promise.resolve(false);
  return withDb(async (prisma) => {
    const row = await prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
      },
      select: { id: true },
    });
    return row !== null;
  });
}

/** Ids of everyone this account is friends with. */
export function friendIdsOf(userId: string): Promise<Set<string>> {
  return withDb(async (prisma) => {
    const rows = await prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { requesterId: true, addresseeId: true },
    });
    return new Set(rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId)));
  });
}

/** Friends, incoming requests and outgoing requests, each with the person's home visibility. */
export function listFriends(userId: string): Promise<FriendEntry[]> {
  return withDb(async (prisma) => {
    const rows = await prisma.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: {
        requester: { select: { id: true, name: true, home: { select: { visibility: true } } } },
        addressee: { select: { id: true, name: true, home: { select: { visibility: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row): FriendEntry => {
      const mine = row.requesterId === userId;
      const other = mine ? row.addressee : row.requester;
      return {
        id: other.id,
        name: other.name,
        status: row.status === 'ACCEPTED' ? 'accepted' : mine ? 'outgoing' : 'incoming',
        homeVisibility: other.home ? visibilityFromDb(other.home.visibility) : null,
      };
    });
  });
}

export type FindTarget = { kind: 'found'; id: string; name: string } | { kind: 'none' } | { kind: 'ambiguous' };

/** Finds the person a request names: by email (when it contains "@") or by display name, ignoring case. */
export function findFriendTarget(nameOrEmail: string): Promise<FindTarget> {
  return withDb(async (prisma) => {
    const text = nameOrEmail.trim();
    if (text.includes('@')) {
      const user = await prisma.user.findUnique({ where: { email: text.toLowerCase() }, select: { id: true, name: true } });
      return user ? { kind: 'found' as const, id: user.id, name: user.name } : { kind: 'none' as const };
    }
    const users = await prisma.user.findMany({
      where: { name: { equals: text, mode: 'insensitive' } },
      select: { id: true, name: true },
      take: 2,
    });
    if (users.length === 0) return { kind: 'none' as const };
    if (users.length > 1) return { kind: 'ambiguous' as const };
    return { kind: 'found' as const, id: users[0]!.id, name: users[0]!.name };
  });
}

export type RequestResult = 'sent' | 'accepted' | 'already-friends' | 'already-sent';

/**
 * Sends a friend request. If the other person already asked you, that request
 * is accepted instead, so two people adding each other become friends.
 */
export function requestFriend(from: string, to: string): Promise<RequestResult> {
  return withDb(async (prisma) => {
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: from, addresseeId: to },
          { requesterId: to, addresseeId: from },
        ],
      },
    });
    if (existing) {
      if (existing.status === 'ACCEPTED') return 'already-friends';
      if (existing.requesterId === from) return 'already-sent';
      await prisma.friendship.update({ where: { id: existing.id }, data: { status: 'ACCEPTED' } });
      return 'accepted';
    }
    try {
      await prisma.friendship.create({ data: { requesterId: from, addresseeId: to } });
      return 'sent';
    } catch (error) {
      // A simultaneous identical request: treat it as already sent.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'already-sent';
      throw error;
    }
  });
}

/** Answers a request that `requesterId` sent to `me`. False if there is no such pending request. */
export function respondToRequest(me: string, requesterId: string, accept: boolean): Promise<boolean> {
  return withDb(async (prisma) => {
    const row = await prisma.friendship.findFirst({ where: { requesterId, addresseeId: me, status: 'PENDING' } });
    if (!row) return false;
    if (accept) await prisma.friendship.update({ where: { id: row.id }, data: { status: 'ACCEPTED' } });
    else await prisma.friendship.delete({ where: { id: row.id } });
    return true;
  });
}

/** Removes a friendship or cancels or declines a request in either direction. Returns whether the row was an accepted friendship. */
export function removeFriendship(me: string, other: string): Promise<{ removed: boolean; wasFriends: boolean }> {
  return withDb(async (prisma) => {
    const rows = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: me, addresseeId: other },
          { requesterId: other, addresseeId: me },
        ],
      },
    });
    if (rows.length === 0) return { removed: false, wasFriends: false };
    await prisma.friendship.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    return { removed: true, wasFriends: rows.some((r) => r.status === 'ACCEPTED') };
  });
}
