/**
 * Unplugged of `06-more-animations.md`: the event stream is down, then it is back. Flint looks from the plug to the socket, pushes the
 * plug in, and the stream flows down the cable. In milliseconds from the start of the cycle, and in sprite units for Flint facing right.
 */
export const UNPLUGGED_TIMELINE = {
  CYCLE_MILLISECONDS:           4400,
  FADE_IN_MILLISECONDS:         300,
  LOOKS_AT_PLUG_MILLISECONDS:   300,
  LOOKS_AT_SOCKET_MILLISECONDS: 1000,
  HAND_CHANGES_MILLISECONDS:    1500,
  PUSH_STARTS_MILLISECONDS:     1700,
  PLUGGED_IN_MILLISECONDS:      2200,
  HAPPY_EYES_FROM_MILLISECONDS: 2400,
  STREAM_ENDS_MILLISECONDS:     3400,
  /** The two warning lines show for this long, then not for this long, in turn, until the plug is in. */
  WARNING_BLINK_MILLISECONDS:   300,
  /** Each pulse of the stream runs from the plug to the floor in this time. */
  PULSE_MILLISECONDS:           500,
  /** Reduced motion holds the plug in, with the stream on the cable and the happy eyes. */
  STILL_MOMENT_MILLISECONDS:    2600,
} as const;

/** The socket plate on the wall at (48, -34), its slots at the heights of the plug's prongs, and the plug's place before and after. */
export const UNPLUGGED_SHAPE = {
  PLATE_X_UNITS:             48,
  PLATE_Y_UNITS:             -34,
  PLATE_WIDTH_UNITS:         6,
  PLATE_HEIGHT_UNITS:        12,
  PLATE_CORNER_RADIUS_UNITS: 1,
  /** A slot starts this far inside the plate, and is a little higher than a prong. */
  SLOT_INSET_UNITS:          0.5,
  SLOT_WIDTH_UNITS:          2,
  SLOT_HEIGHT_UNITS:         1.2,
  PLUG_OUT_X_UNITS:          34,
  PLUG_IN_X_UNITS:           42,
  PLUG_Y_UNITS:              -30,
} as const;

/**
 * The cable leaves the plug at its left edge, `LEAD_Y_UNITS` below its top, runs straight to the offset of the plug where the handoff's
 * curve starts, then through its fixed control point to the floor: so it stays joined to the plug once the hand lets go.
 */
export const UNPLUGGED_CABLE = {
  LEAD_Y_UNITS:         2,
  START_OFFSET_X_UNITS: -4,
  START_OFFSET_Y_UNITS: 3,
  CONTROL_X_UNITS:      24,
  CONTROL_Y_UNITS:      -10,
  END_X_UNITS:          12,
  END_Y_UNITS:          2,
  STROKE_UNITS:         1.4,
  /** The handoff's pulse is 1.3, lost in the cable at 0.5 pixels for one unit; 2 keeps it readable, a builder decision. */
  PULSE_RADIUS_UNITS:   2,
} as const;

/** Two short crimson lines off the plate's left corners, of the stroke of the knock arcs of Ask. */
export const UNPLUGGED_WARNING = {
  STROKE_UNITS: 1,
  LINES:        [
    {
      FROM_X_UNITS: 46.5, FROM_Y_UNITS: -35, TO_X_UNITS: 44.5, TO_Y_UNITS: -37.5
    },
    {
      FROM_X_UNITS: 46.5, FROM_Y_UNITS: -21, TO_X_UNITS: 44.5, TO_Y_UNITS: -18.5
    },
  ],
} as const;

/** Three small sparks fly back out of the socket's face as the sparks of Strike a spark do: 16 units in 400 ms, turning 180 and fading. */
export const UNPLUGGED_SPARKS = {
  FROM_X_UNITS:        48,
  FROM_Y_UNITS:        -28,
  ANGLES_DEGREES:      [-160, -130, -100],
  TRAVEL_UNITS:        16,
  FLIGHT_MILLISECONDS: 400,
} as const;

/** The pentagon holds the plug at this offset from its top left corner, and pushes it in as a hexagon. */
export const UNPLUGGED_HAND = {
  RADIUS_UNITS:        6,
  GRIP_OFFSET_X_UNITS: -4,
  GRIP_OFFSET_Y_UNITS: 2,
} as const;

export const UNPLUGGED_EYES = {
  HEIGHT_UNITS:            6,
  RIGHT_HEIGHT_UNITS:      5,
  AT_PLUG_LIFT_UNITS:      1,
  AT_SOCKET_SHIFT_UNITS:   8,
  AT_SOCKET_LIFT_UNITS:    -1,
  PLUGGED_IN_HEIGHT_UNITS: 10,
} as const;
