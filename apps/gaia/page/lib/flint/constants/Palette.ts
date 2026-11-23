/**
 * Every colour of Flint as a CSS custom property with its default. A host changes a colour by setting
 * the property on any ancestor of the overlay, or through the `theme` option of `createFlint`.
 */
export const FLINT_COLOURS = {
  body:              { property: '--flint-body', fallback: '#fa5f01' },
  eye:               { property: '--flint-eye', fallback: '#181818' },
  hand:              { property: '--flint-hand', fallback: '#e24f00' },
  glow:              { property: '--flint-glow', fallback: '#ffc9a3' },
  emberLight:        { property: '--flint-ember-light', fallback: '#ffb27a' },
  emberDark:         { property: '--flint-ember-dark', fallback: '#c43300' },
  alarm:             { property: '--flint-alarm', fallback: '#b7014d' },
  water:             { property: '--flint-water', fallback: '#8cc7d0' },
  waterLight:        { property: '--flint-water-light', fallback: '#e4f2f5' },
  done:              { property: '--flint-done', fallback: '#3d9c5e' },
  paper:             { property: '--flint-paper', fallback: '#fefefe' },
  paperEdge:         { property: '--flint-paper-edge', fallback: '#8a8a8a' },
  paperText:         { property: '--flint-paper-text', fallback: '#b5b5b5' },
  paperStacked:      { property: '--flint-paper-stacked', fallback: '#f3f3f3' },
  paperFold:         { property: '--flint-paper-fold', fallback: '#d9d9d9' },
  graphite:          { property: '--flint-graphite', fallback: '#454545' },
  lens:              { property: '--flint-lens', fallback: '#eef6f8' },
  keyboard:          { property: '--flint-keyboard', fallback: '#e6e6e6' },
  /** The light grey of every other device: a crate, a wall, a rail, a socket. */
  hardware:          { property: '--flint-hardware', fallback: '#e6e6e6' },
  bolt:              { property: '--flint-bolt', fallback: '#a8a8a8' },
  thinking:          { property: '--flint-thinking', fallback: '#8a8a8a' },
  bulbGlassLight:    { property: '--flint-bulb-glass-light', fallback: '#ffedb8' },
  bulbGlassMiddle:   { property: '--flint-bulb-glass-middle', fallback: '#ffe191' },
  bulbGlassDeep:     { property: '--flint-bulb-glass-deep', fallback: '#ffd475' },
  bulbOutline:       { property: '--flint-bulb-outline', fallback: '#f5b650' },
  bulbRays:          { property: '--flint-bulb-rays', fallback: '#ffd475' },
  bulbFittingDark:   { property: '--flint-bulb-fitting-dark', fallback: '#6e6e6e' },
  bulbFittingShine:  { property: '--flint-bulb-fitting-shine', fallback: '#dcdcdc' },
  bulbFittingMiddle: { property: '--flint-bulb-fitting-middle', fallback: '#9a9a9a' },
  bulbFittingShadow: { property: '--flint-bulb-fitting-shadow', fallback: '#5c5c5c' },
  bulbContact:       { property: '--flint-bulb-contact', fallback: '#5c5c5c' },
  husk:              { property: '--flint-husk', fallback: '#f3c9a8' },
  ribbon:            { property: '--flint-ribbon', fallback: '#8cc7d0' },
} as const satisfies Readonly<Record<string, { readonly property: `--flint-${string}`; readonly fallback: `#${string}` }>>;

export type FlintColourRole = keyof typeof FLINT_COLOURS;

/** A host's colours, by role; any CSS colour value works, a `var()` of the host's own tokens included. */
export type FlintTheme = Readonly<Record<FlintColourRole, string>>;
