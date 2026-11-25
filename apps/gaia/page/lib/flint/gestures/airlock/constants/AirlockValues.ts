import type { DrawnExtent } from '../../../SpriteGeometry.ts';

/** Airlock: one loop in which one block passes the chamber; in milliseconds and sprite units, for Flint facing right. */
export const AIRLOCK_TIMELINE = {
  CYCLE_MILLISECONDS:             4800,
  FADE_IN_MILLISECONDS:           300,
  LEFT_DOOR_OPENS_MILLISECONDS:   300,
  LEFT_DOOR_OPEN_MILLISECONDS:    700,
  ENTERED_MILLISECONDS:           1200,
  LEFT_DOOR_CLOSED_MILLISECONDS:  1500,
  TURN_ENDS_MILLISECONDS:         2100,
  RIGHT_DOOR_OPEN_MILLISECONDS:   2500,
  ON_MAIN_LINE_MILLISECONDS:      3100,
  HAPPY_EYES_END_MILLISECONDS:    3600,
  RIGHT_DOOR_CLOSES_MILLISECONDS: 3600,
  RIGHT_DOOR_CLOSED_MILLISECONDS: 4000,
  /** Reduced motion holds the hand turning the chamber, both doors closed, the block halfway landed. */
  STILL_MOMENT_MILLISECONDS:      1800,
} as const;

/** One hexagon turns the chamber from above it. */
export const AIRLOCK_HAND = {
  RADIUS_UNITS:   6,
  CENTRE_X_UNITS: 43,
  CENTRE_Y_UNITS: -40,
  TURN_DEGREES:   120,
} as const;

export const AIRLOCK_EYES = {
  /** The eyes follow the block from the back of the queue to the main line. */
  FIRST_SHIFT_UNITS: 4,
  LAST_SHIFT_UNITS:  7,
  /** Merge's height for watching blocks. */
  HEIGHT_UNITS:      6,
} as const;

/** The chamber with its two doors, the queue of three blocks, and the main line. A door opens when its lower end goes up. */
export const AIRLOCK_SHAPE = {
  CHAMBER_X_UNITS:            36,
  CHAMBER_Y_UNITS:            -34,
  CHAMBER_SIDE_UNITS:         14,
  CHAMBER_FILL_OPACITY:       0.5,
  CHAMBER_STROKE_UNITS:       1.4,
  DOOR_X_UNITS:               [36, 50],
  DOOR_TOP_Y_UNITS:           -34,
  DOOR_CLOSED_BOTTOM_Y_UNITS: -20,
  DOOR_OPEN_BOTTOM_Y_UNITS:   -32,
  DOOR_STROKE_UNITS:          2.4,
  BLOCK_WIDTH_UNITS:          7,
  BLOCK_HEIGHT_UNITS:         5,
  /** The top left corner of the front block, the lowest of the queue; each block behind it is one step higher. */
  QUEUE_X_UNITS:              24,
  QUEUE_FRONT_Y_UNITS:        -32,
  QUEUE_STEP_UNITS:           7,
  QUEUE_LENGTH:               3,
  CHAMBER_PLACE_X_UNITS:      39.5,
  CHAMBER_PLACE_Y_UNITS:      -25,
  MAIN_LINE_PLACE_X_UNITS:    52,
  MAIN_LINE_PLACE_Y_UNITS:    -25,
  MAIN_LINE_START_X_UNITS:    50,
  MAIN_LINE_END_X_UNITS:      58,
  MAIN_LINE_Y_UNITS:          -20,
  MAIN_LINE_STROKE_UNITS:     1.6,
} as const;

/** All that the gesture draws, its body included, from its bottom tip for Flint facing right: the room it takes. */
export const AIRLOCK_EXTENT: DrawnExtent = {
  backUnits:       20,
  frontUnits:      59,
  aboveFloorUnits: 59,
  belowFloorUnits: -3,
};
