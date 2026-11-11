/** Size of one map tile in pixels. */
export const TILE = 16;

/** Size of one character frame in pixels. */
export const CHAR_W = 32;
export const CHAR_H = 48;

/** Walking speed in pixels per second. */
export const MOVE_SPEED = 78;

/**
 * Collision box around a character's feet. A character's position is the
 * centre of its feet; the box spans x±halfW and y-height..y.
 */
export const FEET_BOX = { halfW: 5, height: 6 } as const;

/** Where the feet rest inside a tile when following a path. */
export const FEET_ANCHOR = { x: 8, y: 11 } as const;

export const DIRECTIONS = ['down', 'left', 'right', 'up'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const DIR_VECTORS: Record<Direction, { x: number; y: number }> = {
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
};

export function isDirection(value: unknown): value is Direction {
  return typeof value === 'string' && (DIRECTIONS as readonly string[]).includes(value);
}

/** Picks the facing direction that best matches a movement vector. */
export function directionFromVector(dx: number, dy: number, fallback: Direction): Direction {
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/** Seconds a seated player must be inactive (with no timer) before dozing off. */
export const SLEEP_AFTER_IDLE_SEC = 120;

export const NAME_MAX_LENGTH = 16;
