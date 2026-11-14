/**
 * What the emotes of `02-animations.md`, "Emotes", share: the exit of a mark, the entrances of the sweat drop, the thinking dots and the
 * sweat beads, which a gesture that shows them shares too, and the one hop of Surprised and Idea.
 */

/** In its last moment, an emote's mark fades out and shrinks to this share of its scale. */
export const MARK_EXIT = {
  FADE_MILLISECONDS:     160,
  SMALLEST_SCALE_FACTOR: 0.6,
} as const;

/** The one hop of the Surprised and Idea emotes: `HEIGHT_UNITS × sin(π × age / MILLISECONDS)` while age is below `MILLISECONDS`. */
export const EMOTE_HOP = {
  HEIGHT_UNITS: 6,
  MILLISECONDS: 300,
} as const;

/** The sweat drop grows from `START_SCALE_FACTOR` to its full size with no spring, and slides `FALL_UNITS` down. */
export const SWEAT_DROP_ENTRANCE = {
  FALL_UNITS:          9,
  FALL_MILLISECONDS:   1300,
  START_SCALE_FACTOR:  0.6,
  GROWTH_MILLISECONDS: 100,
} as const;

/** The thinking dots show one after the other: the first at `FIRST_DOT_MILLISECONDS`, then one each interval. */
export const THINKING_DOTS_ENTRANCE = {
  FIRST_DOT_MILLISECONDS:      150,
  DOT_INTERVAL_MILLISECONDS:   500,
  /** A gesture's step too short for the whole entrance runs it faster, so the last dot shows whole this long before the mark leaves. */
  LAST_DOT_WHOLE_MILLISECONDS: 200,
} as const;

/** Bead k starts `START_INTERVAL_MILLISECONDS × k` after the mark shows; `f` goes from 0 to 1 in each cycle of a bead. */
export const SWEAT_BEADS_FLIGHT = {
  SIDES:                       [-1, 1, -0.4],
  START_INTERVAL_MILLISECONDS: 230,
  CYCLE_MILLISECONDS:          690,
  START_X_UNITS:               6,
  SPREAD_X_UNITS:              11,
  START_Y_UNITS:               -2,
  RISE_UNITS:                  11,
  FALL_UNITS:                  9,
  TURN_DEGREES:                40,
  /** Under reduced motion the beads hold still at this point of their flight. */
  STILL_FLIGHT:                0.3,
} as const;
