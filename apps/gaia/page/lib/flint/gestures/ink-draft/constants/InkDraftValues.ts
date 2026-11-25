import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** Ink the draft: one loop in which the pen goes around a draft and it becomes a ready ticket; in milliseconds. */
export const INK_DRAFT_TIMELINE = {
  CYCLE_MILLISECONDS:        4200,
  FADE_IN_MILLISECONDS:      300,
  TRACE_STARTS_MILLISECONDS: 300,
  INKED_MILLISECONDS:        2300,
  POP_ENDS_MILLISECONDS:     2400,
  HEADER_SHOWN_MILLISECONDS: 2600,
  HAPPY_STARTS_MILLISECONDS: 2400,
  HAND_LEAVES_MILLISECONDS:  2400,
  LEAVES_MILLISECONDS:       3300,
  /** Reduced motion holds the ready ticket with its header, the happy eyes and no hand. */
  STILL_MOMENT_MILLISECONDS: 2700,
} as const;

/** The pen goes around the paper's outline, from its top left corner, one side in each of these times. */
export const INK_DRAFT_TRACE = {
  SIDE_MILLISECONDS: [500, 600, 500, 400],
  STROKE_UNITS:      1.4,
} as const;

/** While the pen goes around, Flint looks at its tip with the eyes of writing, the lift held between these bounds. */
export const INK_DRAFT_EYES = {
  LOWEST_LIFT_UNITS:  -3,
  HIGHEST_LIFT_UNITS: 3,
} as const;

/** The draft's three lines are at the places of the ticket text; the ready ticket pops and leaves as Make a ticket's does. */
export const INK_DRAFT_SHEET = {
  LINE_START_X_UNITS: 31,
  LINE_Y_UNITS:       [-34, -28, -22],
  FULL_LINE_UNITS:    12,
  POP_SCALE:          1.05,
  LEAVE_X_UNITS:      14,
  LEAVE_Y_UNITS:      -6,
} as const;

/** Two small sparks fly from the paper's top corners, as the sparks of Strike a spark: they travel, turn and fade. */
export const INK_DRAFT_SPARKS = {
  FLIGHT_MILLISECONDS: 400,
  TRAVEL_UNITS:        16,
  /** 0 is forward, negative is up: away from the paper, from its top left corner and from its top right corner. */
  ANGLES_DEGREES:      [-120, -60],
} as const;

/** All that the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const INK_DRAFT_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      62,
  aboveFloorUnits: 68.5,
  belowFloorUnits: -3,
};
