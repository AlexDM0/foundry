/**
 * Slots of `06-more-animations.md`: the concurrency limit, as three sockets on a rail. In `slots` a spark falls into each socket; in
 * `slots-full` every socket has its spark and a ticket finds no free one. In milliseconds from the start of the cycle, and in sprite units
 * for Flint facing right.
 */
export const SLOTS_TIMELINE = {
  CYCLE_MILLISECONDS:             5000,
  /** As the fade in of the props of the other cycles (Merge, Gate run). */
  FADE_IN_MILLISECONDS:           300,
  FADES_OUT_MILLISECONDS:         4400,
  STILL_MOMENT_MILLISECONDS:      3400,
  FULL_STILL_MOMENT_MILLISECONDS: 2800,
} as const;

/** Spark n starts to fall at `FIRST_FALL_MILLISECONDS + n × FALL_INTERVAL_MILLISECONDS`, from y -56 into its socket. */
export const SLOTS_SPARKS = {
  FIRST_FALL_MILLISECONDS:    500,
  FALL_INTERVAL_MILLISECONDS: 900,
  FALL_MILLISECONDS:          300,
  FALL_START_Y_UNITS:         -56,
  HAND_LEAVES_MILLISECONDS:   3200,
  /** From the hand's leave until the props fade, spark n has scale `1 + PULSE_FACTOR × sin(t / divisor + n)`. */
  PULSE_FACTOR:               0.08,
  PULSE_DIVISOR_MILLISECONDS: 300,
} as const;

export const SLOTS_SHAPE = {
  RAIL_X_UNITS:             26,
  RAIL_Y_UNITS:             -22,
  RAIL_WIDTH_UNITS:         28,
  RAIL_HEIGHT_UNITS:        6,
  RAIL_CORNER_RADIUS_UNITS: 3,
  STROKE_UNITS:             1.2,
  SOCKET_X_UNITS:           [31, 40, 49],
  SOCKET_Y_UNITS:           -30,
  SOCKET_RADIUS_UNITS:      3.4,
  /** A refusing ring is also filled in crimson at this opacity, so the refusal reads at 0.5 pixels for one unit, a builder decision. */
  REFUSING_FILL_OPACITY:    0.4,
} as const;

/**
 * One triangle points at the socket that fills: from the socket's x plus `OFFSET_X_UNITS`, at `Y_UNITS`. The handoff puts it at (socket x -
 * 6, -40), turned 150, where its vertical edge faces the socket and it reads as pointing back at Flint; it stands straight above the
 * socket, turned 180, so it reads as pointing down at it, a builder decision. It is the far hand, so the falling spark passes in front of it.
 */
export const SLOTS_POINTER = {
  RADIUS_UNITS:   5.5,
  TURN_DEGREES:   180,
  OFFSET_X_UNITS: 0,
  Y_UNITS:        -41,
} as const;

/** The variant `slots-full`: one pentagon holds a mini sheet above each socket in turn, and each refuses it. */
export const SLOTS_FULL = {
  FIRST_SOCKET_MILLISECONDS: 500,
  SOCKET_MILLISECONDS:       700,
  /** In each socket's time the sheet moves there first, then the ring is crimson for the rest. */
  REFUSAL_MILLISECONDS:      300,
  BACK_MILLISECONDS:         2600,
  HAND_RADIUS_UNITS:         5.5,
  ABOVE_SOCKET_Y_UNITS:      -42,
  /**
   * The handoff's rest place (28, -34) lays the ticket over socket 0, as if it were filed, and the hand on the body; it is held up above
   * the middle socket instead, clear of the rail and the body, a builder decision. While Flint waits it stands upright, so the sweat drop
   * and the hand stay off the body.
   */
  REST_X_UNITS:              40,
  REST_Y_UNITS:              -50,
  /** The pentagon holds the mini sheet at its left edge, high enough to stay clear of the rings below it. */
  GRIP_OFFSET_X_UNITS:       -8,
  GRIP_OFFSET_Y_UNITS:       2,
  WAIT_EYE_HEIGHT_UNITS:     5,
} as const;

/** The eyes follow what moves with the lift of Regrouping, `clamp((y + 24) / divisor, lowest, highest)`; the shift of Gate run, 4 + n. */
export const SLOTS_EYES = {
  HEIGHT_UNITS:        6,
  SHIFT_BASE_UNITS:    4,
  LIFT_CENTRE_Y_UNITS: -24,
  LIFT_DIVISOR_UNITS:  8,
  LIFT_LOWEST_UNITS:   -3,
  LIFT_HIGHEST_UNITS:  2,
} as const;
