import { randomUUID } from 'node:crypto';
import { BUDDIES, S2C, type BuddyLinks } from '@study/shared';
import { requestFriend } from '../db/friends';
import { homeBus } from '../homes/events';
import { retryOnce } from '../rooms/persist';
import type { PlayerSession } from '../rooms/session';
import { isPlainObject } from '../rooms/text';
import { changeBuddy, loadBuddyLinks, saveBuddyFocus, type StoredBuddyLink } from './buddyStore';

const ROOMS = new Set<BuddyRoom>();
const ACTION_COOLDOWN_MS = 1500;
const MAX_PERIOD_MS = 86_400_000;

interface Period {
  id: string;
  first: string;
  second: string;
  duration: number;
  savedMinute: number;
}

function blocked(a: PlayerSession, b: PlayerSession): boolean {
  return a.blocked.has(b.id) || b.blocked.has(a.id);
}

function tell(session: PlayerSession, text: string): void {
  session.client.send(S2C.notice, { text });
}

export class BuddyRoom {
  private readonly links = new Map<PlayerSession, StoredBuddyLink[]>();
  private readonly revision = new WeakMap<PlayerSession, number>();
  private readonly lastAction = new WeakMap<PlayerSession, number>();
  private readonly pendingSaves = new Set<Promise<void>>();
  private readonly periods = new Map<string, Period>();
  private offFriendList: (() => void) | null = null;
  private lastFocusTick: number | null = null;

  constructor(private readonly sessions: ReadonlyMap<string, PlayerSession>) {}

  open(): void {
    ROOMS.add(this);
    this.offFriendList = homeBus.on('friendList', (first, second) => void this.refreshAccounts(first, second));
  }

  join(session: PlayerSession): void {
    if (!session.userId) return;
    this.links.set(session, []);
    this.publishRoster();
    void this.refresh(session);
  }

  leave(session: PlayerSession): void {
    if (this.links.delete(session)) this.publishRoster();
  }

  async close(): Promise<void> {
    ROOMS.delete(this);
    this.offFriendList?.();
    for (const [id, period] of this.periods) this.persist(id, period);
    this.periods.clear();
    this.links.clear();
    await Promise.all(this.pendingSaves);
  }

  publishRoster(): void {
    for (const [session, links] of this.links) {
      const peers = [...this.links.keys()].filter((peer) => peer.userId !== session.userId && !blocked(session, peer));
      const idsByAccount = new Map(peers.map((peer) => [peer.userId, peer.id]));
      const online: BuddyLinks['online'] = {};
      for (const link of links) {
        const id = idsByAccount.get(link.userId);
        if (id) online[link.id] = id;
      }
      const view: BuddyLinks = {
        links: links.map(({ id, name, status, focusMinutes }) => ({ id, name, status, focusMinutes })),
        online,
      };
      session.client.send(BUDDIES.links, view);
      session.client.send(BUDDIES.candidates, peers.map((peer) => peer.id));
    }
  }

