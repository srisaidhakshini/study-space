import { DIRECTIONS, type Direction } from './constants';

/**
 * Frame layout shared by every character layer sheet.
 *
 * A sheet is SHEET_COLUMNS frames wide and one row per direction, in the order
 * of DIRECTIONS (down, left, right, up). Each animation owns a run of columns.
 * See docs/ASSETS.md for the full description.
 */
export interface AnimationDef {
  /** First column of the animation. */
  start: number;
  /** Number of columns. */
  frames: number;
  /** Playback speed in frames per second. */
  fps: number;
  /** -1 loops forever, 0 plays once. */
  repeat: number;
  /** Play forward then backward. */
  yoyo: boolean;
}

export const ANIMATIONS = {
  idle: { start: 0, frames: 2, fps: 2, repeat: -1, yoyo: false },
  walk: { start: 2, frames: 4, fps: 8, repeat: -1, yoyo: false },
  sit: { start: 6, frames: 1, fps: 1, repeat: -1, yoyo: false },
  study: { start: 7, frames: 3, fps: 4, repeat: -1, yoyo: true },
  pageturn: { start: 10, frames: 1, fps: 2, repeat: 0, yoyo: false },
  sleep: { start: 11, frames: 2, fps: 1, repeat: -1, yoyo: false },
  drink: { start: 13, frames: 3, fps: 3, repeat: 1, yoyo: true },
  wave: { start: 16, frames: 2, fps: 5, repeat: 3, yoyo: false },
  stretch: { start: 18, frames: 3, fps: 3, repeat: 0, yoyo: true },
} as const satisfies Record<string, AnimationDef>;

export type AnimationName = keyof typeof ANIMATIONS;

export const ANIMATION_NAMES = Object.keys(ANIMATIONS) as AnimationName[];

/** Total number of columns in a character sheet. */
export const SHEET_COLUMNS = 21;

export const SHEET_ROWS = DIRECTIONS.length;

/** Index of a frame inside a character sheet (row-major). */
export function frameIndex(direction: Direction, column: number): number {
  return DIRECTIONS.indexOf(direction) * SHEET_COLUMNS + column;
}

/** Layout of a pet sheet: 16x16 frames, one row per direction. */
export const PET_FRAME = 16;
export const PET_ANIMATIONS = {
  idle: { start: 0, frames: 2, fps: 2, repeat: -1, yoyo: false },
  walk: { start: 2, frames: 2, fps: 6, repeat: -1, yoyo: false },
} as const satisfies Record<string, AnimationDef>;
export const PET_COLUMNS = 4;
export type PetAnimationName = keyof typeof PET_ANIMATIONS;
