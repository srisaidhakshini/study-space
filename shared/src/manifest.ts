import type { CharacterManifest, PetEntry } from './character';

export interface SpritesheetEntry {
  path: string;
  frameWidth: number;
  frameHeight: number;
}

export interface MapEntry {
  /** Path of the Tiled JSON file, relative to the assets folder. */
  path: string;
  /** Display name shown in the HUD. */
  name: string;
  /** Tiled tileset name -> spritesheet key. */
  tilesets: Record<string, string>;
  /** Indoor maps get the warm lighting overlay. */
  indoor: boolean;
  /** Multiply tint laid over the whole map (hex), or null for none. */
  ambientTint: string | null;
  /** Key in `audio` of the looping ambience for this place, if any. */
  ambience?: string;
  /** Key in `audio` of the background music for this place, if any. */
  music?: string;
}

/**
 * The single asset manifest (assets.json). Every texture, sheet and map the
 * client loads is listed here, so art can be replaced without code changes.
 */
export interface AssetManifest {
  version: number;
  images: Record<string, string>;
  spritesheets: Record<string, SpritesheetEntry>;
  maps: Record<string, MapEntry>;
  /** Audio loops (WAV), key -> path relative to the assets folder. */
  audio: Record<string, string>;
  character: CharacterManifest;
  pets: PetEntry[];
  /** Map the player starts in, and the spawn point inside it. */
  start: { map: string; spawn: string };
}

/** Audio keys the client uses regardless of the map. */
export const AUDIO_KEYS = {
  /** Rain loop mixed over every place when it is raining (muffled indoors). */
  rain: 'amb_rain',
} as const;

/** Keys of the small effect and UI images the client expects to exist. */
export const FX_KEYS = {
  shadow: 'fx_shadow',
  dust: 'fx_dust',
  bubble: 'fx_bubble',
  subjectIcons: 'fx_subject_icons',
  lamp: 'fx_lamp',
  glow: 'fx_glow',
  marker: 'fx_marker',
  zzz: 'fx_zzz',
} as const;
