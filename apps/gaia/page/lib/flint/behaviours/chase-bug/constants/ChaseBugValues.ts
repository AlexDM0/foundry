/**
 * Chase the bug: a bug leaves a delivered ticket and runs along the floor, Flint chases it, catches it, and it
 * becomes a ticket. In sprite units and milliseconds; a place on the page is in overlay units, of the same size.
 */
export const CHASE_BUG_BUG = {
  /** The bug of the shared vocabulary at 150%. */
  SCALE:                            1.5,
  /** With no element, the bug starts this far ahead of Flint, on the floor. */
  START_AHEAD_UNITS:                60,
  /** Each run ends this far from Flint, plus a fraction of the spread that the seeded sequence gives. */
  RUN_SHORTEST_UNITS:               60,
  RUN_SPREAD_UNITS:                 80,
  FIRST_RUN_SPEED_UNITS_PER_SECOND: 260,
  /** Each next run is this fraction of the speed of the run before it, so Flint, at its walk speed, is the faster one from the third run. */
  NEXT_RUN_SPEED_FACTOR:            0.85,
  /** A resting bug runs again when Flint comes this close, sideways, or after its rest. */
  RUNS_AGAIN_WITHIN_UNITS:          40,
  REST_MILLISECONDS:                900,
  /** From the start of the chase, after which the bug runs no more. */
  RUNS_FOR_MILLISECONDS:            12000,
  /** Once caught, it wiggles this many times as fast. */
  CAUGHT_WIGGLE_FACTOR:             2,
  /** Under reduced motion the bug does not run: it rests this far ahead of Flint. */
  STILL_AHEAD_UNITS:                30,
} as const;

/** Flint while it chases. A builder decision: it stops walking when the bug is this close, sideways, as cursor play stops near the pointer. */
export const CHASE_BUG_FLINT = {
  EYE_HEIGHT_UNITS:        4,
  EYE_SLANT_DEGREES:       12,
  CAUGHT_EYE_HEIGHT_UNITS: 6,
  /** Flint jumps when the bug changes side within this distance, so the bug runs under the jump. */
  JUMPS_WITHIN_UNITS:      30,
  STOPS_WITHIN_UNITS:      12,
} as const;

/** The steps after the catch, each from the start of its step. */
export const CHASE_BUG_TIMELINE = {
  CAUGHT_MILLISECONDS:          600,
  LINK_MILLISECONDS:            600,
  BUG_SHRINK_MILLISECONDS:      300,
  TICKET_MILLISECONDS:          700,
  /** Builder decisions inside the 700 ms of the ticket: how long it fades in, and how long it fades out at the end. */
  TICKET_FADE_IN_MILLISECONDS:  200,
  TICKET_FADE_OUT_MILLISECONDS: 300,
  TICKET_RISE_UNITS:            12,
  /** A chase that ends before the ticket: the bug fades out in this time. */
  FADE_OUT_MILLISECONDS:        200,
} as const;

/** The dashed crimson line from the caught bug to the element it came from, as the trace of Escaped bug. */
export const CHASE_BUG_LINK = {
  STROKE_UNITS: 1,
  DASH_UNITS:   2,
  GAP_UNITS:    2,
} as const;

/** The dot of the ticket the bug becomes, in the paper's own units before the mini sheet's scale, as the low ticket of Bug jar. */
export const CHASE_BUG_TICKET = {
  DOT_CENTRE_X_UNITS: 38,
  DOT_CENTRE_Y_UNITS: -28,
  DOT_RADIUS_UNITS:   3,
} as const;
