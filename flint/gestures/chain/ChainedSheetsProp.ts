/**
 * The props of Chain (`06-more-animations.md`): mini sheet A, the ticket that waits, mini sheet B, the ticket it waits for, and the links
 * between them. The links lie evenly on the straight line from A's end of the chain to B's, so they follow B when it pulls; each springs in.
 */
import type { Point }                from '../../SpriteGeometry.ts';
import type { Shape }                from '../../drawing/Shape.ts';
import { propDefinition }            from '../../props/PropDefinition.ts';
import { PaperShapeUtil }            from '../../props/shapes/PaperShapeUtil.ts';
import { CHAIN_LINKS, CHAIN_SHEETS } from './constants/ChainValues.ts';

export interface ChainedSheetsState {
  readonly shown:         number;
  /** Multiplies the opacity: the fade in and out of the props in their cycle. */
  readonly cycleOpacity:  number;
  /** The scale of each link, 0 before it is added; the spring of its entrance. */
  readonly linkScales:    readonly number[];
  readonly sheetBOffsetX: number;
  readonly sheetBOffsetY: number;
}

function miniSheetShapesOf(name: string, centre: Point, headerFill: 'body' | 'paperEdge'): readonly Shape[] {
  const transform = PaperShapeUtil.miniSheetTransformOf(centre);
  return [
    { ...PaperShapeUtil.paperOf({ key: `${name}-paper` }), transform },
    { ...PaperShapeUtil.headerOf(`${name}-header`, headerFill), transform },
  ];
}

/** The centre of link n, evenly from A's end to B's end of the chain, with B moved by its pull. */
export function chainLinkCentreOf(linkIndex: number, sheetBOffset: Point): Point {
  const along = linkIndex / (CHAIN_LINKS.COUNT - 1);
  return {
    x: CHAIN_LINKS.FIRST_X_UNITS + ((CHAIN_LINKS.LAST_X_UNITS + sheetBOffset.x - CHAIN_LINKS.FIRST_X_UNITS) * along),
    y: CHAIN_LINKS.FIRST_Y_UNITS + ((CHAIN_LINKS.LAST_Y_UNITS + sheetBOffset.y - CHAIN_LINKS.FIRST_Y_UNITS) * along),
  };
}

function linkShapeOf(state: ChainedSheetsState, i: number): Shape {
  const centre = chainLinkCentreOf(i, { x: state.sheetBOffsetX, y: state.sheetBOffsetY });
  const scale = state.linkScales[i] ?? 0;
  return {
    kind:         'rectangle',
    key:          `link-${i}`,
    x:            -CHAIN_LINKS.WIDTH_UNITS / 2,
    y:            -CHAIN_LINKS.HEIGHT_UNITS / 2,
    width:        CHAIN_LINKS.WIDTH_UNITS,
    height:       CHAIN_LINKS.HEIGHT_UNITS,
    cornerRadius: CHAIN_LINKS.CORNER_RADIUS_UNITS,
    fill:         'none',
    stroke:       'graphite',
    strokeWidth:  CHAIN_LINKS.STROKE_UNITS,
    opacity:      scale > 0 ? 1 : 0,
    transform:    [
      { translateX: centre.x, translateY: centre.y },
      { rotateDegrees: CHAIN_LINKS.TURNS_DEGREES[i % CHAIN_LINKS.TURNS_DEGREES.length] ?? 0 },
      { scaleX: scale, scaleY: scale },
    ],
  };
}

export const CHAINED_SHEETS_PROP = propDefinition({
  name:   'chainedSheets',
  hidden: Object.freeze<ChainedSheetsState>({
    shown: 0, cycleOpacity: 1, linkScales: Object.freeze(Array.from({ length: CHAIN_LINKS.COUNT }, () => 0)), sheetBOffsetX: 0, sheetBOffsetY: 0,
  }),
  layer:    'behind-body',
  shapesOf: (state: ChainedSheetsState) => ({
    opacity: state.shown * state.cycleOpacity,
    shapes:  [
      ...miniSheetShapesOf('sheet-a', { x: CHAIN_SHEETS.A_CENTRE_X_UNITS, y: CHAIN_SHEETS.A_CENTRE_Y_UNITS }, 'body'),
      ...miniSheetShapesOf(
        'sheet-b',
        { x: CHAIN_SHEETS.B_CENTRE_X_UNITS + state.sheetBOffsetX, y: CHAIN_SHEETS.B_CENTRE_Y_UNITS + state.sheetBOffsetY },
        'paperEdge',
      ),
      ...Array.from({ length: CHAIN_LINKS.COUNT }, (_unused, i) => linkShapeOf(state, i)),
    ],
  }),
});
