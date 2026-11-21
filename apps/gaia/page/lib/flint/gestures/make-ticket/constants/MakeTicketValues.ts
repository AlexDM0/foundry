/** The make-a-ticket gesture of `02-animations.md`, "Make a ticket": one cycle of writing, stamping and filing, in milliseconds. */
export const MAKE_TICKET_TIMELINE = {
  CYCLE_MILLISECONDS:           3200,
  FADE_IN_MILLISECONDS:         300,
  WRITING_STARTS_MILLISECONDS:  300,
  LINE_MILLISECONDS:            500,
  STAMP_RAISED_MILLISECONDS:    1800,
  STAMP_FALLS_MILLISECONDS:     2000,
  SEALED_MILLISECONDS:          2120,
  JOLT_ENDS_MILLISECONDS:       2250,
  STAMP_LIFT_ENDS_MILLISECONDS: 2400,
  LEAVES_MILLISECONDS:          2500,
  /** Reduced motion holds the sealed ticket, the stamp lifted and the happy eyes. */
  STILL_MOMENT_MILLISECONDS:    2400,
} as const;

/** The shared stamp starts raised here, above the seal, and Flint looks at it with this eye height. */
export const STAMP = {
  RAISED_Y_UNITS:   -52,
  EYE_HEIGHT_UNITS: 9,
} as const;

export const FILED_TICKET = {
  JOLT_UNITS:    1.5,
  LEAVE_X_UNITS: 14,
  LEAVE_Y_UNITS: -6,
} as const;

/** The ticket of `01-character.md`: the paper, its header, its written lines and its seal, in sprite units, for Flint facing right. */
export const TICKET_SHAPE = {
  LINE_START_X_UNITS:  31,
  LINE_Y_UNITS:        [-34, -28, -22],
  FULL_LINE_UNITS:     12,
  SEAL_SIDE_UNITS:     4,
  SEAL_CENTRE_X_UNITS: 43,
  SEAL_CENTRE_Y_UNITS: -15,
  SEAL_TURN_DEGREES:   45,
} as const;
