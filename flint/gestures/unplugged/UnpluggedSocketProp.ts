/**
 * The socket of Unplugged (`06-more-animations.md`): a socket plate with two slots, the plug of Forced stop with its prongs, a cable from
 * the plug to the floor that follows the plug, two crimson warning lines, the small sparks of the connection, and a pulse of the stream on
 * the cable. The prongs are drawn before the plate, so once the plug is in they are inside it. A hand held to this prop holds the plug.
 */
import type { Point }           from '../../SpriteGeometry.ts';
import type { Shape }           from '../../drawing/Shape.ts';
import { SvgTextUtil }          from '../../drawing/SvgTextUtil.ts';
import { propDefinition }       from '../../props/PropDefinition.ts';
import { plugShapesOf }         from '../../props/shapes/PlugShape.ts';
import { SparkShapeUtil }       from '../../props/shapes/SparkShapeUtil.ts';
import type { SmallSparkPlace } from '../../props/shapes/SparkShapeUtil.ts';
import { TracedPathUtil }       from '../../props/shapes/TracedPathUtil.ts';
import { PLUG_SHAPE }           from '../../props/shapes/constants/SharedShapes.ts';
import {
  UNPLUGGED_CABLE,
  UNPLUGGED_HAND,
  UNPLUGGED_SHAPE,
  UNPLUGGED_SPARKS,
  UNPLUGGED_WARNING,
} from './constants/UnpluggedValues.ts';

export interface UnpluggedState {
  readonly shown:          number;
  readonly sceneOpacity:   number;
  /** The top left corner of the plug. */
  readonly plugX:          number;
  readonly plugY:          number;
  readonly warningOpacity: number;
  readonly isConnected:    boolean;
  readonly sparks:         readonly SmallSparkPlace[];
  /** Where the pulse is on the cable, from 0 at the plug to 1 at the floor. */
  readonly pulseAlong:     number;
  readonly pulseOpacity:   number;
}

function cableStartOf(state: UnpluggedState): Point {
  return { x: state.plugX + UNPLUGGED_CABLE.START_OFFSET_X_UNITS, y: state.plugY + UNPLUGGED_CABLE.START_OFFSET_Y_UNITS };
}

/** The point at a share of the cable's quadratic curve. */
function cablePointAt(state: UnpluggedState, along: number): Point {
  return TracedPathUtil.quadraticPointOf(cableStartOf(state), {
    control: { x: UNPLUGGED_CABLE.CONTROL_X_UNITS, y: UNPLUGGED_CABLE.CONTROL_Y_UNITS },
    end:     { x: UNPLUGGED_CABLE.END_X_UNITS, y: UNPLUGGED_CABLE.END_Y_UNITS },
  }, along);
}

function cableShapesOf(state: UnpluggedState): readonly Shape[] {
  const { numberText } = SvgTextUtil;
  const start = cableStartOf(state);
  const pulse = cablePointAt(state, state.pulseAlong);
  return [
    {
      kind:     'path',
      key:      'cable',
      pathData: `M${numberText(state.plugX)} ${numberText(state.plugY + UNPLUGGED_CABLE.LEAD_Y_UNITS)} L${numberText(start.x)} ${numberText(start.y)} `
        + `Q${numberText(UNPLUGGED_CABLE.CONTROL_X_UNITS)} ${numberText(UNPLUGGED_CABLE.CONTROL_Y_UNITS)} `
        + `${numberText(UNPLUGGED_CABLE.END_X_UNITS)} ${numberText(UNPLUGGED_CABLE.END_Y_UNITS)}`,
      fill:        'none',
      stroke:      'graphite',
      strokeWidth: UNPLUGGED_CABLE.STROKE_UNITS,
      lineCap:     'round',
      opacity:     state.sceneOpacity,
    },
    {
      kind: 'circle', key: 'pulse', centreX: pulse.x, centreY: pulse.y, radius: UNPLUGGED_CABLE.PULSE_RADIUS_UNITS, fill: 'emberLight', opacity: state.pulseOpacity,
    },
  ];
}

function plateShapesOf(state: UnpluggedState): readonly Shape[] {
  const prongMiddle = PLUG_SHAPE.PRONG_HEIGHT_UNITS / 2;
  return [
    {
      kind:         'rectangle',
      key:          'plate',
      x:            UNPLUGGED_SHAPE.PLATE_X_UNITS,
      y:            UNPLUGGED_SHAPE.PLATE_Y_UNITS,
      width:        UNPLUGGED_SHAPE.PLATE_WIDTH_UNITS,
      height:       UNPLUGGED_SHAPE.PLATE_HEIGHT_UNITS,
      cornerRadius: UNPLUGGED_SHAPE.PLATE_CORNER_RADIUS_UNITS,
      fill:         'graphite',
      opacity:      state.sceneOpacity,
    },
    ...PLUG_SHAPE.PRONG_DROPS_UNITS.map((prongTop, i): Shape => ({
      kind:    'rectangle',
      key:     `slot-${i}`,
      x:       UNPLUGGED_SHAPE.PLATE_X_UNITS + UNPLUGGED_SHAPE.SLOT_INSET_UNITS,
      y:       UNPLUGGED_SHAPE.PLUG_Y_UNITS + prongTop + prongMiddle - (UNPLUGGED_SHAPE.SLOT_HEIGHT_UNITS / 2),
      width:   UNPLUGGED_SHAPE.SLOT_WIDTH_UNITS,
      height:  UNPLUGGED_SHAPE.SLOT_HEIGHT_UNITS,
      fill:    state.isConnected ? 'done' : 'hardware',
      opacity: state.sceneOpacity,
    })),
    ...UNPLUGGED_WARNING.LINES.map((line, i): Shape => ({
      kind:        'line',
      key:         `warning-${i}`,
      x1:          line.FROM_X_UNITS,
      y1:          line.FROM_Y_UNITS,
      x2:          line.TO_X_UNITS,
      y2:          line.TO_Y_UNITS,
      stroke:      'alarm',
      strokeWidth: UNPLUGGED_WARNING.STROKE_UNITS,
      lineCap:     'round',
      opacity:     state.warningOpacity,
    })),
  ];
}

export const UNPLUGGED_SOCKET_PROP = propDefinition({
  name:   'unpluggedSocket',
  hidden: Object.freeze<UnpluggedState>({
    shown:          0,
    sceneOpacity:   0,
    plugX:          UNPLUGGED_SHAPE.PLUG_OUT_X_UNITS,
    plugY:          UNPLUGGED_SHAPE.PLUG_Y_UNITS,
    warningOpacity: 0,
    isConnected:    false,
    sparks:         Object.freeze(UNPLUGGED_SPARKS.ANGLES_DEGREES.map(() => Object.freeze({
      x: 0, y: 0, turnDegrees: 0, opacity: 0,
    }))),
    pulseAlong:   0,
    pulseOpacity: 0,
  }),
  layer:    'in-front-of-body',
  gripOf:   (state: UnpluggedState): Point => ({ x: state.plugX + UNPLUGGED_HAND.GRIP_OFFSET_X_UNITS, y: state.plugY + UNPLUGGED_HAND.GRIP_OFFSET_Y_UNITS }),
  shapesOf: (state: UnpluggedState) => ({
    opacity: state.shown,
    shapes:  [
      ...cableShapesOf(state),
      ...plugShapesOf({ x: state.plugX, y: state.plugY, opacity: state.sceneOpacity }),
      ...plateShapesOf(state),
      ...state.sparks.map((spark, i): Shape => SparkShapeUtil.smallSparkOf({ key: `spark-${i}`, ...spark })),
    ],
  }),
});
