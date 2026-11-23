/**
 * The wall of Hatch with its slot, and the papers that pass it: the note Flint pushes in, the reply that comes
 * out with its line and its small tick, and the stub of a queued note. A paper that is partly in the slot shows only up to the wall, so it
 * gets narrower from its far end as it goes in.
 */
import type { Shape }                             from '../../drawing/Shape.ts';
import { propDefinition }                         from '../../props/PropDefinition.ts';
import { VerdictShapeUtil }                       from '../../props/shapes/VerdictShapeUtil.ts';
import { PAPER_SHAPE, TICK_SHAPE, VERDICT_SHAPE } from '../../props/shapes/constants/SharedShapes.ts';
import { AnimationCurveUtil }                     from '../../utils/AnimationCurveUtil.ts';
import { HATCH_SHAPE }                            from './constants/HatchValues.ts';

/** A paper by the x of its edge nearest Flint and the y of its middle. */
export interface HatchPaperState {
  readonly nearX:   number;
  readonly centreY: number;
  readonly opacity: number;
}

export interface HatchWallState {
  readonly shown:            number;
  /** Multiplies the opacity: the fade in and out of the props within one cycle. */
  readonly cycleOpacity:     number;
  readonly note:             HatchPaperState;
  readonly reply:            HatchPaperState;
  readonly replyTickOpacity: number;
  readonly stub:             HatchPaperState;
}

/** How much of a paper of this width is out of the wall. */
function shownWidthOf(paper: HatchPaperState, width: number): number {
  return AnimationCurveUtil.clamp(HATCH_SHAPE.WALL_X_UNITS - paper.nearX, 0, width);
}

function paperOf(key: string, paper: HatchPaperState, width: number, height: number): Shape {
  const shownWidth = shownWidthOf(paper, width);
  return {
    kind:        'rectangle',
    key,
    x:           paper.nearX,
    y:           paper.centreY - (height / 2),
    width:       shownWidth,
    height,
    fill:        'paper',
    stroke:      'paperEdge',
    strokeWidth: HATCH_SHAPE.PAPER_STROKE_UNITS,
    opacity:     shownWidth > 0 ? paper.opacity : 0,
  };
}

function replyShapesOf(state: HatchWallState): readonly Shape[] {
  const { reply } = state;
  const lineY = reply.centreY - HATCH_SHAPE.REPLY_LINE_RISE_UNITS;
  const tickCentreX = reply.nearX + HATCH_SHAPE.REPLY_TICK_ALONG_UNITS;
  return [
    paperOf('reply', reply, HATCH_SHAPE.NOTE_WIDTH_UNITS, HATCH_SHAPE.NOTE_HEIGHT_UNITS),
    {
      kind:        'line',
      key:         'reply-line',
      x1:          reply.nearX + HATCH_SHAPE.REPLY_LINE_START_UNITS,
      y1:          lineY,
      x2:          Math.min(reply.nearX + HATCH_SHAPE.REPLY_LINE_END_UNITS, HATCH_SHAPE.WALL_X_UNITS),
      y2:          lineY,
      stroke:      'body',
      strokeWidth: HATCH_SHAPE.REPLY_LINE_STROKE_UNITS,
      lineCap:     'round',
      opacity:     shownWidthOf(reply, HATCH_SHAPE.NOTE_WIDTH_UNITS) > HATCH_SHAPE.REPLY_LINE_START_UNITS ? reply.opacity : 0,
    },
    VerdictShapeUtil.tickOf({
      key:     'reply-tick',
      startX:  tickCentreX - (TICK_SHAPE.WIDTH_UNITS * VERDICT_SHAPE.SMALL_SCALE / 2),
      startY:  reply.centreY + HATCH_SHAPE.REPLY_TICK_DROP_UNITS,
      opacity: state.replyTickOpacity * reply.opacity,
      scale:   VERDICT_SHAPE.SMALL_SCALE,
    }),
  ];
}

const HIDDEN_PAPER: HatchPaperState = Object.freeze({ nearX: HATCH_SHAPE.WALL_X_UNITS, centreY: 0, opacity: 0 });

export const HATCH_WALL_PROP = propDefinition({
  name:   'hatchWall',
  hidden: Object.freeze<HatchWallState>({
    shown: 0, cycleOpacity: 1, note: HIDDEN_PAPER, reply: HIDDEN_PAPER, replyTickOpacity: 0, stub: HIDDEN_PAPER,
  }),
  layer:    'behind-body',
  shapesOf: (state: HatchWallState) => ({
    opacity: state.shown * state.cycleOpacity,
    shapes:  [
      {
        kind:        'rectangle',
        key:         'wall',
        x:           HATCH_SHAPE.WALL_X_UNITS,
        y:           HATCH_SHAPE.WALL_Y_UNITS,
        width:       HATCH_SHAPE.WALL_WIDTH_UNITS,
        height:      HATCH_SHAPE.WALL_HEIGHT_UNITS,
        fill:        'hardware',
        stroke:      'graphite',
        strokeWidth: HATCH_SHAPE.WALL_STROKE_UNITS,
      },
      {
        kind:   'rectangle',
        key:    'slot',
        x:      HATCH_SHAPE.WALL_X_UNITS,
        y:      HATCH_SHAPE.SLOT_Y_UNITS,
        width:  HATCH_SHAPE.WALL_WIDTH_UNITS,
        height: HATCH_SHAPE.SLOT_HEIGHT_UNITS,
        fill:   'graphite',
      },
      paperOf('note', state.note, HATCH_SHAPE.NOTE_WIDTH_UNITS, HATCH_SHAPE.NOTE_HEIGHT_UNITS),
      ...replyShapesOf(state),
      {
        ...paperOf('stub', state.stub, HATCH_SHAPE.STUB_WIDTH_UNITS, HATCH_SHAPE.STUB_HEIGHT_UNITS),
        dash: [PAPER_SHAPE.DRAFT_DASH_UNITS, PAPER_SHAPE.DRAFT_GAP_UNITS],
      },
    ],
  }),
});
