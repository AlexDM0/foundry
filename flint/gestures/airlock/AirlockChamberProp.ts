/**
 * The airlock of Airlock (`06-more-animations.md`): the main line, the chamber, the queue of blocks, the block that passes, and the two
 * doors over them, so a block goes under an open door. The passing block lands as the landed colour rises in it from its bottom edge,
 * so each colour stays clean while it changes.
 */
import type { Shape }      from '../../drawing/Shape.ts';
import { propDefinition }  from '../../props/PropDefinition.ts';
import type { BlockState } from '../../props/shapes/BlockShape.ts';
import { blockShapeOf }    from '../../props/shapes/BlockShape.ts';
import { AIRLOCK_SHAPE }   from './constants/AirlockValues.ts';

export interface AirlockChamberState {
  readonly shown:            number;
  /** Multiplies the opacity: the fade in of the first cycle. */
  readonly introOpacity:     number;
  /** From 0 closed to 1 open, for the left and the right door. */
  readonly doorOpenings:     readonly [number, number];
  /** How far the blocks behind the front block have moved down. */
  readonly queueDrop:        number;
  /** The new block at the back of the queue. */
  readonly newcomerOpacity:  number;
  /** The top left corner of the block that passes. */
  readonly travellerX:       number;
  readonly travellerY:       number;
  /** From 0 a work-in-progress block to 1 a landed block. */
  readonly travellerLanded:  number;
  readonly travellerOpacity: number;
}

/** A block of the queue's size; the landed colour is a lower part of a block, so it can be less high. */
function blockOf(key: string, left: number, top: number, state: BlockState, opacity: number, height: number = AIRLOCK_SHAPE.BLOCK_HEIGHT_UNITS): Shape {
  return blockShapeOf({
    key, state, x: left, y: top, widthUnits: AIRLOCK_SHAPE.BLOCK_WIDTH_UNITS, heightUnits: height, opacity,
  });
}

function doorOf(i: number, opening: number): Shape {
  const doorX = AIRLOCK_SHAPE.DOOR_X_UNITS[i] ?? AIRLOCK_SHAPE.CHAMBER_X_UNITS;
  return {
    kind:        'line',
    key:         `door-${i}`,
    x1:          doorX,
    y1:          AIRLOCK_SHAPE.DOOR_TOP_Y_UNITS,
    x2:          doorX,
    y2:          AIRLOCK_SHAPE.DOOR_CLOSED_BOTTOM_Y_UNITS + ((AIRLOCK_SHAPE.DOOR_OPEN_BOTTOM_Y_UNITS - AIRLOCK_SHAPE.DOOR_CLOSED_BOTTOM_Y_UNITS) * opening),
    stroke:      'graphite',
    strokeWidth: AIRLOCK_SHAPE.DOOR_STROKE_UNITS,
  };
}

/** The blocks that wait behind the front block, moved down by the drop, and the new block at the back. */
function waitingBlocksOf(state: AirlockChamberState): readonly Shape[] {
  const waiting = Array.from({ length: AIRLOCK_SHAPE.QUEUE_LENGTH - 1 }, (_unused, i) => blockOf(
    `queue-${i + 1}`,
    AIRLOCK_SHAPE.QUEUE_X_UNITS,
    AIRLOCK_SHAPE.QUEUE_FRONT_Y_UNITS - (AIRLOCK_SHAPE.QUEUE_STEP_UNITS * (i + 1)) + state.queueDrop,
    'work-in-progress',
    1,
  ));
  const backY = AIRLOCK_SHAPE.QUEUE_FRONT_Y_UNITS - (AIRLOCK_SHAPE.QUEUE_STEP_UNITS * (AIRLOCK_SHAPE.QUEUE_LENGTH - 1));
  return [...waiting, blockOf('newcomer', AIRLOCK_SHAPE.QUEUE_X_UNITS, backY, 'work-in-progress', state.newcomerOpacity)];
}

export const AIRLOCK_CHAMBER_PROP = propDefinition({
  name:   'airlockChamber',
  hidden: Object.freeze<AirlockChamberState>({
    shown:            0,
    introOpacity:     1,
    doorOpenings:     Object.freeze([0, 0] as const),
    queueDrop:        0,
    newcomerOpacity:  0,
    travellerX:       AIRLOCK_SHAPE.QUEUE_X_UNITS,
    travellerY:       AIRLOCK_SHAPE.QUEUE_FRONT_Y_UNITS,
    travellerLanded:  0,
    travellerOpacity: 1,
  }),
  layer:    'behind-body',
  shapesOf: (state: AirlockChamberState) => ({
    opacity: state.shown * state.introOpacity,
    shapes:  [
      {
        kind:        'line',
        key:         'main-line',
        x1:          AIRLOCK_SHAPE.MAIN_LINE_START_X_UNITS,
        y1:          AIRLOCK_SHAPE.MAIN_LINE_Y_UNITS,
        x2:          AIRLOCK_SHAPE.MAIN_LINE_END_X_UNITS,
        y2:          AIRLOCK_SHAPE.MAIN_LINE_Y_UNITS,
        stroke:      'graphite',
        strokeWidth: AIRLOCK_SHAPE.MAIN_LINE_STROKE_UNITS,
      },
      {
        kind:        'rectangle',
        key:         'chamber',
        x:           AIRLOCK_SHAPE.CHAMBER_X_UNITS,
        y:           AIRLOCK_SHAPE.CHAMBER_Y_UNITS,
        width:       AIRLOCK_SHAPE.CHAMBER_SIDE_UNITS,
        height:      AIRLOCK_SHAPE.CHAMBER_SIDE_UNITS,
        fill:        'paper',
        fillOpacity: AIRLOCK_SHAPE.CHAMBER_FILL_OPACITY,
        stroke:      'graphite',
        strokeWidth: AIRLOCK_SHAPE.CHAMBER_STROKE_UNITS,
      },
      ...waitingBlocksOf(state),
      blockOf('traveller', state.travellerX, state.travellerY, 'work-in-progress', state.travellerOpacity),
      blockOf(
        'traveller-landed',
        state.travellerX,
        state.travellerY + (AIRLOCK_SHAPE.BLOCK_HEIGHT_UNITS * (1 - state.travellerLanded)),
        'landed',
        state.travellerOpacity,
        AIRLOCK_SHAPE.BLOCK_HEIGHT_UNITS * state.travellerLanded,
      ),
      ...state.doorOpenings.map((opening, i) => doorOf(i, opening)),
    ],
  }),
});
