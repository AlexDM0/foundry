/**
 * The barrier of Bouncer (`06-more-animations.md`): a post with a knob, the crimson rope from the hand to the post, and the verdict above
 * it. The rope unhooks by moving its far end and its bend from the hooked path to the hanging one; the tick and the cross are never
 * mirrored.
 */
import { SvgTextUtil }        from '../../drawing/SvgTextUtil.ts';
import { propDefinition }     from '../../props/PropDefinition.ts';
import { VerdictShapeUtil }   from '../../props/shapes/VerdictShapeUtil.ts';
import { CROSS_SHAPE }        from '../../props/shapes/constants/SharedShapes.ts';
import { AnimationCurveUtil } from '../../utils/AnimationCurveUtil.ts';
import { BARRIER_SHAPE }      from './constants/BouncerValues.ts';

export interface BouncerBarrierState {
  readonly shown:        number;
  /** Multiplies the opacity: the fade of the props at the end of an admit, and their return. */
  readonly cycleOpacity: number;
  /** From 0, hooked to the post, to 1, hanging from the hand. */
  readonly unhooked:     number;
  readonly crossOpacity: number;
  readonly tickOpacity:  number;
}

/** The rope's path for a share of the unhooking. */
export function ropePathOf(unhooked: number): string {
  const { numberText } = SvgTextUtil;
  const between = AnimationCurveUtil.interpolated;
  const controlX = between(BARRIER_SHAPE.HOOKED_CONTROL_X_UNITS, BARRIER_SHAPE.UNHOOKED_CONTROL_X_UNITS, unhooked);
  const controlY = between(BARRIER_SHAPE.HOOKED_CONTROL_Y_UNITS, BARRIER_SHAPE.UNHOOKED_CONTROL_Y_UNITS, unhooked);
  const endX = between(BARRIER_SHAPE.HOOKED_END_X_UNITS, BARRIER_SHAPE.UNHOOKED_END_X_UNITS, unhooked);
  const endY = between(BARRIER_SHAPE.HOOKED_END_Y_UNITS, BARRIER_SHAPE.UNHOOKED_END_Y_UNITS, unhooked);
  return `M${BARRIER_SHAPE.ROPE_START_X_UNITS} ${BARRIER_SHAPE.ROPE_START_Y_UNITS} Q${numberText(controlX)} ${numberText(controlY)} ${numberText(endX)} ${numberText(endY)}`;
}

const CROSS_HALF_SIDE_UNITS = (CROSS_SHAPE.SIDE_UNITS * BARRIER_SHAPE.CROSS_SCALE) / 2;

export const BOUNCER_BARRIER_PROP = propDefinition({
  name:   'bouncerBarrier',
  hidden: Object.freeze<BouncerBarrierState>({
    shown: 0, cycleOpacity: 1, unhooked: 0, crossOpacity: 0, tickOpacity: 0,
  }),
  layer:    'behind-body',
  shapesOf: (state: BouncerBarrierState) => ({
    opacity: state.shown * state.cycleOpacity,
    shapes:  [
      {
        kind:        'line',
        key:         'post',
        x1:          BARRIER_SHAPE.POST_X_UNITS,
        y1:          BARRIER_SHAPE.POST_BOTTOM_Y_UNITS,
        x2:          BARRIER_SHAPE.POST_X_UNITS,
        y2:          BARRIER_SHAPE.POST_TOP_Y_UNITS,
        stroke:      'graphite',
        strokeWidth: BARRIER_SHAPE.POST_STROKE_UNITS,
      },
      {
        kind:    'circle',
        key:     'knob',
        centreX: BARRIER_SHAPE.POST_X_UNITS,
        centreY: BARRIER_SHAPE.POST_TOP_Y_UNITS,
        radius:  BARRIER_SHAPE.KNOB_RADIUS_UNITS,
        fill:    'graphite',
      },
      {
        kind:        'path',
        key:         'rope',
        pathData:    ropePathOf(state.unhooked),
        fill:        'none',
        stroke:      'alarm',
        strokeWidth: BARRIER_SHAPE.ROPE_STROKE_UNITS,
        lineCap:     'round',
      },
      VerdictShapeUtil.crossOf({
        key:     'cross',
        startX:  BARRIER_SHAPE.CROSS_CENTRE_X_UNITS - CROSS_HALF_SIDE_UNITS,
        startY:  BARRIER_SHAPE.CROSS_CENTRE_Y_UNITS - CROSS_HALF_SIDE_UNITS,
        opacity: state.crossOpacity,
        scale:   BARRIER_SHAPE.CROSS_SCALE,
      }),
      VerdictShapeUtil.tickOf({
        key: 'tick', startX: BARRIER_SHAPE.TICK_START_X_UNITS, startY: BARRIER_SHAPE.TICK_START_Y_UNITS, opacity: state.tickOpacity,
      }),
    ],
  }),
});
