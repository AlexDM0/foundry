/**
 * Forced stop: Flint pulls a plug and a spark dies, in one action; in sprite units, for
 * Flint facing right, and milliseconds; `sin(t / n)` names `n` a divisor.
 */
export const FORCED_STOP = {
  DURATION_MILLISECONDS:        1800,
  STILL_MOMENT_MILLISECONDS:    900,
  FADE_IN_ENDS_MILLISECONDS:    300,
  FADE_OUT_STARTS_MILLISECONDS: 1500,
} as const;

/** The socket: a graphite square with two slots, side by side, where the prongs go in. */
export const SOCKET = {
  X_UNITS:             46,
  Y_UNITS:             -16,
  SIDE_UNITS:          8,
  CORNER_RADIUS_UNITS: 1,
  SLOT_X_UNITS:        [48.2, 50.6],
  SLOT_Y_UNITS:        -13.5,
  SLOT_WIDTH_UNITS:    1.2,
  SLOT_HEIGHT_UNITS:   3,
} as const;

/** The plug: a graphite block whose two prongs reach into the socket while it is in; its place is its top left corner. */
export const PLUG = {
  IN_X_UNITS:          40,
  IN_Y_UNITS:          -14,
  OUT_X_UNITS:         28,
  OUT_Y_UNITS:         -14,
  /** The hand holds the plug here, from its top left corner. */
  GRIP_OFFSET_X_UNITS: -2,
  GRIP_OFFSET_Y_UNITS: 2,
} as const;

/**
 * The cable from the middle of the plug's back to below the spark; while the plug is pulled its control point drops and it goes slack. The
 * design's slack control point (30, -4) leaves the cable from the pulled plug almost straight, tighter than before the pull; (42, 2) hangs
 * it in a loop below the line from the plug to the spark, a builder decision.
 */
export const CABLE = {
  START_DROP_UNITS:      2,
  TAUT_CONTROL_X_UNITS:  30,
  TAUT_CONTROL_Y_UNITS:  -24,
  SLACK_CONTROL_X_UNITS: 42,
  SLACK_CONTROL_Y_UNITS: 2,
  END_X_UNITS:           44,
  END_Y_UNITS:           -43,
  STROKE_UNITS:          1.2,
} as const;

/** The spark the plug feeds: it bobs by BOB_UNITS × sin(t / BOB_DIVISOR_MILLISECONDS), and dies grey, small and falling. */
export const FED_SPARK = {
  CENTRE_X_UNITS:           44,
  CENTRE_Y_UNITS:           -46,
  BOB_UNITS:                2,
  BOB_DIVISOR_MILLISECONDS: 300,
  DIES_MILLISECONDS:        750,
  DEAD_MILLISECONDS:        1200,
  FALL_UNITS:               6,
} as const;

/** The pentagon goes to the plug, then pulls it out in a straight line; from the pull its place is set exactly. */
export const PULL = {
  REACH_STARTS_MILLISECONDS: 300,
  STARTS_MILLISECONDS:       600,
  ENDS_MILLISECONDS:         750,
  HAND_RADIUS_UNITS:         6,
  REACH_EYE_LIFT_UNITS:      3,
} as const;

/** Two small sparks fly from the socket's face as the prongs leave it; the angle is 0 forward and negative up. */
export const SOCKET_SPARKS = {
  ORIGIN_X_UNITS:      46,
  ORIGIN_Y_UNITS:      -12,
  FLIGHT_MILLISECONDS: 200,
  TRAVEL_UNITS:        8,
  ANGLES_DEGREES:      [-150, -100],
} as const;

export const DEATH_EYES = {
  HEIGHT_UNITS: 5,
  LIFT_UNITS:   -2,
} as const;

export const LOOK_AT_PLUG = {
  STARTS_MILLISECONDS: 1200,
  EYE_LIFT_UNITS:      2,
} as const;
