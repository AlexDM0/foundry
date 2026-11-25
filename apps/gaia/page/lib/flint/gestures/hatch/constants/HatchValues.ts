import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** Hatch: one loop of a note through a slot in a wall, in milliseconds and sprite units, for Flint facing right. */
export const HATCH_TIMELINE = {
  CYCLE_MILLISECONDS:               4400,
  FADE_IN_MILLISECONDS:             300,
  PUSH_STARTS_MILLISECONDS:         600,
  PUSHED_MILLISECONDS:              1100,
  REPLY_STARTS_MILLISECONDS:        2300,
  REPLY_TAKEN_MILLISECONDS:         2800,
  HAPPY_EYES_MILLISECONDS:          3200,
  QUEUED_SHRUG_MILLISECONDS:        2900,
  /** The stub of a queued note fades in as the props of the loop do. */
  STUB_FADE_IN_MILLISECONDS:        300,
  FADE_OUT_STARTS_MILLISECONDS:     3600,
  /** Reduced motion holds the reply as the hand takes it. */
  STILL_MOMENT_MILLISECONDS:        2600,
  /** Reduced motion holds the shrug with its stub and the sweat drop. */
  QUEUED_STILL_MOMENT_MILLISECONDS: 3200,
} as const;

/** One pentagon holds the note, pushes it into the slot, waits, and takes the reply. */
export const HATCH_HAND = {
  RADIUS_UNITS:    5.5,
  HOLD_X_UNITS:    30,
  HOLD_Y_UNITS:    -29,
  PUSHED_X_UNITS:  39,
  WAIT_X_UNITS:    28,
  WAIT_Y_UNITS:    -26,
  TAKE_X_UNITS:    33,
  TAKE_Y_UNITS:    -29,
  /**
   * The near edge of a note the hand pushes or holds out sits at the tip of the pentagon, so the note held at (30, -29) reaches the slot,
   * and the hand pushed to x 39 touches the wall as the note goes all in.
   */
  TIP_GRIP_UNITS:  5,
  /** The hand closes over the near end of the reply it takes, which lies against the wall. */
  PALM_GRIP_UNITS: 2,
} as const;

export const HATCH_FACE = {
  WAITING_EYE_SHIFT_UNITS:      7,
  READING_EYE_HEIGHT_UNITS:     5,
  READING_EYE_LIFT_UNITS:       2,
  SHRUG_LIFT_UNITS:             2,
  SHRUG_HEIGHT_FACTOR:          1.03,
  SHRUG_RIGHT_EYE_HEIGHT_UNITS: 5,
} as const;

/** The wall with its slot, the note, the reply with its line, and the stub of a queued note, dashed as a draft. */
export const HATCH_SHAPE = {
  WALL_X_UNITS:            44,
  WALL_Y_UNITS:            -52,
  WALL_WIDTH_UNITS:        4,
  WALL_HEIGHT_UNITS:       44,
  WALL_STROKE_UNITS:       1.2,
  SLOT_Y_UNITS:            -32,
  SLOT_HEIGHT_UNITS:       6,
  NOTE_WIDTH_UNITS:        9,
  NOTE_HEIGHT_UNITS:       6,
  /** The outline of a small page, as the pages of Molt. */
  PAPER_STROKE_UNITS:      0.8,
  REPLY_LINE_START_UNITS:  3,
  REPLY_LINE_END_UNITS:    8,
  REPLY_LINE_RISE_UNITS:   1.5,
  REPLY_LINE_STROKE_UNITS: 1.2,
  /** The small tick on the reply, centred this far along the reply and below its middle. */
  REPLY_TICK_ALONG_UNITS:  5.5,
  REPLY_TICK_DROP_UNITS:   1.5,
  STUB_WIDTH_UNITS:        5,
  STUB_HEIGHT_UNITS:       4,
} as const;

/** All that each form of the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const HATCH_EXTENTS = {
  HATCH: {
    backUnits:       20,
    frontUnits:      49,
    aboveFloorUnits: 65.5,
    belowFloorUnits: -3,
  },
  HATCH_QUEUED: {
    backUnits:       20,
    frontUnits:      49,
    aboveFloorUnits: 70,
    belowFloorUnits: -3,
  },
} as const satisfies Readonly<Record<string, DrawnExtent>>;
