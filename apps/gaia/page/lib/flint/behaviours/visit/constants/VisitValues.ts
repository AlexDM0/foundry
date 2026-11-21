/**
 * `02-animations.md`, "Pop-in around a corner": an offset is the x of the body centre from the component's edge, positive outside it. The
 * values that are not in the handoff are each named for what they bound.
 */
export const POP_IN = {
  BESIDE_OFFSET_UNITS:                28,
  BEHIND_OFFSET_UNITS:                -30,
  PEEK_OFFSET_UNITS:                  3.5,
  DUCK_OFFSET_UNITS:                  -20,
  BEHIND_WALK_SPEED_UNITS_PER_SECOND: 110,
  MOVE_IN_SPEED_UNITS_PER_SECOND:     50,
  WAIT_MILLISECONDS:                  600,
  PEEK_MILLISECONDS:                  1100,
  DUCK_MILLISECONDS:                  600,
  PEEK_AGAIN_MILLISECONDS:            900,
  WAVE_MILLISECONDS:                  2200,
  PEEK_EYE_HEIGHT_UNITS:              6,
  EYE_SHIFT_UNITS:                    2,
  LEAN_DEGREES:                       5,
  /** Flint is on the floor line of the component when its floor is this close; otherwise it starts hidden behind the edge. */
  SAME_FLOOR_TOLERANCE_UNITS:         2,
} as const;
