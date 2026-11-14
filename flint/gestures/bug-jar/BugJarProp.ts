/**
 * The jar of Bug jar (`06-more-animations.md`): the bug of the shared vocabulary, a glass jar with its rim and lid, and the low ticket the
 * jar becomes. The bug is drawn before the glass, so the glass tints it once it is inside. A hand held to this prop pinches the bug.
 */
import type { Point }                                 from '../../SpriteGeometry.ts';
import type { Shape, TransformStep }                  from '../../drawing/Shape.ts';
import { propDefinition }                             from '../../props/PropDefinition.ts';
import { BugShapeUtil }                               from '../../props/shapes/BugShapeUtil.ts';
import { PaperShapeUtil }                             from '../../props/shapes/PaperShapeUtil.ts';
import { BUG_JAR_BUG, BUG_JAR_SHAPE, BUG_JAR_TICKET } from './constants/BugJarValues.ts';

export interface BugJarState {
  readonly shown:          number;
  readonly bugX:           number;
  readonly bugY:           number;
  readonly bugTurnDegrees: number;
  readonly bugOpacity:     number;
  readonly jarOpacity:     number;
  /** From 1, the jar and the bug at their size, to 0, shrunk away around the centre of the jar. */
  readonly jarScale:       number;
  /** How far the lid floats above the rim: open at `BUG_JAR_SHAPE.LID_OPEN_LIFT_UNITS`, closed at 0. */
  readonly lidLift:        number;
  readonly ticketOpacity:  number;
  readonly ticketOffsetX:  number;
  readonly ticketOffsetY:  number;
}

function shrinkStepsOf(scale: number): readonly TransformStep[] {
  return [
    { translateX: BUG_JAR_SHAPE.SHRINK_CENTRE_X_UNITS, translateY: BUG_JAR_SHAPE.SHRINK_CENTRE_Y_UNITS },
    { scaleX: scale, scaleY: scale },
    { translateX: -BUG_JAR_SHAPE.SHRINK_CENTRE_X_UNITS, translateY: -BUG_JAR_SHAPE.SHRINK_CENTRE_Y_UNITS },
  ];
}

function bugShapesOf(state: BugJarState): readonly Shape[] {
  return BugShapeUtil.bugOf({
    key: 'bug', centreX: state.bugX, centreY: state.bugY, turnDegrees: state.bugTurnDegrees, opacity: state.bugOpacity,
  }).map((shape): Shape => ({ ...shape, transform: [...shrinkStepsOf(state.jarScale), ...(shape.transform ?? [])] }));
}

function jarShapesOf(state: BugJarState): readonly Shape[] {
  const shrink = shrinkStepsOf(state.jarScale);
  const rimX = BUG_JAR_SHAPE.JAR_X_UNITS + ((BUG_JAR_SHAPE.JAR_WIDTH_UNITS - BUG_JAR_SHAPE.RIM_WIDTH_UNITS) / 2);
  const rimY = BUG_JAR_SHAPE.JAR_Y_UNITS - (BUG_JAR_SHAPE.RIM_HEIGHT_UNITS / 2);
  return [
    {
      kind:         'rectangle',
      key:          'jar',
      x:            BUG_JAR_SHAPE.JAR_X_UNITS,
      y:            BUG_JAR_SHAPE.JAR_Y_UNITS,
      width:        BUG_JAR_SHAPE.JAR_WIDTH_UNITS,
      height:       BUG_JAR_SHAPE.JAR_HEIGHT_UNITS,
      cornerRadius: BUG_JAR_SHAPE.JAR_CORNER_RADIUS_UNITS,
      fill:         'waterLight',
      fillOpacity:  BUG_JAR_SHAPE.JAR_FILL_OPACITY,
      stroke:       'water',
      strokeWidth:  BUG_JAR_SHAPE.JAR_STROKE_UNITS,
      opacity:      state.jarOpacity,
      transform:    shrink,
    },
    {
      kind:      'rectangle',
      key:       'rim',
      x:         rimX,
      y:         rimY,
      width:     BUG_JAR_SHAPE.RIM_WIDTH_UNITS,
      height:    BUG_JAR_SHAPE.RIM_HEIGHT_UNITS,
      fill:      'graphite',
      opacity:   state.jarOpacity,
      transform: shrink,
    },
    {
      kind:      'rectangle',
      key:       'lid',
      x:         rimX + ((BUG_JAR_SHAPE.RIM_WIDTH_UNITS - BUG_JAR_SHAPE.LID_WIDTH_UNITS) / 2),
      y:         rimY - state.lidLift - BUG_JAR_SHAPE.LID_HEIGHT_UNITS,
      width:     BUG_JAR_SHAPE.LID_WIDTH_UNITS,
      height:    BUG_JAR_SHAPE.LID_HEIGHT_UNITS,
      fill:      'graphite',
      opacity:   state.jarOpacity,
      transform: shrink,
    },
  ];
}

function ticketShapesOf(state: BugJarState): readonly Shape[] {
  const transform: readonly TransformStep[] = [
    { translateX: state.ticketOffsetX, translateY: state.ticketOffsetY },
    ...PaperShapeUtil.miniSheetTransformOf({ x: BUG_JAR_TICKET.CENTRE_X_UNITS, y: BUG_JAR_TICKET.CENTRE_Y_UNITS }),
  ];
  return [
    { ...PaperShapeUtil.paperOf({ key: 'ticket' }), opacity: state.ticketOpacity, transform },
    {
      kind:    'circle',
      key:     'ticket-dot',
      centreX: BUG_JAR_TICKET.DOT_CENTRE_X_UNITS,
      centreY: BUG_JAR_TICKET.DOT_CENTRE_Y_UNITS,
      radius:  BUG_JAR_TICKET.DOT_RADIUS_UNITS,
      fill:    'alarm',
      opacity: state.ticketOpacity,
      transform,
    },
  ];
}

export const BUG_JAR_PROP = propDefinition({
  name:   'bugJar',
  hidden: Object.freeze<BugJarState>({
    shown:          0,
    bugX:           BUG_JAR_BUG.ABOVE_JAR_X_UNITS,
    bugY:           BUG_JAR_BUG.ABOVE_JAR_Y_UNITS,
    bugTurnDegrees: 0,
    bugOpacity:     0,
    jarOpacity:     0,
    jarScale:       1,
    lidLift:        BUG_JAR_SHAPE.LID_OPEN_LIFT_UNITS,
    ticketOpacity:  0,
    ticketOffsetX:  0,
    ticketOffsetY:  0,
  }),
  layer:    'in-front-of-body',
  gripOf:   (state: BugJarState): Point => ({ x: state.bugX + BUG_JAR_BUG.GRIP_OFFSET_X_UNITS, y: state.bugY + BUG_JAR_BUG.GRIP_OFFSET_Y_UNITS }),
  shapesOf: (state: BugJarState) => ({
    opacity: state.shown,
    shapes:  [...bugShapesOf(state), ...jarShapesOf(state), ...ticketShapesOf(state)],
  }),
});
