import { MOVE_SPEED, MOVE_SPEED_TOLERANCE, feetBlocked, isDirection, type MoveMessage } from '@study/shared';
import type { ServerMap } from '../world/maps';
import { isFiniteNumber, isPlainObject } from './text';
import { MOVE_BUDGET_CAP, type PlayerSession } from './session';

/** Slack in pixels for rounding and float32 storage. */
const SLACK = 1.5;
/** Spacing of the wall checks along a move, in pixels. */
const SWEEP_STEP = 4;

export type MoveVerdict = 'ok' | 'ignore' | 'reject';

/** Reads a move message from untrusted input, or null if malformed. */
export function parseMove(raw: unknown): MoveMessage | null {
  if (!isPlainObject(raw)) return null;
  const { seq, x, y, dir, moving } = raw;
  if (!isFiniteNumber(seq) || !isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  if (!isDirection(dir) || typeof moving !== 'boolean') return null;
  return { seq, x, y, dir, moving };
}

/**
 * Decides whether a claimed position is reachable. The server credits a
 * movement allowance at MOVE_SPEED x tolerance and the move spends it, so a
 * burst of delayed messages is fine while sustained speed hacks are not. The
 * straight line must also stay clear of walls.
 *
 * 'ignore' is for stale or repeated messages (no reply needed); 'reject'
 * means the client is out of step and must be corrected.
 */
export function checkMove(s: PlayerSession, map: ServerMap, move: MoveMessage, now: number): MoveVerdict {
  if (move.seq <= s.lastSeq) return 'ignore';
  s.lastSeq = move.seq;

  const elapsed = Math.max(0, now - s.budgetAt);
  s.budget = Math.min(MOVE_BUDGET_CAP, s.budget + (MOVE_SPEED * MOVE_SPEED_TOLERANCE * elapsed) / 1000);
  s.budgetAt = now;

  if (s.seatKey !== null) return 'reject';
  const dx = move.x - s.x;
  const dy = move.y - s.y;
  const dist = Math.hypot(dx, dy);
  if (dist > s.budget + SLACK) return 'reject';

  const steps = Math.max(1, Math.ceil(dist / SWEEP_STEP));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (feetBlocked(map.collision, s.x + dx * t, s.y + dy * t)) return 'reject';
  }
  s.budget = Math.max(0, s.budget - dist);
  return 'ok';
}
