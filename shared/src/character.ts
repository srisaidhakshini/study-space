/** A three-tone colour ramp: light, mid, dark (hex strings). */
export type Ramp = [string, string, string];

/** The look of a character: ids that point into the asset manifest. */
export interface Appearance {
  skin: string;
  hair: string;
  hairColor: string;
  eyes: string;
  top: string;
  bottom: string;
  shoes: string;
  accessory: string;
}

export const APPEARANCE_KEYS = [
  'skin',
  'hair',
  'hairColor',
  'eyes',
  'top',
  'bottom',
  'shoes',
  'accessory',
] as const satisfies readonly (keyof Appearance)[];

/** A colour choice applied to a sheet drawn in marker colours. */
export interface PaletteOption {
  id: string;
  name: string;
  /** Replaces the primary marker ramp. Null leaves the sheet untouched. */
  ramp: Ramp | null;
}

/** One selectable variant of a character layer. */
export interface LayerVariant {
  id: string;
  name: string;
  /** Image key of the layer sheet. Null draws nothing (e.g. "no accessory"). */
  sheet: string | null;
  /** Optional sheet drawn behind the body (long hair seen from the front). */
  backSheet?: string;
  /** Marker recolouring. Omit for pre-coloured art. */
  palette?: { primary?: Ramp; secondary?: Ramp };
  /** Take the primary ramp from the chosen hair colour (e.g. cat ears). */
  inherit?: 'hairColor';
}

export interface OutfitPreset {
  id: string;
  name: string;
  top: string;
  bottom: string;
  shoes: string;
}

export interface CharacterManifest {
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  /** Colour of the outline added around the composited character, or null. */
  outline: string | null;
  /** The marker colours that get replaced by ramps at runtime. */
  markers: { primary: Ramp; secondary: Ramp };
  bodySheet: string;
  eyesSheet: string;
  skins: PaletteOption[];
  hairStyles: LayerVariant[];
  hairColors: PaletteOption[];
  eyeColors: PaletteOption[];
  tops: LayerVariant[];
  bottoms: LayerVariant[];
  shoes: LayerVariant[];
  accessories: LayerVariant[];
  outfits: OutfitPreset[];
}

export interface PetEntry {
  id: string;
  name: string;
  /** Spritesheet key, or null for "no pet". */
  sheet: string | null;
}

/** Everything a player chooses about themselves. */
export interface Profile {
  name: string;
  appearance: Appearance;
  pet: string;
}

function first<T extends { id: string }>(list: T[]): string {
  return list[0]?.id ?? '';
}

export function defaultAppearance(m: CharacterManifest): Appearance {
  const outfit = m.outfits[0];
  return {
    skin: first(m.skins),
    hair: first(m.hairStyles),
    hairColor: first(m.hairColors),
    eyes: first(m.eyeColors),
    top: outfit?.top ?? first(m.tops),
    bottom: outfit?.bottom ?? first(m.bottoms),
    shoes: outfit?.shoes ?? first(m.shoes),
    accessory: first(m.accessories),
  };
}

function pick<T extends { id: string }>(list: T[], id: unknown, fallback: string): string {
  return typeof id === 'string' && list.some((v) => v.id === id) ? id : fallback;
}

/** Returns a valid appearance, replacing unknown ids with defaults. */
export function sanitizeAppearance(m: CharacterManifest, input: Partial<Appearance> | null | undefined): Appearance {
  const d = defaultAppearance(m);
  const a = input ?? {};
  return {
    skin: pick(m.skins, a.skin, d.skin),
    hair: pick(m.hairStyles, a.hair, d.hair),
    hairColor: pick(m.hairColors, a.hairColor, d.hairColor),
    eyes: pick(m.eyeColors, a.eyes, d.eyes),
    top: pick(m.tops, a.top, d.top),
    bottom: pick(m.bottoms, a.bottom, d.bottom),
    shoes: pick(m.shoes, a.shoes, d.shoes),
    accessory: pick(m.accessories, a.accessory, d.accessory),
  };
}

export function randomAppearance(m: CharacterManifest, rand: () => number = Math.random): Appearance {
  const any = <T extends { id: string }>(list: T[]): string => list[Math.floor(rand() * list.length)]?.id ?? '';
  const outfit = m.outfits[Math.floor(rand() * m.outfits.length)];
  return {
    skin: any(m.skins),
    hair: any(m.hairStyles),
    hairColor: any(m.hairColors),
    eyes: any(m.eyeColors),
    top: outfit?.top ?? any(m.tops),
    bottom: outfit?.bottom ?? any(m.bottoms),
    shoes: outfit?.shoes ?? any(m.shoes),
    accessory: any(m.accessories),
  };
}

/** Stable string for caching composited textures. */
export function appearanceKey(a: Appearance): string {
  return APPEARANCE_KEYS.map((k) => a[k]).join('|');
}
