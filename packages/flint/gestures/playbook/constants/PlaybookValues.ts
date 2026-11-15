/** Playbook of `06-more-animations.md`: one Pass of the Overseer, observe, read the Playbook, act; in sprite units, facing right. */
export const PLAYBOOK_TIMELINE = {
  CYCLE_MILLISECONDS:          4000,
  LOOK_AHEAD_MILLISECONDS:     500,
  BOOK_ARRIVES_MILLISECONDS:   1000,
  BOOK_OPENS_MILLISECONDS:     1300,
  READING_STARTS_MILLISECONDS: 1500,
  LINE_MILLISECONDS:           300,
  READING_ENDS_MILLISECONDS:   2700,
  ACTING_STARTS_MILLISECONDS:  2900,
  HAND_LEAVES_MILLISECONDS:    3500,
  STILL_MOMENT_MILLISECONDS:   2000,
} as const;

/** The eyes of each step; the eyes of the closed book before reading are the working eyes, as the design gives none. */
export const PLAYBOOK_EYES = {
  LOOK_BEHIND_SHIFT_UNITS:     -4,
  LOOK_BEHIND_HEIGHT_UNITS:    7,
  LOOK_AHEAD_SHIFT_UNITS:      7,
  WORKING_SHIFT_UNITS:         6,
  READING_HEIGHT_UNITS:        6,
  READING_FIRST_LIFT_UNITS:    -2,
  READING_LIFT_PER_LINE_UNITS: 1.2,
  ACTING_HEIGHT_UNITS:         8,
} as const;

/** Flint hops as the book closes, by `HOP_UNITS × sin(π × p)`. */
export const PLAYBOOK_BODY = { HOP_UNITS: 2 } as const;

/** The reading hand is a triangle pointing back at the line from the page's far edge; the acting hand is the shared hand of Point. */
export const PLAYBOOK_HANDS = {
  READING_CORNER_COUNT:   3,
  READING_RADIUS_UNITS:   5,
  READING_CENTRE_X_UNITS: 44,
  READING_TURN_DEGREES:   270,
} as const;

/**
 * The small book: a cover with a spine line and a diamond at its centre, over a page with four printed lines. The book is drawn as Flint
 * faces right and mirrored back facing left, so its spine is always on the left on the screen.
 */
export const PLAYBOOK_BOOK_SHAPE = {
  X_UNITS:             30,
  Y_UNITS:             -40,
  WIDTH_UNITS:         14,
  HEIGHT_UNITS:        18,
  CORNER_RADIUS_UNITS: 1,
  PAGE_STROKE_UNITS:   1.2,
  SPINE_STROKE_UNITS:  1.2,
  EMBLEM_SIDE_UNITS:   4,
  EMBLEM_TURN_DEGREES: 45,
  LINE_START_X_UNITS:  33,
  LINE_END_X_UNITS:    41,
  LINE_Y_UNITS:        [-35, -31, -27, -23],
  LINE_STROKE_UNITS:   1.5,
} as const;
