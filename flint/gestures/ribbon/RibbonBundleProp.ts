/**
 * The bundle of Ribbon (`06-more-animations.md`): three tickets of one epic as mini sheets that gather from apart into a fan, the ribbon
 * that grows around them, and the bow that springs in on top. The bundle leaves as one part.
 */
import type { Point }                 from '../../SpriteGeometry.ts';
import type { Shape }                 from '../../drawing/Shape.ts';
import { propDefinition }             from '../../props/PropDefinition.ts';
import { PaperShapeUtil }             from '../../props/shapes/PaperShapeUtil.ts';
import { AnimationCurveUtil }         from '../../utils/AnimationCurveUtil.ts';
import { RIBBON_BAND, RIBBON_SHEETS } from './constants/RibbonValues.ts';

export interface RibbonBundleState {
  readonly shown:        number;
  /** Multiplies the opacity: the fade in and out of the bundle in its cycle. */
  readonly cycleOpacity: number;
  /** From 0, the sheets apart, to 1, pushed together. */
  readonly gathered:     number;
  /** The share of the ribbon's width that is wrapped. */
  readonly wrapped:      number;
  /** The scale of the bow, 0 before it shows; the spring of its entrance. */
  readonly bowScale:     number;
  readonly offsetX:      number;
  readonly offsetY:      number;
}


function sheetShapesOf(sheetIndex: number, gathered: number): readonly Shape[] {
  const centre: Point = {
    x: AnimationCurveUtil.interpolated(RIBBON_SHEETS.APART_X_UNITS[sheetIndex] ?? 0, RIBBON_SHEETS.TOGETHER_X_UNITS[sheetIndex] ?? 0, gathered),
    y: RIBBON_SHEETS.CENTRE_Y_UNITS,
  };
  const turnDegrees = AnimationCurveUtil.interpolated(RIBBON_SHEETS.APART_TURNS_DEGREES[sheetIndex] ?? 0, RIBBON_SHEETS.TOGETHER_TURNS_DEGREES[sheetIndex] ?? 0, gathered);
  const transform = [{ rotateDegrees: turnDegrees, aboutX: centre.x, aboutY: centre.y }, ...PaperShapeUtil.miniSheetTransformOf(centre)];
  return [
    { ...PaperShapeUtil.paperOf({ key: `sheet-${sheetIndex}` }), transform },
    { ...PaperShapeUtil.headerOf(`sheet-${sheetIndex}-header`), transform },
  ];
}

function bowShapesOf(scale: number): readonly Shape[] {
  const transform = [{ translateX: RIBBON_BAND.BOW_CENTRE_X_UNITS, translateY: RIBBON_BAND.BOW_CENTRE_Y_UNITS }, { scaleX: scale, scaleY: scale }];
  const opacity = scale > 0 ? 1 : 0;
  const wingOf = (key: string, side: number): Shape => ({
    kind:   'polygon',
    key,
    points: [
      { x: 0, y: 0 },
      { x: side * RIBBON_BAND.BOW_WING_LENGTH_UNITS, y: -RIBBON_BAND.BOW_WING_HALF_SPAN_UNITS },
      { x: side * RIBBON_BAND.BOW_WING_LENGTH_UNITS, y: RIBBON_BAND.BOW_WING_HALF_SPAN_UNITS },
    ],
    fill: 'ribbon',
    opacity,
    transform,
  });
  const knotHalf = RIBBON_BAND.BOW_KNOT_SIDE_UNITS / 2;
  return [
    wingOf('bow-near-wing', -1),
    wingOf('bow-far-wing', 1),
    {
      kind:   'rectangle',
      key:    'bow-knot',
      x:      -knotHalf,
      y:      -knotHalf,
      width:  RIBBON_BAND.BOW_KNOT_SIDE_UNITS,
      height: RIBBON_BAND.BOW_KNOT_SIDE_UNITS,
      fill:   'ribbon',
      opacity,
      transform,
    },
  ];
}

export const RIBBON_BUNDLE_PROP = propDefinition({
  name:   'ribbonBundle',
  hidden: Object.freeze<RibbonBundleState>({
    shown: 0, cycleOpacity: 1, gathered: 0, wrapped: 0, bowScale: 0, offsetX: 0, offsetY: 0,
  }),
  layer:    'behind-body',
  shapesOf: (state: RibbonBundleState) => ({
    opacity:   state.shown * state.cycleOpacity,
    transform: [{ translateX: state.offsetX, translateY: state.offsetY }],
    shapes:    [
      ...RIBBON_SHEETS.APART_X_UNITS.flatMap((_apartX, sheetIndex) => sheetShapesOf(sheetIndex, state.gathered)),
      {
        kind:    'rectangle',
        key:     'ribbon',
        x:       RIBBON_BAND.X_UNITS,
        y:       RIBBON_BAND.Y_UNITS,
        width:   RIBBON_BAND.WIDTH_UNITS * state.wrapped,
        height:  RIBBON_BAND.HEIGHT_UNITS,
        fill:    'ribbon',
        opacity: state.wrapped > 0 ? 1 : 0,
      },
      ...bowShapesOf(state.bowScale),
    ],
  }),
});
