/** The rail of Gate run: a graphite rail with four lamps of the shared vocabulary, and the tick above it. */
import type { Shape }       from '../../drawing/Shape.ts';
import { propDefinition }   from '../../props/PropDefinition.ts';
import type { LampState }   from '../../props/shapes/LampShapeUtil.ts';
import { LampShapeUtil }    from '../../props/shapes/LampShapeUtil.ts';
import { VerdictShapeUtil } from '../../props/shapes/VerdictShapeUtil.ts';
import { GATE_RAIL_SHAPE }  from './constants/GateRunValues.ts';

export interface GateRailState {
  readonly shown:             number;
  /** The fade in and out of one run in its cycle. */
  readonly opacity:           number;
  /** One state for each lamp, from the left. */
  readonly lampStates:        readonly LampState[];
  /** The gesture's time, for the pulse of a running lamp. */
  readonly pulseMilliseconds: number;
  readonly tickOpacity:       number;
}

export const GATE_RAIL_PROP = propDefinition({
  name:   'gateRail',
  hidden: Object.freeze<GateRailState>({
    shown: 0, opacity: 0, lampStates: Object.freeze(GATE_RAIL_SHAPE.LAMP_X_UNITS.map((): LampState => 'off')), pulseMilliseconds: 0, tickOpacity: 0,
  }),
  layer:    'behind-body',
  shapesOf: (state: GateRailState) => ({
    opacity: state.shown * state.opacity,
    shapes:  [
      {
        kind:         'rectangle',
        key:          'rail',
        x:            GATE_RAIL_SHAPE.X_UNITS,
        y:            GATE_RAIL_SHAPE.Y_UNITS,
        width:        GATE_RAIL_SHAPE.WIDTH_UNITS,
        height:       GATE_RAIL_SHAPE.HEIGHT_UNITS,
        cornerRadius: GATE_RAIL_SHAPE.CORNER_RADIUS_UNITS,
        fill:         'graphite',
      },
      ...GATE_RAIL_SHAPE.LAMP_X_UNITS.map((lampX, i): Shape => LampShapeUtil.lampOf({
        key:                 `lamp-${i}`,
        centreX:             lampX,
        centreY:             GATE_RAIL_SHAPE.LAMP_Y_UNITS,
        state:               state.lampStates[i] ?? 'off',
        elapsedMilliseconds: state.pulseMilliseconds,
      })),
      VerdictShapeUtil.tickOf({
        key: 'tick', startX: GATE_RAIL_SHAPE.TICK_START_X_UNITS, startY: GATE_RAIL_SHAPE.TICK_START_Y_UNITS, opacity: state.tickOpacity,
      }),
    ],
  }),
});
