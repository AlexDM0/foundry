/**
 * The blueprint of Survey (`06-more-animations.md`): the paper in the `water` colour with a grid of thirds, two measure lines with end
 * marks, and three posts with a lamp on each. The measure along the top grows from its left end on the screen whatever the facing, as a
 * written line does (`02-animations.md`, "Reading and writing direction").
 */
import type { Facing, Point }                            from '../../SpriteGeometry.ts';
import type { Shape }                                    from '../../drawing/Shape.ts';
import { propDefinition }                                from '../../props/PropDefinition.ts';
import type { LampState }                                from '../../props/shapes/LampShapeUtil.ts';
import { LampShapeUtil }                                 from '../../props/shapes/LampShapeUtil.ts';
import { PaperShapeUtil }                                from '../../props/shapes/PaperShapeUtil.ts';
import { writtenLineShapeOf }                            from '../../props/shapes/WrittenLineShape.ts';
import { LAMP_SHAPE, PAPER_SHAPE }                       from '../../props/shapes/constants/SharedShapes.ts';
import { BLUEPRINT_SHAPE, SURVEY_MEASURE, SURVEY_POSTS } from './constants/SurveyValues.ts';

export interface SurveyPostState {
  /** From 0, not set, to 1, at its full height. */
  readonly growth:      number;
  readonly lampOpacity: number;
  readonly lamp:        LampState;
}

export interface SurveyState {
  readonly shown:        number;
  readonly sceneOpacity: number;
  /** How much of each measure line is drawn, from 0 to 1. */
  readonly topMeasure:   number;
  readonly sideMeasure:  number;
  /** In the order of `SURVEY_POSTS.X_UNITS`. */
  readonly posts:        readonly SurveyPostState[];
}

function gridShapesOf(opacity: number): readonly Shape[] {
  const [topLeft, topRight, , bottomLeft] = PAPER_SHAPE.POINTS;
  const left = topLeft.x;
  const width = topRight.x - topLeft.x;
  const height = bottomLeft.y - topLeft.y;
  const style = {
    stroke: 'water', strokeWidth: BLUEPRINT_SHAPE.GRID_STROKE_UNITS, strokeOpacity: BLUEPRINT_SHAPE.GRID_OPACITY, opacity,
  } as const;
  return Array.from({ length: BLUEPRINT_SHAPE.GRID_DIVISIONS - 1 }, (_unused, i): readonly Shape[] => {
    const share = (i + 1) / BLUEPRINT_SHAPE.GRID_DIVISIONS;
    const downX = left + (width * share);
    const acrossY = topLeft.y + (height * share);
    const downTopY = topLeft.y + (PAPER_SHAPE.SLOPE * (downX - left));
    return [
      {
        kind: 'line', key: `across-${i}`, x1: left, y1: acrossY, x2: left + width, y2: acrossY + (PAPER_SHAPE.SLOPE * width), ...style,
      },
      {
        kind: 'line', key: `down-${i}`, x1: downX, y1: downTopY, x2: downX, y2: downTopY + height, ...style,
      },
    ];
  }).flat();
}

function endMarkOf(key: string, centre: Point, across: Point, opacity: number): Shape {
  const half = SURVEY_MEASURE.END_MARK_UNITS / 2;
  return {
    kind:        'line',
    key,
    x1:          centre.x - (across.x * half),
    y1:          centre.y - (across.y * half),
    x2:          centre.x + (across.x * half),
    y2:          centre.y + (across.y * half),
    stroke:      'graphite',
    strokeWidth: SURVEY_MEASURE.STROKE_UNITS,
    opacity,
  };
}

/** The measure along the top: its fixed end is the left one on the screen, its marks cross it at right angles to the paper's slope. */
function topMeasureShapesOf(state: SurveyState, facing: Facing): readonly Shape[] {
  const fullLength = SURVEY_MEASURE.TOP_LENGTH_UNITS;
  const writtenLength = fullLength * state.topMeasure;
  const pointAt = (offset: number): Point => ({ x: SURVEY_MEASURE.TOP_START_X_UNITS + offset, y: SURVEY_MEASURE.TOP_START_Y_UNITS + (PAPER_SHAPE.SLOPE * offset) });
  const fixedEnd = pointAt(facing === 1 ? 0 : fullLength);
  const growingEnd = pointAt(facing === 1 ? writtenLength : fullLength - writtenLength);
  const crossLength = Math.hypot(PAPER_SHAPE.SLOPE, 1);
  const across = { x: -PAPER_SHAPE.SLOPE / crossLength, y: 1 / crossLength };
  const markOpacity = state.topMeasure > 0 ? state.sceneOpacity : 0;
  return [
    {
      ...writtenLineShapeOf({
        key:         'top-measure',
        startX:      SURVEY_MEASURE.TOP_START_X_UNITS,
        startY:      SURVEY_MEASURE.TOP_START_Y_UNITS,
        fullLength,
        writtenLength,
        facing,
        stroke:      'graphite',
        strokeWidth: SURVEY_MEASURE.STROKE_UNITS,
      }),
      opacity: markOpacity,
    },
    endMarkOf('top-measure-start', fixedEnd, across, markOpacity),
    endMarkOf('top-measure-end', growingEnd, across, markOpacity),
  ];
}

