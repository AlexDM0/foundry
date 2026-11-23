/** The search bar of Research: its icon, and the query that grows from its left end on the screen. */
import { propDefinition }   from '../../props/PropDefinition.ts';
import { SEARCH_BAR_SHAPE } from './constants/ResearchValues.ts';

export interface SearchBarState {
  readonly shown:       number;
  readonly queryLength: number;
}

export const SEARCH_BAR_PROP = propDefinition({
  name:     'searchBar',
  hidden:   Object.freeze<SearchBarState>({ shown: 0, queryLength: 0 }),
  layer:    'behind-body',
  shapesOf: (state: SearchBarState, context) => {
    const queryStartX = SEARCH_BAR_SHAPE.QUERY_START_X_UNITS + (context.facing === 1 ? 0 : SEARCH_BAR_SHAPE.FULL_QUERY_UNITS);
    return {
      opacity: state.shown,
      shapes:  [
        {
          kind:         'rectangle',
          key:          'bar',
          x:            SEARCH_BAR_SHAPE.X_UNITS,
          y:            SEARCH_BAR_SHAPE.Y_UNITS,
          width:        SEARCH_BAR_SHAPE.WIDTH_UNITS,
          height:       SEARCH_BAR_SHAPE.HEIGHT_UNITS,
          cornerRadius: SEARCH_BAR_SHAPE.CORNER_RADIUS_UNITS,
          fill:         'paper',
          stroke:       'paperEdge',
          strokeWidth:  SEARCH_BAR_SHAPE.STROKE_UNITS,
        },
        {
          kind:        'circle',
          key:         'icon',
          centreX:     SEARCH_BAR_SHAPE.ICON_CENTRE_X_UNITS,
          centreY:     SEARCH_BAR_SHAPE.ICON_CENTRE_Y_UNITS,
          radius:      SEARCH_BAR_SHAPE.ICON_RADIUS_UNITS,
          fill:        'none',
          stroke:      'paperEdge',
          strokeWidth: SEARCH_BAR_SHAPE.STROKE_UNITS,
        },
        {
          kind:        'path',
          key:         'icon-handle',
          pathData:    SEARCH_BAR_SHAPE.ICON_HANDLE_PATH,
          fill:        'none',
          stroke:      'paperEdge',
          strokeWidth: SEARCH_BAR_SHAPE.STROKE_UNITS,
          lineCap:     'round',
        },
        {
          kind:        'line',
          key:         'query',
          x1:          queryStartX,
          y1:          SEARCH_BAR_SHAPE.QUERY_Y_UNITS,
          x2:          queryStartX + (state.queryLength * context.facing),
          y2:          SEARCH_BAR_SHAPE.QUERY_Y_UNITS,
          stroke:      'graphite',
          strokeWidth: SEARCH_BAR_SHAPE.QUERY_STROKE_UNITS,
          lineCap:     'round',
        },
      ],
    };
  },
});
