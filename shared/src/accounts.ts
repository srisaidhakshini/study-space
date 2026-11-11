import type { Appearance } from './character';
import type { SessionRecord } from './timer';

/** Accounts, study statistics and coins. Shared by the server and the client. */

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Focus coins earned per whole minute of focus time. Coins come from nothing else. */
export const COINS_PER_MINUTE = 1;
/** A day counts towards the streak once it holds at least this many focus minutes. */
export const STREAK_MIN_MINUTES = 10;
/** The longest a single imported or recorded session may be, in minutes. */
export const MAX_SESSION_MINUTES = 12 * 60;
/** How many past sessions a device may import when signing up. */
export const MAX_IMPORT_SESSIONS = 500;
/** How many recent sessions the stats page lists. */
export const RECENT_SESSIONS_SHOWN = 20;
/** How many days the stats page charts. */
export const STATS_DAYS = 14;

/** Codes a join can be refused with (the SDK error's `code`; its message is readable). */
export const JOIN_ERROR = {
  /** The token is missing, tampered with or expired: sign in again. */
  invalidToken: 4401,
  /** Postgres is down, so account players cannot join. Guests still can. */
  accountsUnavailable: 4503,
  /** Close code for the older connection when the same account joins again. */
  signedInElsewhere: 4409,
} as const;

export function coinsForMinutes(minutes: number): number {
  return Math.max(0, Math.floor(minutes)) * COINS_PER_MINUTE;
}

// ---- Days and streaks ------------------------------------------------------

/** Local calendar day (YYYY-MM-DD) of an instant, for a UTC offset in minutes east. */
export function dayKeyAt(epochMs: number, tzOffsetMin: number): string {
  return new Date(epochMs + tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

/** The day before or after a YYYY-MM-DD key. */
export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export interface Streaks {
  /** Consecutive qualifying days ending today, or yesterday if today has not qualified yet. */
  current: number;
  longest: number;
}

/**
 * Streaks from the set of days that qualified. A streak survives until the end
 * of the day after the last qualifying day, so studying yesterday but not yet
 * today still shows the running streak.
 */
export function computeStreaks(qualifyingDays: Iterable<string>, today: string): Streaks {
  const days = [...new Set(qualifyingDays)].sort();
  let longest = 0;
  let run = 0;
  let previous = '';
  for (const day of days) {
    run = previous !== '' && shiftDay(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  const set = new Set(days);
  let cursor = set.has(today) ? today : shiftDay(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current += 1;
    cursor = shiftDay(cursor, -1);
  }
  return { current, longest };
}

// ---- REST API --------------------------------------------------------------

export interface AccountInfo {
  id: string;
  email: string;
  name: string;
  appearance: Appearance | null;
  pet: string;
  coins: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  /** The look the player made as a guest, saved as their starting profile. */
  appearance?: Appearance;
  pet?: string;
}
export interface LoginRequest {
  email: string;
  password: string;
}
/** Response of register and login. The token goes in `Authorization: Bearer`. */
export interface AuthResponse {
  token: string;
  account: AccountInfo;
}
/** GET /api/me */
export interface MeResponse {
  account: AccountInfo;
}
/** PUT /api/profile — every field optional. */
export interface ProfileUpdate {
  name?: string;
  appearance?: Appearance;
  pet?: string;
}
/** POST /api/sessions/import — history from a guest device. Earns no coins. */
export interface ImportRequest {
  sessions: SessionRecord[];
}
export interface ImportResponse {
  imported: number;
}

export interface DayStat {
  day: string;
  minutes: number;
  sessions: number;
}
export interface SubjectStat {
  subject: string;
  minutes: number;
}
export interface SessionSummary {
  subject: string;
  startedAt: number;
  minutes: number;
  completed: boolean;
}

/** GET /api/stats?tz=<minutes east of UTC> */
export interface StatsResponse {
  today: DayStat;
  /** The last STATS_DAYS days, oldest first, zero-filled. */
  days: DayStat[];
  streak: Streaks;
  totalMinutes: number;
  totalSessions: number;
  coins: number;
  subjects: SubjectStat[];
  recent: SessionSummary[];
}

/** Pushed over the room after every finished session and on join. */
export interface StatsMessage {
  coins: number;
  todayMinutes: number;
  todaySessions: number;
  streak: Streaks;
}
