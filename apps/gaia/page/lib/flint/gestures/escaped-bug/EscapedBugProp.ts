/**
 * The shelf of Escaped bug: a landed block on a shelf, the bug of the shared vocabulary that escapes from it, and
 * the trace back to the block: a dashed crimson line and a warning triangle on the block's corner. A hand held to this prop sits above the
 * bug, at the distance the state gives.
 */
import type { Point }                          from '../../SpriteGeometry.ts';
import type { Shape }                          from '../../drawing/Shape.ts';
import { propDefinition }                      from '../../props/PropDefinition.ts';
import { blockShapeOf }                        from '../../props/shapes/BlockShape.ts';
import { BugShapeUtil }                        from '../../props/shapes/BugShapeUtil.ts';
import { ESCAPED_BUG_ROCK, ESCAPED_BUG_SHAPE } from './constants/EscapedBugValues.ts';

export interface EscapedBugState {
  readonly shown:            number;
  /** The shelf and the block, as they fade in and out with the cycle. */
  readonly sceneOpacity:     number;
  readonly blockTurnDegrees: number;
  readonly bugX:             number;
  readonly bugY:             number;
  readonly bugTurnDegrees:   number;
  readonly bugOpacity:       number;
  readonly traceOpacity:     number;
  /** How far below the centre of a held hand the bug hangs. */
  readonly bugBelowHand:     number;
}

function warningTriangleOf(opacity: number): Shape {
  const halfSide = ESCAPED_BUG_SHAPE.WARNING_SIDE_UNITS / 2;
  const centreX = ESCAPED_BUG_SHAPE.WARNING_CENTRE_X_UNITS;
  const centreY = ESCAPED_BUG_SHAPE.WARNING_CENTRE_Y_UNITS;
  return {
    kind:   'polygon',
    key:    'warning',
    points: [
      { x: centreX, y: centreY - ESCAPED_BUG_SHAPE.WARNING_TOP_RISE_UNITS },
      { x: centreX + halfSide, y: centreY + ESCAPED_BUG_SHAPE.WARNING_BASE_DROP_UNITS },
      { x: centreX - halfSide, y: centreY + ESCAPED_BUG_SHAPE.WARNING_BASE_DROP_UNITS },
    ],
    fill: 'alarm',
    opacity,
  };
}

export const ESCAPED_BUG_PROP = propDefinition({
  name:   'escapedBug',
  hidden: Object.freeze<EscapedBugState>({
    shown:            0,
    sceneOpacity:     0,
    blockTurnDegrees: 0,
    bugX:             ESCAPED_BUG_SHAPE.LIFTED_BUG_X_UNITS,
    bugY:             ESCAPED_BUG_SHAPE.LIFTED_BUG_Y_UNITS,
    bugTurnDegrees:   0,
    bugOpacity:       0,
    traceOpacity:     0,
    bugBelowHand:     0,
  }),
  layer:    'in-front-of-body',
  gripOf:   (state: EscapedBugState): Point => ({ x: state.bugX, y: state.bugY - state.bugBelowHand }),
  shapesOf: (state: EscapedBugState) => ({
    opacity: state.shown,
    shapes:  [
      {
        kind:        'line',
        key:         'shelf',
        x1:          ESCAPED_BUG_SHAPE.SHELF_START_X_UNITS,
        y1:          ESCAPED_BUG_SHAPE.SHELF_Y_UNITS,
        x2:          ESCAPED_BUG_SHAPE.SHELF_END_X_UNITS,
        y2:          ESCAPED_BUG_SHAPE.SHELF_Y_UNITS,
        stroke:      'graphite',
        strokeWidth: ESCAPED_BUG_SHAPE.SHELF_STROKE_UNITS,
        lineCap:     'round',
        opacity:     state.sceneOpacity,
      },
      {
        ...blockShapeOf({
          key: 'block', state: 'landed', x: ESCAPED_BUG_SHAPE.BLOCK_X_UNITS, y: ESCAPED_BUG_SHAPE.BLOCK_Y_UNITS, opacity: state.sceneOpacity,
        }),
        transform: [{ rotateDegrees: state.blockTurnDegrees, aboutX: ESCAPED_BUG_ROCK.PIVOT_X_UNITS, aboutY: ESCAPED_BUG_ROCK.PIVOT_Y_UNITS }],
      },
      warningTriangleOf(state.traceOpacity),
      {
        kind:        'line',
        key:         'trace',
        x1:          state.bugX,
        y1:          state.bugY,
        x2:          ESCAPED_BUG_SHAPE.BLOCK_TOP_MIDDLE_X_UNITS,
        y2:          ESCAPED_BUG_SHAPE.BLOCK_Y_UNITS,
        stroke:      'alarm',
        strokeWidth: ESCAPED_BUG_SHAPE.TRACE_STROKE_UNITS,
        dash:        [ESCAPED_BUG_SHAPE.TRACE_DASH_UNITS, ESCAPED_BUG_SHAPE.TRACE_GAP_UNITS],
        opacity:     state.traceOpacity,
      },
      ...BugShapeUtil.bugOf({
        key: 'bug', centreX: state.bugX, centreY: state.bugY, turnDegrees: state.bugTurnDegrees, opacity: state.bugOpacity,
      }),
    ],
  }),
});
