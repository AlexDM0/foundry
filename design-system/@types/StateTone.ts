/**
 * The rows of the state palette, each named for how it looks: an element with `data-state-tone` set to one of them reads `--s-fill`,
 * `--s-tint`, `--s-ink`, `--s-edge` and, on the grey and faded rows, `--s-head` from `styles/tokens.css`. `neutral` is grey; `accent` is
 * orange and `info` teal, each on its own tint; an `-outline` tone keeps the plain surface as its ground; `info-deep` is teal on a deeper
 * tint; `success` is green; `ink` is the text colour on the wash; `muted` is faded ink.
 */
export type StateTone =
  | 'neutral'
  | 'accent'
  | 'accent-outline'
  | 'info'
  | 'info-outline'
  | 'info-deep'
  | 'success'
  | 'ink'
  | 'muted';

/** How a state dot is drawn: filled, a ring, or a dashed ring. */
export type StateDotShape = 'solid' | 'ring' | 'dashed-ring';
