import { Emitter, loadJson, saveJson } from './emitter';

const KEY = 'study-space/settings';

/** Player preferences for sound and the sky. Saved on this device. */
export interface Settings {
  /** Master volume, 0 to 1. */
  master: number;
  /** Background music volume, 0 to 1. */
  music: number;
  /** Ambience (birds, water, room tone) volume, 0 to 1. */
  ambience: number;
  /** Volume of the chimes when a focus session or a break ends, 0 to 1. */
  alerts: number;
  /** Silences everything without losing the volume settings. */
  muted: boolean;
  /** Rain on or off: both the falling rain and its sound. Off keeps skies dry. */
  rain: boolean;
  /** Day and night tinting and lamp glow. Off keeps every place in daylight. */
  dayNight: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.5,
  ambience: 0.7,
  alerts: 0.8,
  muted: false,
  rain: true,
  dayNight: true,
};

function clamp01(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

/** Reads and validates saved preferences, falling back to defaults per field. */
function load(): Settings {
  const saved = loadJson<Partial<Settings>>(KEY) ?? {};
  return {
    master: clamp01(saved.master, DEFAULT_SETTINGS.master),
    music: clamp01(saved.music, DEFAULT_SETTINGS.music),
    ambience: clamp01(saved.ambience, DEFAULT_SETTINGS.ambience),
    alerts: clamp01(saved.alerts, DEFAULT_SETTINGS.alerts),
    muted: typeof saved.muted === 'boolean' ? saved.muted : DEFAULT_SETTINGS.muted,
    rain: typeof saved.rain === 'boolean' ? saved.rain : DEFAULT_SETTINGS.rain,
    dayNight: typeof saved.dayNight === 'boolean' ? saved.dayNight : DEFAULT_SETTINGS.dayNight,
  };
}

/** Observable preferences store: read `get()`, change with `update()`, react to `changed`. */
export class SettingsStore {
  readonly changed = new Emitter<Settings>();
  private current: Settings = load();

  get(): Settings {
    return this.current;
  }

  update(patch: Partial<Settings>): void {
    const next = { ...this.current, ...patch };
    next.master = clamp01(next.master, this.current.master);
    next.music = clamp01(next.music, this.current.music);
    next.ambience = clamp01(next.ambience, this.current.ambience);
    next.alerts = clamp01(next.alerts, this.current.alerts);
    this.current = next;
    saveJson(KEY, next);
    this.changed.emit(next);
  }

  reset(): void {
    this.update({ ...DEFAULT_SETTINGS });
  }
}
