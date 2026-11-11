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
  character: CharacterManifest;
  pets: PetEntry[];
  /** Map the player starts in, and the spawn point inside it. */
  start: { map: string; spawn: string };
}

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
