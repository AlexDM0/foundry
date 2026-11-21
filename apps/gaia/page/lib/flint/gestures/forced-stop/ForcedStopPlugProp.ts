/**
 * The plug of Forced stop: a socket, the plug with its two prongs, the cable from the plug's back to the spark it feeds, and the two
 * small sparks that fly from the socket as the plug comes out. The socket is drawn over the plug, so the prongs go into it.
 */
import type { Shape }     from '../../drawing/Shape.ts';
import { SvgTextUtil }    from '../../drawing/SvgTextUtil.ts';
import { propDefinition } from '../../props/PropDefinition.ts';
import { plugShapesOf }   from '../../props/shapes/PlugShape.ts';
import { SparkShapeUtil } from '../../props/shapes/SparkShapeUtil.ts';
import {
  CABLE,
  PLUG,
  SOCKET,
  SOCKET_SPARKS,
} from './constants/ForcedStopValues.ts';

export interface ForcedStopPlugState {
  readonly shown:             number;
  /** The plug's top left corner. */
  readonly plugX:             number;
  readonly plugY:             number;
  /** From 0 taut to 1 slack. */
  readonly cableSlack:        number;
  /** The flight of the socket's sparks, from 0 to 1; outside it they are not seen. */
  readonly socketSparkFlight: number;
  /** Multiplies the opacity: the fade in and out the gesture times itself. */
  readonly fade:              number;
}

function cableOf(state: ForcedStopPlugState): Shape {
  const { numberText } = SvgTextUtil;
  const controlX = CABLE.TAUT_CONTROL_X_UNITS + ((CABLE.SLACK_CONTROL_X_UNITS - CABLE.TAUT_CONTROL_X_UNITS) * state.cableSlack);
  const controlY = CABLE.TAUT_CONTROL_Y_UNITS + ((CABLE.SLACK_CONTROL_Y_UNITS - CABLE.TAUT_CONTROL_Y_UNITS) * state.cableSlack);
  return {
    kind:     'path',
    key:      'cable',
    pathData: `M${numberText(state.plugX)} ${numberText(state.plugY + CABLE.START_DROP_UNITS)} `
      + `Q${numberText(controlX)} ${numberText(controlY)} ${numberText(CABLE.END_X_UNITS)} ${numberText(CABLE.END_Y_UNITS)}`,
    fill:        'none',
    stroke:      'graphite',
    strokeWidth: CABLE.STROKE_UNITS,
    lineCap:     'round',
  };
}

function socketShapesOf(): readonly Shape[] {
  const slots = SOCKET.SLOT_X_UNITS.map((slotX, i): Shape => ({
    kind:   'rectangle',
    key:    `slot-${i}`,
    x:      slotX,
    y:      SOCKET.SLOT_Y_UNITS,
    width:  SOCKET.SLOT_WIDTH_UNITS,
    height: SOCKET.SLOT_HEIGHT_UNITS,
    fill:   'hardware',
  }));
  return [{
    kind:         'rectangle',
    key:          'socket',
    x:            SOCKET.X_UNITS,
    y:            SOCKET.Y_UNITS,
    width:        SOCKET.SIDE_UNITS,
    height:       SOCKET.SIDE_UNITS,
    cornerRadius: SOCKET.CORNER_RADIUS_UNITS,
    fill:         'graphite',
  }, ...slots];
}

function socketSparksOf(flight: number): readonly Shape[] {
  return SOCKET_SPARKS.ANGLES_DEGREES.map((angleDegrees, i) => SparkShapeUtil.smallSparkOf({
    key: `socket-spark-${i}`,
    ...SparkShapeUtil.flyingSparkPlaceOf({
      origin: { x: SOCKET_SPARKS.ORIGIN_X_UNITS, y: SOCKET_SPARKS.ORIGIN_Y_UNITS }, angleDegrees, travelUnits: SOCKET_SPARKS.TRAVEL_UNITS, flight,
    }),
  }));
}

export const FORCED_STOP_PLUG_PROP = propDefinition({
  name:   'forcedStopPlug',
  hidden: Object.freeze<ForcedStopPlugState>({
    shown: 0, plugX: PLUG.IN_X_UNITS, plugY: PLUG.IN_Y_UNITS, cableSlack: 0, socketSparkFlight: 0, fade: 1,
  }),
  layer:    'behind-body',
  shapesOf: (state: ForcedStopPlugState) => ({
    opacity: state.shown * state.fade,
    shapes:  [cableOf(state), ...plugShapesOf({ x: state.plugX, y: state.plugY }), ...socketShapesOf(), ...socketSparksOf(state.socketSparkFlight)],
  }),
});
