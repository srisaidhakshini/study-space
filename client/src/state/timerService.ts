import {
  advanceTimer,
  IDLE_TIMER,
  sanitizeTimerConfig,
  startTimer,
  stopTimer,
  type PlayerSnapshot,
  type TimerConfig,
  type TimerEvent,
  type TimerState,
} from '@study/shared';
import type { NetClient } from '../net/NetClient';
import { Emitter, loadJson, saveJson } from './emitter';
import type { SessionStore } from './sessions';

const CONFIG_KEY = 'study-space/timer-config';

export const DEFAULT_TIMER_CONFIG: TimerConfig = {
  mode: 'pomodoro',
  focusMin: 25,
  breakMin: 5,
  autoRepeat: false,
  subject: 'general',
};

/**
 * The study timer, in two modes with one API.
 *
 * Offline it runs locally. Online the server is the source of truth: this
 * class sends start and stop requests and rebuilds `state` from the player's
 * synced fields, so the HUD renders the countdown without caring which mode
 * is active. A timer can only run while seated either way.
 */
export class TimerService {
  /** Fires whenever the timer state or the seat changes. */
  readonly changed = new Emitter();
  /** Fires for each phase boundary (focus done, break started, ...). */
  readonly events = new Emitter<TimerEvent>();

  private current: TimerState = { ...IDLE_TIMER };
  private seat: string | null = null;
  private lastConfig: TimerConfig;
  private online = false;

  constructor(
    private readonly sessions: SessionStore,
    private readonly net: NetClient,
  ) {
    this.lastConfig = sanitizeTimerConfig({ ...DEFAULT_TIMER_CONFIG, ...(loadJson<TimerConfig>(CONFIG_KEY) ?? {}) });
    window.setInterval(() => this.tick(), 250);
    window.addEventListener('pagehide', () => this.stop());
    net.changed.subscribe(() => this.netChanged());
    net.patched.subscribe(() => this.mirrorServer());
    net.timerEvents.subscribe((event) => this.events.emit(event));
    net.sessionRecords.subscribe((record) => this.sessions.add(record));
  }

  get state(): TimerState {
    return this.current;
  }

  get seatId(): string | null {
    return this.seat;
  }

  get seated(): boolean {
    return this.seat !== null;
  }

  /** The settings used last time, to prefill the timer panel. */
  get config(): TimerConfig {
    return this.lastConfig;
  }

  /** Called by the game when the player sits down (seat id) or stands (null). */
  setSeat(seatId: string | null): void {
    if (this.seat === seatId) return;
    this.seat = seatId;
    // Online, the server ends the session when it stands the player up.
    if (seatId === null && !this.online && this.current.phase !== 'idle') {
      this.stop();
      return;
    }
    this.changed.emit();
  }

  /** Starts a session. Returns false when the player is not seated. */
  start(config: TimerConfig): boolean {
    if (!this.seated) return false;
    this.lastConfig = sanitizeTimerConfig(config);
    saveJson(CONFIG_KEY, this.lastConfig);
    if (this.online) {
      this.net.sendTimerStart(this.lastConfig);
      return true;
    }
    this.current = startTimer(this.lastConfig, Date.now());
    this.events.emit('focusStart');
    this.changed.emit();
    return true;
  }

  /** Ends the session now, crediting the whole minutes of focus done. */
  stop(): void {
    if (this.current.phase === 'idle') return;
    if (this.online) {
      this.net.sendTimerStop();
      return;
    }
    this.tick();
    const { state, record } = stopTimer(this.current, Date.now());
    this.current = state;
    if (record) this.sessions.add(record);
    this.changed.emit();
  }

  /** Switches between local and server-driven mode when the connection changes. */
  private netChanged(): void {
    const online = this.net.online;
    if (online === this.online) return;
    if (!this.online) {
      // Going online: bank what the local timer has done, then hand over.
      const { record } = stopTimer(this.current, Date.now());
      if (record) this.sessions.add(record);
    }
    this.online = online;
    this.current = { ...IDLE_TIMER };
    this.seat = null;
    this.changed.emit();
    if (online) this.mirrorServer();
  }

  /** Rebuilds the timer state from the player's synced fields. */
  private mirrorServer(): void {
    if (!this.online) return;
    const me = this.net.self();
    if (!me) return;
    const next = this.fromSnapshot(me);
    const prev = this.current;
    if (
      next.phase === prev.phase &&
      next.cycle === prev.cycle &&
      next.phaseStartedAt === prev.phaseStartedAt &&
      next.phaseEndsAt === prev.phaseEndsAt &&
      next.config?.subject === prev.config?.subject
    ) {
      return;
    }
    if (prev.phase === 'idle' && next.phase === 'focus') this.net.noteTimerStarted(me.phaseStartedAt);
    this.current = next;
    this.changed.emit();
  }

  private fromSnapshot(me: PlayerSnapshot): TimerState {
    if (me.phase === 'idle') return { ...IDLE_TIMER, cycle: me.cycle };
    const startedAt = this.net.toLocalTime(me.phaseStartedAt);
    const endsAt = me.phaseEndsAt > 0 ? this.net.toLocalTime(me.phaseEndsAt) : null;
    const focusMin =
      me.phase === 'focus' && endsAt !== null ? Math.max(1, Math.round((endsAt - startedAt) / 60_000)) : this.lastConfig.focusMin;
    return {
      phase: me.phase,
      config: { ...this.lastConfig, mode: me.mode, subject: me.subject, focusMin },
      phaseStartedAt: startedAt,
      phaseEndsAt: endsAt,
      cycle: me.cycle,
    };
  }

  private tick(): void {
    if (this.online || this.current.phase === 'idle') return;
    const step = advanceTimer(this.current, Date.now());
    if (step.state === this.current) return;
    this.current = step.state;
    for (const record of step.records) this.sessions.add(record);
    for (const event of step.events) this.events.emit(event);
    this.changed.emit();
  }
}
