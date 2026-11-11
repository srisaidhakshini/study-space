import type { WeatherState } from '@study/shared';
import type { Settings } from '../state/settings';

/** Pure decisions behind the audio manager, kept free of Web Audio so they can be checked in Node. */

/** How long a place change takes to crossfade, in seconds. */
export const CROSSFADE_SECONDS = 1.5;
/** How long rain takes to fade in and out, in seconds. */
export const RAIN_FADE_SECONDS = 3;
/** Music is ducked by this fraction while the player's own focus timer runs. */
export const FOCUS_DUCK = 0.4;
/** Rain heard from indoors is quieter than outdoors, and muffled by a low-pass filter. */
export const INDOOR_RAIN_GAIN = 0.45;
export const OUTDOOR_FILTER_HZ = 18000;
export const INDOOR_FILTER_HZ = 700;

export type LoopChannel = 'music' | 'ambience';

/** Gain of the master bus: the master volume, or silence while muted. */
export function masterGain(settings: Settings): number {
  return settings.muted ? 0 : settings.master;
}

/** Gain of a channel bus (before the master). Music is ducked while studying. */
export function channelGain(settings: Settings, channel: LoopChannel, focusing: boolean): number {
  if (channel === 'ambience') return settings.ambience;
  return settings.music * (focusing ? 1 - FOCUS_DUCK : 1);
}

/**
 * Gain of the rain bus (before the master): the ambience volume scaled by how
 * heavy the rain is and quieter indoors. Zero when rain is off or it is dry.
 */
export function rainGain(settings: Settings, weather: WeatherState, indoor: boolean): number {
  if (!settings.rain || weather.weather !== 'rain') return 0;
  const strength = 0.25 + 0.75 * weather.intensity;
  return settings.ambience * strength * (indoor ? INDOOR_RAIN_GAIN : 1);
}

export function rainFilterHz(indoor: boolean): number {
  return indoor ? INDOOR_FILTER_HZ : OUTDOOR_FILTER_HZ;
}

/** What to do with a channel's loop when the place changes. */
export type LoopPlan = 'keep' | 'swap' | 'start' | 'stop' | 'none';

/**
 * A loop that is already playing is never restarted; a different one is
 * crossfaded in; a place with no sound fades the old loop out.
 */
export function planLoop(current: string | null, wanted: string | undefined): LoopPlan {
  if (!wanted) return current ? 'stop' : 'none';
  if (current === wanted) return 'keep';
  return current ? 'swap' : 'start';
}

/** Whether a keyboard target is somewhere text is typed (so shortcut keys must not fire). */
export function isTypingTarget(tag: string, editable: boolean): boolean {
  return editable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
