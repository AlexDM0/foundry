/** The pages that spill out of the top of Flint while it molts: small paper rectangles, each placed at its centre, turned and faded. */
import type { Shape }     from '../../drawing/Shape.ts';
import { propDefinition } from '../../props/PropDefinition.ts';
import { SPILLED_PAGES }  from './constants/MoltValues.ts';

export interface SpilledPageState {
  /** The centre of the page. */
  readonly x:           number;
  readonly y:           number;
  readonly turnDegrees: number;
  readonly opacity:     number;
}

export interface SpilledPagesState {
  readonly shown: number;
  readonly pages: readonly SpilledPageState[];
}

const UNSPILLED_PAGE: SpilledPageState = Object.freeze({
  x: 0, y: SPILLED_PAGES.TOP_Y_UNITS, turnDegrees: 0, opacity: 0,
});

export const SPILLED_PAGES_PROP = propDefinition({
  name:     'spilledPages',
  hidden:   Object.freeze<SpilledPagesState>({ shown: 0, pages: Object.freeze(Array.from({ length: SPILLED_PAGES.COUNT }, () => UNSPILLED_PAGE)), }),
  layer:    'behind-body',
  shapesOf: (state: SpilledPagesState) => ({
    opacity: state.shown,
    shapes:  state.pages.map((page, i): Shape => ({
      kind:        'rectangle',
      key:         `page-${i}`,
      x:           page.x - (SPILLED_PAGES.WIDTH_UNITS / 2),
      y:           page.y - (SPILLED_PAGES.HEIGHT_UNITS / 2),
      width:       SPILLED_PAGES.WIDTH_UNITS,
      height:      SPILLED_PAGES.HEIGHT_UNITS,
      fill:        'paper',
      stroke:      'paperEdge',
      strokeWidth: SPILLED_PAGES.STROKE_UNITS,
      opacity:     page.opacity,
      transform:   [{ rotateDegrees: page.turnDegrees, aboutX: page.x, aboutY: page.y }],
    })),
  }),
});
