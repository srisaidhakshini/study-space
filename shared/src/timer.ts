/**
 * Study timer state machine. Pure functions over timestamps, so the same code
 * runs on the client (phase 1) and on the authoritative server (phase 2+).
 */

export type TimerMode = 'pomodoro' | 'stopwatch';
export type TimerPhase = 'idle' | 'focus' | 'break';

export interface TimerConfig {
  mode: TimerMode;
  /** Focus length in minutes (ignored by the stopwatch). */
  focusMin: number;
  /** Break length in minutes; 0 means no break. */
  breakMin: number;
  /** Start the next focus block automatically after each break. */
  autoRepeat: boolean;
  /** Subject id from SUBJECTS. */
  subject: string;
}

export interface TimerState {
  phase: TimerPhase;
  config: TimerConfig | null;
  /** Epoch ms when the current phase began. */
  phaseStartedAt: number;
  /** Epoch ms when the current phase ends; null while idle or in stopwatch mode. */
  phaseEndsAt: number | null;
  /** Focus blocks finished since the timer was started. */
  cycle: number;
}

export interface SessionRecord {
  subject: string;
  mode: TimerMode;
  startedAt: number;
  endedAt: number;
  /** Whole minutes of focus credited. */
  minutes: number;
  /** True when the focus block ran to its end (or a long enough stopwatch). */
  completed: boolean;
}

export type TimerEvent = 'focusStart' | 'focusDone' | 'breakStart' | 'breakDone';

export interface TimerStep {
  state: TimerState;
  records: SessionRecord[];
  events: TimerEvent[];
}

export interface TimerPreset {
  id: string;
  label: string;
  focusMin: number;
  breakMin: number;
}

export const TIMER_PRESETS: readonly TimerPreset[] = [
  { id: '25-5', label: '25 / 5', focusMin: 25, breakMin: 5 },
  { id: '50-10', label: '50 / 10', focusMin: 50, breakMin: 10 },
];

export const TIMER_LIMITS = {
  focusMin: { min: 1, max: 180 },
  breakMin: { min: 0, max: 60 },
} as const;

/** A stopwatch session counts as completed once it reaches this many minutes. */
export const STOPWATCH_COMPLETE_MIN = 10;

const MINUTE = 60_000;

export const IDLE_TIMER: TimerState = {
  phase: 'idle',
  config: null,
  phaseStartedAt: 0,
  phaseEndsAt: null,
  cycle: 0,
};

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function sanitizeTimerConfig(input: TimerConfig): TimerConfig {
  return {
    mode: input.mode === 'stopwatch' ? 'stopwatch' : 'pomodoro',
    focusMin: clampInt(input.focusMin, TIMER_LIMITS.focusMin.min, TIMER_LIMITS.focusMin.max),
    breakMin: clampInt(input.breakMin, TIMER_LIMITS.breakMin.min, TIMER_LIMITS.breakMin.max),
    autoRepeat: input.autoRepeat === true,
    subject: String(input.subject ?? '').slice(0, 24),
  };
}

function focusState(config: TimerConfig, startedAt: number, cycle: number): TimerState {
  return {
    phase: 'focus',
    config,
    phaseStartedAt: startedAt,
    phaseEndsAt: config.mode === 'stopwatch' ? null : startedAt + config.focusMin * MINUTE,
    cycle,
  };
}

export function startTimer(config: TimerConfig, now: number): TimerState {
  return focusState(sanitizeTimerConfig(config), now, 0);
}

/**
 * Moves the timer forward to `now`, crossing as many phase boundaries as have
 * passed (a tab can sleep through several). Returns finished sessions and the
 * events that happened, in order.
 */
export function advanceTimer(state: TimerState, now: number): TimerStep {
  const records: SessionRecord[] = [];
  const events: TimerEvent[] = [];
  let current = state;

  for (let guard = 0; guard < 500; guard++) {
    const config = current.config;
    const endsAt = current.phaseEndsAt;
    if (current.phase === 'idle' || !config || endsAt === null || now < endsAt) break;

    if (current.phase === 'focus') {
      records.push({
        subject: config.subject,
        mode: config.mode,
        startedAt: current.phaseStartedAt,
        endedAt: endsAt,
        minutes: config.focusMin,
        completed: true,
      });
      events.push('focusDone');
      const cycle = current.cycle + 1;
      if (config.breakMin > 0) {
        current = {
          phase: 'break',
          config,
          phaseStartedAt: endsAt,
          phaseEndsAt: endsAt + config.breakMin * MINUTE,
          cycle,
        };
        events.push('breakStart');
      } else if (config.autoRepeat) {
        current = focusState(config, endsAt, cycle);
        events.push('focusStart');
      } else {
        current = { ...IDLE_TIMER, cycle };
      }
    } else {
      events.push('breakDone');
      if (config.autoRepeat) {
        current = focusState(config, endsAt, current.cycle);
        events.push('focusStart');
      } else {
        current = { ...IDLE_TIMER, cycle: current.cycle };
      }
    }
  }
  return { state: current, records, events };
}

/**
 * Ends the timer early (standing up, or pressing stop). A focus block in
 * progress is credited with the whole minutes done so far.
 */
export function stopTimer(state: TimerState, now: number): { state: TimerState; record: SessionRecord | null } {
  const idle: TimerState = { ...IDLE_TIMER };
  const config = state.config;
  if (state.phase !== 'focus' || !config) return { state: idle, record: null };
  const minutes = Math.floor(Math.max(0, now - state.phaseStartedAt) / MINUTE);
  if (minutes < 1) return { state: idle, record: null };
  return {
    state: idle,
    record: {
      subject: config.subject,
      mode: config.mode,
      startedAt: state.phaseStartedAt,
      endedAt: now,
      minutes,
      completed: config.mode === 'stopwatch' && minutes >= STOPWATCH_COMPLETE_MIN,
    },
  };
}

/** Milliseconds to show on the clock: time left, or time elapsed for a stopwatch. */
export function clockMs(state: TimerState, now: number): number {
  if (state.phase === 'idle') return 0;
  if (state.phaseEndsAt === null) return Math.max(0, now - state.phaseStartedAt);
  return Math.max(0, state.phaseEndsAt - now);
}

/** Formats milliseconds as m:ss, or h:mm:ss past an hour. */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000 - 0.001);
  const s = Math.max(0, total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Key for grouping sessions by local calendar day (YYYY-MM-DD). */
export function localDayKey(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
