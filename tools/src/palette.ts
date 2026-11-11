import type { Ramp } from '@study/shared';
import { parseColor } from './png';

/** The project's limited warm palette. Everything is drawn from these. */
export const PAL = {
  ink: '#2a1b2e',
  cream: '#fbf5ea',
  paper: '#f5e3b5',
  sand: '#e3c28f',
  tan: '#c1946a',
  wood: '#96694f',
  bark: '#6e4a43',
  cocoa: '#4a2f3a',
  leafLight: '#a9c466',
  leaf: '#86a856',
  leafDark: '#5f8a4a',
  pine: '#3f6648',
  moss: '#2f4a3c',
  sky: '#a3c5cf',
  water: '#6b9ab8',
  deep: '#44608a',
  navy: '#2e3f5c',
  brick: '#b04a4a',
  wine: '#7a2f3f',
  coral: '#d9765a',
  peach: '#eda67a',
  pink: '#e58fa0',
  blush: '#f5c0c0',
  plum: '#75507a',
  lilac: '#a57fa3',
  gold: '#f0c552',
  amber: '#d99a3a',
  glow: '#fbe68e',
  stone: '#cbbba6',
  slate: '#8a8088',
  ash: '#5b5560',
  fog: '#e6dcd5',
} as const;

/** Marker ramps drawn into recolourable sheets and swapped at runtime. */
export const MARK_PRIMARY: Ramp = ['#f0f0f0', '#b4b4b4', '#787878'];
export const MARK_SECONDARY: Ramp = ['#f000f0', '#b400b4', '#780078'];

const hex2 = (n: number): string => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

/** Linear blend of two colours; t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  return `#${hex2(ca[0] + (cb[0] - ca[0]) * t)}${hex2(ca[1] + (cb[1] - ca[1]) * t)}${hex2(ca[2] + (cb[2] - ca[2]) * t)}`;
}

/** Builds a light/mid/dark ramp: highlights lean warm, shadows lean to ink. */
export function ramp(base: string, lightAmount = 0.34, darkAmount = 0.36): Ramp {
  return [mix(base, '#fff1c9', lightAmount), base, mix(base, PAL.ink, darkAmount)];
}

/** Skin ramps use a rosy shadow instead of a grey one. */
export function skinRamp(base: string): Ramp {
  return [base, mix(base, '#b4525e', 0.26), mix(base, PAL.ink, 0.62)];
}

/** Adds an alpha channel to a '#rrggbb' colour. */
export function withAlpha(color: string, alpha: number): string {
  return `${color.slice(0, 7)}${hex2(alpha * 255)}`;
}
