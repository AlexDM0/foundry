/** The hologram of Research (`01-character.md`): a panel of light above a small emitter, with a scan line, that flickers. */
import { propDefinition } from '../../props/PropDefinition.ts';
import { HOLOGRAM_SHAPE } from './constants/ResearchValues.ts';

export interface HologramState {
  readonly shown:     number;
  /** Multiplies the opacity: the flicker of the light. */
  readonly flicker:   number;
  readonly scanLineY: number;
}

export const HOLOGRAM_PROP = propDefinition({
  name:     'hologram',
  hidden:   Object.freeze<HologramState>({ shown: 0, flicker: 1, scanLineY: 0 }),
  layer:    'behind-body',
  shapesOf: (state: HologramState) => ({
    opacity: state.shown * state.flicker,
    shapes:  [
      {
        kind:         'rectangle',
        key:          'emitter',
        x:            HOLOGRAM_SHAPE.EMITTER_X_UNITS,
        y:            HOLOGRAM_SHAPE.EMITTER_Y_UNITS,
        width:        HOLOGRAM_SHAPE.EMITTER_WIDTH_UNITS,
        height:       HOLOGRAM_SHAPE.EMITTER_HEIGHT_UNITS,
        cornerRadius: HOLOGRAM_SHAPE.EMITTER_CORNER_RADIUS_UNITS,
        fill:         'graphite',
      },
      {
        kind:        'path',
        key:         'beams',
        pathData:    HOLOGRAM_SHAPE.BEAMS_PATH,
        fill:        'none',
        stroke:      'water',
        strokeWidth: HOLOGRAM_SHAPE.BEAMS_STROKE_UNITS,
        opacity:     HOLOGRAM_SHAPE.BEAMS_OPACITY,
      },
      {
        kind:         'rectangle',
        key:          'panel',
        x:            HOLOGRAM_SHAPE.PANEL_X_UNITS,
        y:            HOLOGRAM_SHAPE.PANEL_Y_UNITS,
        width:        HOLOGRAM_SHAPE.PANEL_WIDTH_UNITS,
        height:       HOLOGRAM_SHAPE.PANEL_HEIGHT_UNITS,
        cornerRadius: HOLOGRAM_SHAPE.PANEL_CORNER_RADIUS_UNITS,
        fill:         'water',
        fillOpacity:  HOLOGRAM_SHAPE.PANEL_FILL_OPACITY,
        stroke:       'water',
        strokeWidth:  HOLOGRAM_SHAPE.PANEL_STROKE_UNITS,
      },
      {
        kind: 'path', key: 'text', pathData: HOLOGRAM_SHAPE.TEXT_PATH, fill: 'none', stroke: 'water', strokeWidth: HOLOGRAM_SHAPE.TEXT_STROKE_UNITS, lineCap: 'round',
      },
      {
        kind:   'rectangle',
        key:    'scan-line',
        x:      HOLOGRAM_SHAPE.SCAN_LINE_X_UNITS,
        y:      state.scanLineY,
        width:  HOLOGRAM_SHAPE.SCAN_LINE_WIDTH_UNITS,
        height: HOLOGRAM_SHAPE.SCAN_LINE_HEIGHT_UNITS,
        fill:   'waterLight',
      },
    ],
  }),
});
