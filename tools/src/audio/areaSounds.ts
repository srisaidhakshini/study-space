import { AUDIO_KEYS } from '@study/shared';
import { AMBIENCE } from './ambience';
import type { Buf } from './dsp';
import { MUSIC } from './music';

/**
 * Which ambience loop and which music track play in each place. A place with
 * no `music` is silent apart from its ambience (the library, for studying).
 * Adding a map? Add a line here; places not listed here get no sound.
 */
export const AREA_SOUNDS: Record<string, { ambience?: string; music?: string }> = {
  hub: { ambience: 'amb_town', music: 'music_lofi_day' },
  library: { ambience: 'amb_library' },
  cafe: { ambience: 'amb_cafe', music: 'music_lofi_cafe' },
  kitchen: { ambience: 'amb_kitchen', music: 'music_lofi_day' },
  garden: { ambience: 'amb_garden', music: 'music_lofi_day' },
  riverside: { ambience: 'amb_river', music: 'music_lofi_day' },
  portal: { ambience: 'amb_portal', music: 'music_lofi_night' },
  skyisland: { ambience: 'amb_sky', music: 'music_lofi_day' },
  dome: { ambience: 'amb_dome', music: 'music_lofi_night' },
};

/** Every sound the generator writes: audio key -> function that renders it. */
export const ALL_AUDIO: Record<string, () => Buf> = { ...AMBIENCE, ...MUSIC };

/** The rain loop key, mixed over every place when it rains. */
export const RAIN_KEY = AUDIO_KEYS.rain;