  async action(session: PlayerSession, raw: unknown, now: number): Promise<void> {
    const userId = session.userId;
    if (!userId || !isPlainObject(raw)) return;
    const kind = raw.kind;
    if (kind !== 'request' && kind !== 'accept' && kind !== 'decline' && kind !== 'cancel' && kind !== 'remove') return;
    if (now - (this.lastAction.get(session) ?? -Infinity) < ACTION_COOLDOWN_MS) {
      return tell(session, 'Wait a moment before changing friend requests again.');
    }
    this.lastAction.set(session, now);
    try {
      let targetId: string | null;
      if (kind === 'request') {
        const target = typeof raw.peerId === 'string' ? this.sessions.get(raw.peerId) : undefined;
        if (!target?.userId || target.userId === userId || blocked(session, target)) {
          return tell(session, 'That player cannot receive a friend request.');
        }
        targetId = target.userId;
        const result = await requestFriend(userId, targetId);
        if (result === 'sent') {
          tell(target, `${session.player.name} sent you a friend request. Open People or Friends to respond.`);
          tell(session, 'Friend request sent.');
        }
        if (result === 'accepted') homeBus.emit('friendship', userId, targetId);
      } else {
        if (typeof raw.linkId !== 'string' || raw.linkId.length > 64) return;
        const link = this.links.get(session)?.find((item) => item.id === raw.linkId);
        if (kind === 'accept' && link) {
          const peer = [...this.links.keys()].find((item) => item.userId === link.userId);
          if (peer && blocked(session, peer)) return tell(session, 'Unblock this player before accepting their request.');
        }
        targetId = await changeBuddy(userId, raw.linkId, kind);
        if (targetId && (kind === 'accept' || kind === 'remove')) homeBus.emit('friendship', userId, targetId);
      }
      if (targetId) homeBus.emit('friendList', userId, targetId);
      else void this.refresh(session);
    } catch (error) {
      console.warn('[buddies] Could not change buddy link', error);
      if (this.links.has(session)) tell(session, 'Friend requests are temporarily unavailable.');
    }
  }

  tick(now: number): void {
    const since = this.lastFocusTick ?? now;
    this.lastFocusTick = now;
    const focusing = new Map<string, PlayerSession>();
    for (const session of this.links.keys()) {
      if (session.userId && session.timer.phase === 'focus') focusing.set(session.userId, session);
    }

    const active = new Set<string>();
    for (const [userId, session] of focusing) {
      for (const link of this.links.get(session) ?? []) {
        if (link.acceptedAt === null || userId >= link.userId) continue;
        const peer = focusing.get(link.userId);
        if (!peer || blocked(session, peer)) continue;
        const start = Math.max(since, link.acceptedAt, session.timer.phaseStartedAt, peer.timer.phaseStartedAt);
        const end = Math.min(now, session.timer.phaseEndsAt ?? now, peer.timer.phaseEndsAt ?? now);
        if (end <= start) continue;
        active.add(link.id);
        let period = this.periods.get(link.id);
        if (!period) {
          period = { id: randomUUID(), first: userId, second: link.userId, duration: 0, savedMinute: 0 };
          this.periods.set(link.id, period);
        }
        period.duration = Math.min(MAX_PERIOD_MS, period.duration + end - start);
        const minute = Math.floor(period.duration / 60_000);
        if (minute > period.savedMinute || period.duration >= MAX_PERIOD_MS) {
          period.savedMinute = minute;
          this.persist(link.id, period);
          if (period.duration >= MAX_PERIOD_MS) this.periods.delete(link.id);
        }
      }
    }

    for (const [id, period] of this.periods) {
      if (active.has(id)) continue;
      this.persist(id, period);
      this.periods.delete(id);
    }
  }

  async refreshAccounts(first: string, second: string | null): Promise<void> {
    for (const session of this.links.keys()) {
      if (session.userId === first || session.userId === second) await this.refresh(session);
    }
  }

  private async refresh(session: PlayerSession): Promise<void> {
    const userId = session.userId;
    if (!userId || !this.links.has(session)) return;
    const revision = (this.revision.get(session) ?? 0) + 1;
    this.revision.set(session, revision);
    const links = await retryOnce('load buddy links', () => loadBuddyLinks(userId));
    if (!links || !this.links.has(session) || this.revision.get(session) !== revision) return;
    this.links.set(session, links);
    this.publishRoster();
  }

  private persist(pairId: string, period: Period): void {
    const { id, first, second } = period;
    const duration = Math.floor(period.duration);
    if (duration <= 0) return;
    const save = retryOnce('save buddy focus', () => saveBuddyFocus(pairId, id, duration)).then((count) => {
      if (count) refreshUsers(first, second);
    });
    this.pendingSaves.add(save);
    void save.then(() => this.pendingSaves.delete(save));
  }
}

function refreshUsers(first: string, second: string | null): void {
  for (const room of ROOMS) void room.refreshAccounts(first, second);
}
