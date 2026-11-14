/** The knock of Needs an answer (`06-more-animations.md`): two short arcs above the knuckle that knocks, which fade after each knock. */
import { SvgTextUtil }        from '../../drawing/SvgTextUtil.ts';
import { propDefinition }     from '../../props/PropDefinition.ts';
import { AnimationCurveUtil } from '../../utils/AnimationCurveUtil.ts';
import { KNOCK_ARCS_SHAPE }   from './constants/AskValues.ts';

export interface KnockArcsState {
  readonly shown:   number;
  readonly centreX: number;
  readonly centreY: number;
  /** 1 as a knock starts, fading to 0. */
  readonly opacity: number;
}

function arcPathOf(state: KnockArcsState, fromDegrees: number, toDegrees: number): string {
  const { numberText } = SvgTextUtil;
  const radius = KNOCK_ARCS_SHAPE.RADIUS_UNITS;
  const pointText = (degrees: number): string => {
    const radians = AnimationCurveUtil.radiansOf(degrees);
    return `${numberText(state.centreX + (radius * Math.cos(radians)))} ${numberText(state.centreY + (radius * Math.sin(radians)))}`;
  };
  return `M${pointText(fromDegrees)} A${numberText(radius)} ${numberText(radius)} 0 0 1 ${pointText(toDegrees)}`;
}

export const KNOCK_ARCS_PROP = propDefinition({
  name:   'knockArcs',
  hidden: Object.freeze<KnockArcsState>({
    shown: 0, centreX: 0, centreY: 0, opacity: 0,
  }),
  layer:    'in-front-of-all',
  shapesOf: (state: KnockArcsState) => ({
    opacity: state.shown * state.opacity,
    shapes:  KNOCK_ARCS_SHAPE.ARCS_DEGREES.map((arc, i) => ({
      kind:        'path',
      key:         `arc-${i}`,
      pathData:    arcPathOf(state, arc.FROM, arc.TO),
      fill:        'none',
      stroke:      'paperEdge',
      strokeWidth: KNOCK_ARCS_SHAPE.STROKE_UNITS,
      lineCap:     'round',
    })),
  }),
});
