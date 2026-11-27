/**
 * The rows of the state palette, each named for how it looks: an element with `data-state-tone` set to one reads `--s-fill`, `--s-tint`,
 * `--s-ink`, `--s-edge` and, on the grey and faded rows, `--s-head` from `styles/tokens.css`. `accent` is orange, `info` teal (`info-deep` on a
 * deeper tint), `error` the failure crimson, `ink` the text colour on the wash and `muted` faded ink; an `-outline` tone keeps the plain surface.
 */
export type StateTone =
  | 'neutral'
  | 'accent'
  | 'accent-outline'
  | 'info'
  | 'info-outline'
  | 'info-deep'
  | 'success'
  | 'error'
  | 'ink'
  | 'muted';

/** How a state dot is drawn: filled, a ring, a dashed ring, or a diamond, a square outline turned 45 degrees. */
export type StateDotShape = 'solid' | 'ring' | 'dashed-ring' | 'diamond';
