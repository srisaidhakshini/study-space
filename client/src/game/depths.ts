/**
 * Draw order. Characters and furniture sort by their feet (depth = world y),
 * which stays between 0 and the map height; everything else sits outside
 * that range.
 */
export const DEPTH = {
  /** Home floor surface (wallpaper and floor pictures replace the base map's look). */
  floorSurface: -999,
  ground: -1000,
  walls: -900,
  wallSurface: -899,
  baseboard: -898.5,
  wallItem: -898,
  /** Rugs lie on the floor below every character. */
  rug: -500,
  above: 100_000,
  ambient: 100_100,
  glow: 100_200,
  bubble: 100_300,
  marker: 100_400,
  /** The home editor's grid, ghost and selection. */
  editor: 100_500,
} as const;

export const SCENES = {
  boot: 'boot',
  world: 'world',
  overlay: 'overlay',
} as const;
