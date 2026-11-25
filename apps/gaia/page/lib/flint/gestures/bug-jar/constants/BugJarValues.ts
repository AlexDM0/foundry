import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/**
 * Bug jar: a review finds a bug, Flint catches it in a jar, and the jar becomes a low ticket. In milliseconds
 * from the start of the cycle, and in sprite units for Flint facing right. The sheet and the looking glass are those of Review.
 */
export const BUG_JAR_TIMELINE = {
  CYCLE_MILLISECONDS:            5200,
  /** Reading stops here, on line 1, at the share of the line in `BUG_JAR_READING.LENS_STOPS_ALONG`; the bug shows. */
  FOUND_MILLISECONDS:            1400,
  LENS_LEAVES_MILLISECONDS:      1800,
  CAUGHT_MILLISECONDS:           2300,
  ABOVE_JAR_MILLISECONDS:        3000,
  LID_CLOSES_MILLISECONDS:       3300,
  HAPPY_EYES_FROM_MILLISECONDS:  3400,
  JAR_SHRINKS_MILLISECONDS:      3700,
  TICKET_LEAVES_MILLISECONDS:    4200,
  /** As the fade in of the other props of a cycle (Merge, Gate run). */
  JAR_FADE_IN_MILLISECONDS:      300,
  /** The "!" shows from the find until the hand has the bug. */
  EXCLAMATION_ENDS_MILLISECONDS: 2300,
  /** Reduced motion holds the caught bug on its way to the open jar. */
  STILL_MOMENT_MILLISECONDS:     2600,
} as const;

/** Review, at its own pace of a line; it reads line 0, then line 1 until the lens stops. */
export const BUG_JAR_READING = {
  LINE_MILLISECONDS:      700,
  STOP_LINE_INDEX:        1,
  LENS_STOPS_ALONG:       0.6,
  LENS_EXIT_X_UNITS:      50,
  LENS_EXIT_Y_UNITS:      -48,
  HAND_RADIUS_UNITS:      5,
  FOUND_EYE_HEIGHT_UNITS: 10,
} as const;

export const BUG_JAR_BUG = {
  /** The bug shows this far below the centre of the lens, clear of its ring. */
  BELOW_LENS_UNITS:     8.5,
  CIRCLE_RADIUS_UNITS:  1.5,
  /** Once caught, the bug wiggles this many times as fast. */
  CAUGHT_WIGGLE_FACTOR: 2,
  ABOVE_JAR_X_UNITS:    44,
  ABOVE_JAR_Y_UNITS:    -22,
  /** At the bottom of the jar, clear of its outline. */
  IN_JAR_Y_UNITS:       -9,
  /** The pentagon pinches the bug from its side, this far from the bug's centre. */
  GRIP_OFFSET_X_UNITS:  -6,
  GRIP_OFFSET_Y_UNITS:  0,
} as const;

/** The jar at (39, -18), its rim on its top edge and its lid above the rim while it is open. */
export const BUG_JAR_SHAPE = {
  JAR_X_UNITS:             39,
  JAR_Y_UNITS:             -18,
  JAR_WIDTH_UNITS:         10,
  JAR_HEIGHT_UNITS:        12,
  JAR_CORNER_RADIUS_UNITS: 2,
  JAR_FILL_OPACITY:        0.35,
  JAR_STROKE_UNITS:        1.2,
  RIM_WIDTH_UNITS:         11,
  RIM_HEIGHT_UNITS:        2,
  LID_WIDTH_UNITS:         11,
  LID_HEIGHT_UNITS:        2.2,
  /** The open lid floats this far above the rim; closed, it sits on the rim. */
  LID_OPEN_LIFT_UNITS:     6,
  /** The jar and the bug in it shrink to nothing around the centre of the jar. */
  SHRINK_CENTRE_X_UNITS:   44,
  SHRINK_CENTRE_Y_UNITS:   -12,
} as const;

/** The low ticket the jar becomes: a mini sheet with a crimson dot, which leaves by (12, -4). */
export const BUG_JAR_TICKET = {
  CENTRE_X_UNITS:     44,
  CENTRE_Y_UNITS:     -12,
  LEAVE_X_UNITS:      12,
  LEAVE_Y_UNITS:      -4,
  /** The dot is drawn on the paper before the mini sheet's scale, at the paper's centre. */
  DOT_CENTRE_X_UNITS: 38,
  DOT_CENTRE_Y_UNITS: -28,
  DOT_RADIUS_UNITS:   3,
} as const;

/** Where the eyes look while they follow the bug: the lift of Regrouping, `clamp((y + 24) / divisor, lowest, highest)`. */
export const BUG_JAR_EYES = {
  FOLLOW_HEIGHT_UNITS: 6,
  LIFT_CENTRE_Y_UNITS: -24,
  LIFT_DIVISOR_UNITS:  8,
  LIFT_LOWEST_UNITS:   -3,
  LIFT_HIGHEST_UNITS:  2,
} as const;

/** All that the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const BUG_JAR_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      61.5,
  aboveFloorUnits: 71.5,
  belowFloorUnits: -3,
};
