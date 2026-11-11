import type { Client } from '@colyseus/core';
import { IDLE_TIMER, MAX_MOVE_DT_MS, MOVE_SPEED, MOVE_SPEED_TOLERANCE, localDayKey, type Direction, type TimerState } from '@study/shared';
import type { Player } from '../schema/PlayerState';

/** The most movement the server will credit at once, in pixels. */
export const MOVE_BUDGET_CAP = (MOVE_SPEED * MOVE_SPEED_TOLERANCE * MAX_MOVE_DT_MS) / 1000;

/**
 * Everything the server knows about one connected player that is not synced
 * to clients: authoritative full-precision position, timer, seat, rate limits.
 */
export class PlayerSession {
  /** Authoritative feet position. The schema copy is what clients see. */
  x = 0;
  y = 0;
  timer: TimerState = { ...IDLE_TIMER };
  /** `${map}:${seatId}` of the seat being used, or null. */
  seatKey: string | null = null;
  /** Where to put the player when they stand up. */
  standPos: { x: number; y: number; dir: Direction } | null = null;
  lastSeq = 0;
  moving = false;
  /** Movement allowance in pixels; refilled with time, spent by moves. */
  budget = MOVE_BUDGET_CAP;
  budgetAt = Date.now();
  lastMoveAt = 0;
  lastChatAt = 0;
  lastEmoteAt = 0;
  /** When the player last did something; seated players doze off after a while. */
  restSince = Date.now();
  dayKey = localDayKey(Date.now());
  /** Players this one has blocked (session ids). */
  readonly blocked = new Set<string>();

  constructor(
    readonly client: Client,
    readonly player: Player,
  ) {}

  get id(): string {
    return this.client.sessionId;
  }

  /** Moves the player to a position decided by the server (spawn, door, seat). */
  place(x: number, y: number, dir: Direction, map?: string): void {
    this.x = x;
    this.y = y;
    this.player.x = x;
    this.player.y = y;
    this.player.dir = dir;
    if (map !== undefined) this.player.map = map;
    this.budget = MOVE_BUDGET_CAP;
    this.budgetAt = Date.now();
  }
}
