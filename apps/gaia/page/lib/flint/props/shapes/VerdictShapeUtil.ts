/**
 * The tick and the cross of the shared vocabulary: a verdict, drawn from its start point, never mirrored. A
 * small one is the same shape at `VERDICT_SHAPE.SMALL_SCALE`, scaled around its start point.
 */
import type { FlintColourRole }      from '../../constants/Palette.ts';
import type { Shape, TransformStep } from '../../drawing/Shape.ts';
import { SvgTextUtil }               from '../../drawing/SvgTextUtil.ts';
import { CROSS_SHAPE, TICK_SHAPE }   from './constants/SharedShapes.ts';

export interface VerdictOptions {
  readonly key:     string;
  readonly startX:  number;
  readonly startY:  number;
  readonly opacity: number;
  /** 1 by default; `VERDICT_SHAPE.SMALL_SCALE` for a small one. */
  readonly scale?:  number;
  /** A tick is green and a cross crimson by default; a waived verdict is grey. */
  readonly colour?: FlintColourRole;
}

function scaledAroundStart(options: VerdictOptions): { readonly transform?: readonly TransformStep[] } {
  const scale = options.scale ?? 1;
  if (scale === 1) return {};
  return {
    transform: [
      { translateX: options.startX, translateY: options.startY },
      { scaleX: scale, scaleY: scale },
      { translateX: -options.startX, translateY: -options.startY },
    ],
  };
}

export const VerdictShapeUtil = Object.freeze({
  tickOf: (options: VerdictOptions): Shape => ({
    kind:             'path',
    key:              options.key,
    pathData:         `M${SvgTextUtil.numberText(options.startX)} ${SvgTextUtil.numberText(options.startY)} ${TICK_SHAPE.RELATIVE_PATH}`,
    fill:             'none',
    stroke:           options.colour ?? 'done',
    strokeWidth:      TICK_SHAPE.STROKE_UNITS,
    lineCap:          'round',
    lineJoin:         'round',
    opacity:          options.opacity,
    unmirroredAboutX: options.startX + ((TICK_SHAPE.WIDTH_UNITS * (options.scale ?? 1)) / 2),
    ...scaledAroundStart(options),
  }),

  crossOf: (options: VerdictOptions): Shape => {
    const { numberText } = SvgTextUtil;
    const side = CROSS_SHAPE.SIDE_UNITS;
    const startY = numberText(options.startY);
    return {
      kind:             'path',
      key:              options.key,
      pathData:         `M${numberText(options.startX)} ${startY} l${side} ${side} M${numberText(options.startX + side)} ${startY} l-${side} ${side}`,
      fill:             'none',
      stroke:           options.colour ?? 'alarm',
      strokeWidth:      CROSS_SHAPE.STROKE_UNITS,
      lineCap:          'round',
      opacity:          options.opacity,
      unmirroredAboutX: options.startX + ((side * (options.scale ?? 1)) / 2),
      ...scaledAroundStart(options),
    };
  },
});