function sideMeasureShapesOf(state: SurveyState): readonly Shape[] {
  const endY = SURVEY_MEASURE.SIDE_START_Y_UNITS + ((SURVEY_MEASURE.SIDE_END_Y_UNITS - SURVEY_MEASURE.SIDE_START_Y_UNITS) * state.sideMeasure);
  const opacity = state.sideMeasure > 0 ? state.sceneOpacity : 0;
  const across = { x: 1, y: 0 };
  return [
    {
      kind:        'line',
      key:         'side-measure',
      x1:          SURVEY_MEASURE.SIDE_X_UNITS,
      y1:          SURVEY_MEASURE.SIDE_START_Y_UNITS,
      x2:          SURVEY_MEASURE.SIDE_X_UNITS,
      y2:          endY,
      stroke:      'graphite',
      strokeWidth: SURVEY_MEASURE.STROKE_UNITS,
      lineCap:     'round',
      opacity,
    },
    endMarkOf('side-measure-start', { x: SURVEY_MEASURE.SIDE_X_UNITS, y: SURVEY_MEASURE.SIDE_START_Y_UNITS }, across, opacity),
    endMarkOf('side-measure-end', { x: SURVEY_MEASURE.SIDE_X_UNITS, y: endY }, across, opacity),
  ];
}

/** Where a post stands on the blueprint: the point of its base. */
export function postBaseOf(postX: number): Point {
  return { x: postX, y: SURVEY_POSTS.BASE_Y_UNITS + (SURVEY_POSTS.BASE_SLOPE * (postX - SURVEY_POSTS.BASE_ORIGIN_X_UNITS)) };
}

/** Each post grows up from its base, with the lamp of the shared vocabulary on top, at the smaller radius of a post's lamp. */
function postShapesOf(state: SurveyState): readonly Shape[] {
  return state.posts.flatMap((post, i): readonly Shape[] => {
    const base = postBaseOf(SURVEY_POSTS.X_UNITS[i] ?? 0);
    const lampCentre = { x: base.x, y: base.y - SURVEY_POSTS.HEIGHT_UNITS - LAMP_SHAPE.RADIUS_UNITS };
    return [
      {
        kind:        'line',
        key:         `post-${i}`,
        x1:          base.x,
        y1:          base.y,
        x2:          base.x,
        y2:          base.y - (SURVEY_POSTS.HEIGHT_UNITS * post.growth),
        stroke:      'graphite',
        strokeWidth: SURVEY_POSTS.STROKE_UNITS,
        opacity:     post.growth > 0 ? state.sceneOpacity : 0,
      },
      LampShapeUtil.lampOf({
        key:                 `lamp-${i}`,
        centreX:             lampCentre.x,
        centreY:             lampCentre.y,
        state:               post.lamp,
        elapsedMilliseconds: 0,
        radiusUnits:         LAMP_SHAPE.RADIUS_UNITS,
        opacity:             post.lampOpacity,
      }),
    ];
  });
}

export const SURVEY_BLUEPRINT_PROP = propDefinition({
  name:   'surveyBlueprint',
  hidden: Object.freeze<SurveyState>({
    shown:        0,
    sceneOpacity: 0,
    topMeasure:   0,
    sideMeasure:  0,
    posts:        Object.freeze(SURVEY_POSTS.X_UNITS.map(() => Object.freeze<SurveyPostState>({ growth: 0, lampOpacity: 0, lamp: 'off' }))),
  }),
  layer:    'behind-body',
  shapesOf: (state: SurveyState, context) => ({
    opacity: state.shown,
    shapes:  [
      {
        ...PaperShapeUtil.paperOf({ key: 'blueprint' }),
        fill:        'water',
        fillOpacity: BLUEPRINT_SHAPE.FILL_OPACITY,
        stroke:      'water',
        strokeWidth: BLUEPRINT_SHAPE.STROKE_UNITS,
        opacity:     state.sceneOpacity,
      },
      ...gridShapesOf(state.sceneOpacity),
      ...topMeasureShapesOf(state, context.facing),
      ...sideMeasureShapesOf(state),
      ...postShapesOf(state),
    ],
  }),
});
