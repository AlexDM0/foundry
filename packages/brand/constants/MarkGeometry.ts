/**
 * What Forge's mark draws on the 64-unit grid and a host's own mark may draw alike: the rounded hexagon ring and the scale about the tile's
 * centre that holds it.
 */
export const MARK_GEOMETRY = {
  hexagonRingPath: 'M30.75 14.22 A2.5 2.5 0 0 1 33.25 14.22 L46.77 22.03 A2.5 2.5 0 0 1 48.02 24.19 L48.02 39.81 A2.5 2.5 0 0 1 46.77 41.97 '
    + 'L33.25 49.78 A2.5 2.5 0 0 1 30.75 49.78 L17.23 41.97 A2.5 2.5 0 0 1 15.98 39.81 L15.98 24.19 A2.5 2.5 0 0 1 17.23 22.03 Z',
  scaleAboutCentreTransform: 'translate(32 32) scale(1.1) translate(-32 -32)',
} as const;
