/**
 * Draw order. Characters and furniture sort by their feet (depth = world y),
 * which stays between 0 and the map height; everything else sits outside
 * that range.
 */
export const DEPTH = {
  ground: -1000,
  walls: -900,
  above: 100_000,
  ambient: 100_100,
  glow: 100_200,
  bubble: 100_300,
  marker: 100_400,
} as const;

export const SCENES = {
  boot: 'boot',
  world: 'world',
  overlay: 'overlay',
} as const;
