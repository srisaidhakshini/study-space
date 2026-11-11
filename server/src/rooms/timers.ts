import {
  SLEEP_AFTER_IDLE_SEC,
  SUBJECTS,
  localDayKey,
  sanitizeTimerConfig,
  type AnimState,
  type SessionRecord,
  type TimerConfig,
  type TimerState,
} from '@study/shared';
import type { Player } from '../schema/PlayerState';
import { isFiniteNumber, isPlainObject } from './text';
import type { PlayerSession } from './session';

/** Reads a timer config from untrusted input, or null if malformed. */
export function parseTimerConfig(raw: unknown): TimerConfig | null {
  if (!isPlainObject(raw)) return null;
  const { mode, focusMin, breakMin, autoRepeat, subject } = raw;
  if (!isFiniteNumber(focusMin) || !isFiniteNumber(breakMin)) return null;
  // Only known subjects: the id is shown above the player's head to everyone.
  const known = SUBJECTS.some((s) => s.id === subject) ? (subject as string) : 'general';
  return sanitizeTimerConfig({
    mode: mode === 'stopwatch' ? 'stopwatch' : 'pomodoro',
    focusMin,
    breakMin,
    autoRepeat: autoRepeat === true,
    subject: known,
  });
}

/** Copies a timer state into the synced player fields. */
export function writeTimer(player: Player, timer: TimerState): void {
  player.phase = timer.phase;
  player.mode = timer.config?.mode ?? 'pomodoro';
  player.subject = timer.config?.subject ?? '';
  player.phaseStartedAt = timer.phase === 'idle' ? 0 : timer.phaseStartedAt;
  player.phaseEndsAt = timer.phaseEndsAt ?? 0;
  player.cycle = timer.cycle;
}

/** Adds finished sessions to the player's count for today, rolling over at midnight. */
export function countRecords(s: PlayerSession, records: readonly SessionRecord[], now: number): void {
  rollDay(s, now);
  for (const record of records) if (record.completed) s.player.sessionsToday += 1;
}

export function rollDay(s: PlayerSession, now: number): void {
  const key = localDayKey(now);
  if (key === s.dayKey) return;
  s.dayKey = key;
  s.player.sessionsToday = 0;
}

/** Which looping animation the player should show right now. */
export function deriveAnim(s: PlayerSession, now: number): AnimState {
  if (s.seatKey === null) {
    return s.moving && now - s.lastMoveAt < 600 ? 'walk' : 'idle';
  }
  if (s.timer.phase === 'focus') return 'study';
  if (s.timer.phase === 'idle' && now - s.restSince > SLEEP_AFTER_IDLE_SEC * 1000) return 'sleep';
  return 'sit';
}
