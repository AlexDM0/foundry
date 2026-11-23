/** Chain: one loop in which a ticket is chained to the ticket it waits for; in milliseconds. */
export const CHAIN_TIMELINE = {
  CYCLE_MILLISECONDS:         3800,
  FADE_IN_MILLISECONDS:       300,
  FIRST_LINK_MILLISECONDS:    300,
  LINK_INTERVAL_MILLISECONDS: 330,
  HAND_LEAVES_MILLISECONDS:   1300,
  PULLS_START_MILLISECONDS:   1600,
  /** Sheet B pulls at the chain at each of these moments, for one pull's time. */
  PULL_MOMENTS_MILLISECONDS:  [1700, 2200],
  PULL_MILLISECONDS:          300,
  LOOK_AT_A_MILLISECONDS:     2800,
  LEAVES_MILLISECONDS:        3300,
  /** Reduced motion holds the chain made, sheet B at rest after its first pull. */
  STILL_MOMENT_MILLISECONDS:  2000,
} as const;

/** The two mini sheets: A, the ticket that waits, with a header in the body colour; B, the one it waits for, with a grey header. */
export const CHAIN_SHEETS = {
  A_CENTRE_X_UNITS: 32,
  A_CENTRE_Y_UNITS: -40,
  B_CENTRE_X_UNITS: 46,
  B_CENTRE_Y_UNITS: -18,
  B_PULL_X_UNITS:   4,
  B_PULL_Y_UNITS:   3,
} as const;

/** The links, evenly from the first place to the last; each turns by its own turn, in turn. */
export const CHAIN_LINKS = {
  FIRST_X_UNITS:       36,
  FIRST_Y_UNITS:       -34,
  LAST_X_UNITS:        43,
  LAST_Y_UNITS:        -24,
  COUNT:               3,
  WIDTH_UNITS:         5,
  HEIGHT_UNITS:        3,
  CORNER_RADIUS_UNITS: 1.5,
  STROKE_UNITS:        1.3,
  TURNS_DEGREES:       [35, 125],
} as const;

/** The hexagon that adds each link sits off the link and turns once more for each link; its eyes are those of Fasten. */
export const CHAIN_HAND = {
  CORNER_COUNT:             6,
  RADIUS_UNITS:             5.5,
  OFFSET_X_UNITS:           -5,
  OFFSET_Y_UNITS:           4,
  TURN_PER_LINK_DEGREES:    60,
  WORKING_EYE_HEIGHT_UNITS: 5,
} as const;

export const CHAIN_EYES = {
  PULL_SHIFT_UNITS:     7,
  PULL_LIFT_UNITS:      2,
  LOOK_AT_A_LIFT_UNITS: -2,
} as const;
