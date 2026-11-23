/**
 * The list of Customs: three claims, each a box and a line, and the verdict of each claim in its box. A list is
 * written from left to right on the screen, so facing left the box and the line change ends within the list; the verdicts are never
 * mirrored.
 */
import type { Facing }                            from '../../SpriteGeometry.ts';
import type { Shape }                             from '../../drawing/Shape.ts';
import { propDefinition }                         from '../../props/PropDefinition.ts';
import { VerdictShapeUtil }                       from '../../props/shapes/VerdictShapeUtil.ts';
import { CROSS_SHAPE, TICK_SHAPE, VERDICT_SHAPE } from '../../props/shapes/constants/SharedShapes.ts';
import { CUSTOMS_LIST_SHAPE }                     from './constants/CustomsValues.ts';

/** What a claim shows in its box: nothing yet, found, or not found. */
export type ClaimVerdict = 'unchecked' | 'found' | 'not-found';

export interface CustomsListState {
  readonly shown:        number;
  /** Multiplies the opacity: the fade in and out of the list within one cycle. */
  readonly cycleOpacity: number;
  readonly verdicts:     readonly ClaimVerdict[];
}

const LIST_CENTRE_X_UNITS = CUSTOMS_LIST_SHAPE.X_UNITS + (CUSTOMS_LIST_SHAPE.WIDTH_UNITS / 2);

/** An x on the list as Flint draws it, so that on the screen it reads from left to right whichever way Flint faces. */
function readingX(drawnX: number, facing: Facing): number {
  return facing === 1 ? drawnX : (2 * LIST_CENTRE_X_UNITS) - drawnX;
}

function claimShapesOf(claimY: number, i: number, verdict: ClaimVerdict, facing: Facing): readonly Shape[] {
  const side = CUSTOMS_LIST_SHAPE.BOX_SIDE_UNITS;
  const boxCentreX = readingX(CUSTOMS_LIST_SHAPE.BOX_X_UNITS + (side / 2), facing);
  const verdictOptions = { opacity: 1, scale: VERDICT_SHAPE.SMALL_SCALE } as const;
  const verdictShapes = {
    'unchecked': [],
    'found':     [VerdictShapeUtil.tickOf({
      key:    `tick-${i}`,
      startX: boxCentreX - (TICK_SHAPE.WIDTH_UNITS * VERDICT_SHAPE.SMALL_SCALE / 2),
      startY: claimY + CUSTOMS_LIST_SHAPE.SMALL_TICK_DROP_UNITS,
      ...verdictOptions,
    })],
    'not-found': [VerdictShapeUtil.crossOf({
      key:    `cross-${i}`,
      startX: boxCentreX - (CROSS_SHAPE.SIDE_UNITS * VERDICT_SHAPE.SMALL_SCALE / 2),
      startY: claimY - (CROSS_SHAPE.SIDE_UNITS * VERDICT_SHAPE.SMALL_SCALE / 2),
      ...verdictOptions,
    })],
  } as const satisfies Readonly<Record<ClaimVerdict, readonly Shape[]>>;
  const lineEnds = [readingX(CUSTOMS_LIST_SHAPE.LINE_START_X_UNITS, facing), readingX(CUSTOMS_LIST_SHAPE.LINE_END_X_UNITS, facing)];
  return [
    {
      kind:        'rectangle',
      key:         `box-${i}`,
      x:           boxCentreX - (side / 2),
      y:           claimY - (side / 2),
      width:       side,
      height:      side,
      fill:        'paper',
      stroke:      'paperEdge',
      strokeWidth: CUSTOMS_LIST_SHAPE.BOX_STROKE_UNITS,
    },
    {
      kind:        'line',
      key:         `line-${i}`,
      x1:          Math.min(...lineEnds),
      y1:          claimY,
      x2:          Math.max(...lineEnds),
      y2:          claimY,
      stroke:      'paperText',
      strokeWidth: CUSTOMS_LIST_SHAPE.LINE_STROKE_UNITS,
      lineCap:     'round',
    },
    ...verdictShapes[verdict],
  ];
}

export const CUSTOMS_LIST_PROP = propDefinition({
  name:     'customsList',
  hidden:   Object.freeze<CustomsListState>({ shown: 0, cycleOpacity: 1, verdicts: Object.freeze(CUSTOMS_LIST_SHAPE.CLAIM_Y_UNITS.map((): ClaimVerdict => 'unchecked')), }),
  layer:    'behind-body',
  shapesOf: (state: CustomsListState, context) => ({
    opacity: state.shown * state.cycleOpacity,
    shapes:  [
      {
        kind:        'rectangle',
        key:         'list',
        x:           CUSTOMS_LIST_SHAPE.X_UNITS,
        y:           CUSTOMS_LIST_SHAPE.Y_UNITS,
        width:       CUSTOMS_LIST_SHAPE.WIDTH_UNITS,
        height:      CUSTOMS_LIST_SHAPE.HEIGHT_UNITS,
        fill:        'paper',
        stroke:      'paperEdge',
        strokeWidth: CUSTOMS_LIST_SHAPE.STROKE_UNITS,
      },
      ...CUSTOMS_LIST_SHAPE.CLAIM_Y_UNITS.flatMap((claimY, i) => claimShapesOf(claimY, i, state.verdicts[i] ?? 'unchecked', context.facing)),
    ],
  }),
});
