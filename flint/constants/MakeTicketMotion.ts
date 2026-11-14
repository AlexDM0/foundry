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

export const STAMP = {
  CORNER_COUNT:     4,
  RADIUS_UNITS:     6,
  TURN_DEGREES:     45,
  RAISED_Y_UNITS:   -52,
  LIFT_UNITS:       10,
  EYE_HEIGHT_UNITS: 9,
} as const;

export const FILED_TICKET = {
  JOLT_UNITS:    1.5,
  LEAVE_X_UNITS: 14,
  LEAVE_Y_UNITS: -6,
} as const;
