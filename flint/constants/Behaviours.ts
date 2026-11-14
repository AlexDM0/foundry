/**
 * The values of Flint's behaviours. `POP_IN` is `02-animations.md`, "Pop-in around a corner": an offset is the x of the body centre from
 * the component's edge, positive outside it. The other values are not in the handoff; each is named for what it bounds.
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

export const WANDER = {
  REST_SHORTEST_MILLISECONDS: 2500,
  REST_SPREAD_MILLISECONDS:   3000,
  /** A walk shorter than this is not worth the steps: Flint rests again. */
  SHORTEST_WALK_UNITS:        12,
} as const;

/** The pseudo-random sequence of the wander: a linear congruential generator, so a spec sees the same walk each run. */
export const WANDER_SEQUENCE = {
  MULTIPLIER:   1664525,
  INCREMENT:    1013904223,
  MODULUS:      4294967296,
  INITIAL_SEED: 20261113,
} as const;

export const COPY = {
  /** Flint walks again only when its agent's row moves further than this, so a small shift of the page does not stop its gesture. */
  STANDING_TOLERANCE_UNITS: 4,
} as const;

export const CURSOR_PLAY = {
  /** Cursor play stops when the pointer does not move for this long. */
  STILL_POINTER_MILLISECONDS:    3000,
  /** Flint stops walking when the pointer is this close, sideways. */
  STANDING_DISTANCE_UNITS:       24,
  /** A grab starts when the pointer is this close to the body centre: the catch distance of the grab. */
  GRAB_DISTANCE_UNITS:           58,
  /** Flint jumps when the pointer is this far above the body centre and within the jump width sideways. */
  JUMP_HEIGHT_UNITS:             44,
  JUMP_WIDTH_UNITS:              40,
  PAUSE_AFTER_GRAB_MILLISECONDS: 300,
} as const;

export const CARRIED = {
  /** The top tip of the body hangs this far below the pointer. */
  HANG_GAP_UNITS: 2,
} as const;

/** After a drop on a habitat, Flint lands and looks around: one eye shift per glance. */
export const LOOK_AROUND = {
  GLANCE_MILLISECONDS:     400,
  GLANCE_EYE_SHIFTS_UNITS: [-2, 6, 2],
} as const;

export const DIRECTOR = {
  /** The director is asked this often, and at once when a cue arrives. */
  ASK_INTERVAL_MILLISECONDS:       3000,
  /** With no cue, click, drag or intent for this long, the rule director sends Flint home to sleep. */
  QUIET_BEFORE_SLEEP_MILLISECONDS: 60000,
  /** How many cues of the habitat Flint lives in a digest carries. */
  RECENT_CUE_LIMIT:                8,
} as const;
