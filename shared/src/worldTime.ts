/**
 * The shared world clock. Time of day and weather are pure functions of the
 * wall clock, so every player on every server sees the same sky without the
 * server sending anything.
 */

/** One game day lasts this long in real time. */
export const DAY_LENGTH_MS = 48 * 60_000;
/** Weather changes at most this often. */
export const WEATHER_SLOT_MS = 12 * 60_000;

/** Game hour of the day, 0 to 24 (not including 24). */
export function gameHour(nowMs: number): number {
  return ((nowMs % DAY_LENGTH_MS) / DAY_LENGTH_MS) * 24;
}

export type DayPhase = 'night' | 'dawn' | 'day' | 'dusk';

export function dayPhase(hour: number): DayPhase {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 18) return 'day';
  if (hour >= 18 && hour < 21) return 'dusk';
  return 'night';
}

/** Multiply colours at hours of the day; white leaves the picture unchanged. */
const TINT_STOPS: readonly [number, string][] = [
  [0, '#3a4676'],
  [5, '#3a4676'],
  [6.5, '#e8b48e'],
  [8, '#ffffff'],
  [17.5, '#ffffff'],
  [19, '#f2a77a'],
  [20.5, '#68588f'],
  [22, '#3a4676'],
  [24, '#3a4676'],
];

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Blends two colours; t = 0 gives a, t = 1 gives b. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
}

/** The multiply colour for the sky at a game hour, blended smoothly between the stops. */
export function skyTint(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 1; i < TINT_STOPS.length; i++) {
    const [h1, c1] = TINT_STOPS[i]!;
    const [h0, c0] = TINT_STOPS[i - 1]!;
    if (h <= h1) return mixHex(c0, c1, h1 === h0 ? 0 : (h - h0) / (h1 - h0));
  }
  return TINT_STOPS[0]![1];
}

/** How dark it is, from 0 (full daylight) to 1 (deep night). Drives lamp glow. */
export function darkness(hour: number): number {
  const [r, g, b] = parseHex(skyTint(hour));
  const brightness = (r + g + b) / (3 * 255);
  return Math.min(1, Math.max(0, (1 - brightness) / (1 - 0.32)));
}

export type Weather = 'clear' | 'cloudy' | 'rain';

export interface WeatherState {
  weather: Weather;
  /** 0 to 1: how heavy the rain or cloud is. */
  intensity: number;
}

function slotHash(slot: number): number {
  let x = (slot * 0x9e3779b1) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** The weather at an instant: about half clear, a quarter cloudy, a quarter rain. */
export function weatherAt(nowMs: number): WeatherState {
  const slot = Math.floor(nowMs / WEATHER_SLOT_MS);
  const roll = slotHash(slot);
  const strength = 0.4 + slotHash(slot + 7919) * 0.6;
  if (roll < 0.25) return { weather: 'rain', intensity: strength };
  if (roll < 0.5) return { weather: 'cloudy', intensity: strength };
  return { weather: 'clear', intensity: 0 };
}

/** Extra multiply colour laid over the sky tint for a weather state. */
export function weatherTint(state: WeatherState): string {
  if (state.weather === 'rain') return mixHex('#ffffff', '#a9b3c8', state.intensity);
  if (state.weather === 'cloudy') return mixHex('#ffffff', '#cfd3dc', state.intensity);
  return '#ffffff';
}

/** Multiplies two hex colours channel by channel, like the MULTIPLY blend mode. */
export function multiplyHex(a: string, b: string): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toHex([(ca[0] * cb[0]) / 255, (ca[1] * cb[1]) / 255, (ca[2] * cb[2]) / 255]);
}
