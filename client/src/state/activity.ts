import { dayKeyAt, shiftDay } from '@study/shared';
import type { NetClient } from '../net/NetClient';
import { Emitter, loadJson, saveJson } from './emitter';
import type { TimerService } from './timerService';

const KEY = 'study-space/activity';
const TICK_MS = 1000;
const SAVE_EVERY_MS = 15_000;
/** Longer gaps (a sleeping laptop) are not counted as time in the app. */
const MAX_GAP_MS = 5000;
const KEEP_DAYS = 60;

/** Seconds spent, for one day. */
export interface DayActivity {
  /** In the app (tab visible, or in a call). */
  app: number;
  /** In a voice or video call. */
  call: number;
  /** A focus timer was running. */
  focus: number;
  /** In a room with at least one accepted friend. */
  withFriends: number;
  /** Focusing while at least one accepted friend was in the room. */
  focusWithFriends: number;
  /** In a call while at least one accepted friend was in the room. */
  callWithFriends: number;
}

export interface FriendActivity {
  name: string;
  /** Seconds in the same room. */
  together: number;
  /** Seconds you focused while they were in the room. */
  focus: number;
}

interface Saved {
  days: Record<string, DayActivity>;
  friends: Record<string, FriendActivity>;
}

const emptyDay = (): DayActivity => ({ app: 0, call: 0, focus: 0, withFriends: 0, focusWithFriends: 0, callWithFriends: 0 });

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * Counts how long you spend in the app, in calls, studying, and with friends.
 * It is kept on this device only, by day, and only counts moments it can see.
 */
export class ActivityTracker {
  readonly changed = new Emitter();
  private data: Saved;
  private last = Date.now();
  private lastSave = 0;

  constructor(
    private readonly net: NetClient,
    private readonly timer: TimerService,
    private readonly tzOffsetMin: () => number,
  ) {
    const saved = loadJson<Partial<Saved>>(KEY) ?? {};
    this.data = { days: {}, friends: {} };
    for (const [day, d] of Object.entries(saved.days ?? {})) {
      const v = d as Partial<DayActivity>;
      this.data.days[day] = {
        app: num(v.app),
        call: num(v.call),
        focus: num(v.focus),
        withFriends: num(v.withFriends),
        focusWithFriends: num(v.focusWithFriends),
        callWithFriends: num(v.callWithFriends),
      };
    }
    for (const [id, f] of Object.entries(saved.friends ?? {})) {
      const v = f as Partial<FriendActivity>;
      this.data.friends[id] = { name: typeof v.name === 'string' ? v.name : 'Friend', together: num(v.together), focus: num(v.focus) };
    }
  }

  start(): void {
    window.setInterval(() => this.tick(), TICK_MS);
    window.addEventListener('pagehide', () => this.save());
  }

  private tick(): void {
    const now = Date.now();
    const gap = now - this.last;
    this.last = now;
    if (gap <= 0 || gap > MAX_GAP_MS) return;
    const seconds = gap / 1000;

    const inCall = this.net.voice.state === 'on' || this.net.video.state === 'on';
    if (document.hidden && !inCall) return;
    const focusing = this.timer.state.phase === 'focus';

    const day = (this.data.days[dayKeyAt(now, this.tzOffsetMin())] ??= emptyDay());
    day.app += seconds;
    if (inCall) day.call += seconds;
    if (focusing) day.focus += seconds;

    const friendsHere = this.friendsInRoom();
    if (friendsHere.length > 0) {
      day.withFriends += seconds;
      if (focusing) day.focusWithFriends += seconds;
      if (inCall) day.callWithFriends += seconds;
      for (const { id, name } of friendsHere) {
        const f = (this.data.friends[id] ??= { name, together: 0, focus: 0 });
        f.name = name;
        f.together += seconds;
        if (focusing) f.focus += seconds;
      }
    }

    if (now - this.lastSave > SAVE_EVERY_MS) this.save();
    this.changed.emit();
  }

  /** Accepted friends who are in the same room as you right now. */
  private friendsInRoom(): { id: string; name: string }[] {
    if (this.net.status !== 'online') return [];
    const { links, online } = this.net.buddies;
    const present = new Set(Object.values(online));
    return links.filter((l) => l.status === 'accepted' && present.has(l.id)).map((l) => ({ id: l.id, name: l.name }));
  }

  /** Totals for the last `days` days (1 = today only). */
  total(days: number): DayActivity {
    const sum = emptyDay();
    let key = dayKeyAt(Date.now(), this.tzOffsetMin());
    for (let i = 0; i < days; i++) {
      const d = this.data.days[key];
      if (d) for (const field of Object.keys(sum) as (keyof DayActivity)[]) sum[field] += d[field];
      key = shiftDay(key, -1);
    }
    return sum;
  }

  /** Friends you have spent time with, most studying together first. */
  friendsRanked(): FriendActivity[] {
    return Object.values(this.data.friends)
      .filter((f) => f.together >= 60)
      .sort((a, b) => b.focus - a.focus || b.together - a.together);
  }

  private save(): void {
    this.lastSave = Date.now();
    const cutoff = shiftDay(dayKeyAt(this.lastSave, this.tzOffsetMin()), -KEEP_DAYS);
    for (const day of Object.keys(this.data.days)) if (day < cutoff) delete this.data.days[day];
    saveJson(KEY, this.data);
  }
}
