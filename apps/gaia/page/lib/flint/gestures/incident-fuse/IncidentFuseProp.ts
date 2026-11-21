/**
 * The props of Incident fuse (`06-more-animations.md`): the envelope of the shared vocabulary with a fuse from its top right corner, the
 * flame at the end of the part that has not burned, the smoke when the flame goes out, and the seal of the stamp on the envelope's seal.
 */
import type { Shape }         from '../../drawing/Shape.ts';
import { propDefinition }     from '../../props/PropDefinition.ts';
import { envelopeShapesOf }   from '../../props/shapes/EnvelopeShape.ts';
import { SparkShapeUtil }     from '../../props/shapes/SparkShapeUtil.ts';
import { AnimationCurveUtil } from '../../utils/AnimationCurveUtil.ts';
import { FusePathUtil }       from './FusePathUtil.ts';
import {
  FLAME_SHAPE,
  FUSE_SHAPE,
  INCIDENT_ENVELOPE,
  INCIDENT_STAMP,
} from './constants/IncidentFuseValues.ts';

export interface IncidentFuseState {
  readonly shown:         number;
  /** Multiplies the opacity: the fade of the props at the end of the cycle. */
  readonly cycleOpacity:  number;
  /** From 0, the whole fuse, to 1, burned down to the envelope. */
  readonly burn:          number;
  /** The flame's pulse; 0 is no flame. */
  readonly flameScale:    number;
  /** From 0 to 1 over the smoke's drift once the flame went out; 0 shows no smoke. */
  readonly smokeProgress: number;
  readonly sealShown:     boolean;
  /** The jolt of the stamp, down. */
  readonly offsetY:       number;
}

function flameShapesOf(state: IncidentFuseState): readonly Shape[] {
  const flame = FusePathUtil.flamePointOf(state.burn);
  const opacity = state.flameScale > 0 ? 1 : 0;
  const place = {
    x: flame.x, y: flame.y, turnDegrees: FLAME_SHAPE.TURN_DEGREES, opacity,
  };
  return [
    SparkShapeUtil.smallSparkOf({ key: 'flame', ...place, sideUnits: FLAME_SHAPE.SIDE_UNITS * state.flameScale }),
    SparkShapeUtil.smallSparkOf({
      key: 'flame-core', ...place, sideUnits: FLAME_SHAPE.CORE_SIDE_UNITS * state.flameScale, fill: 'emberLight',
    }),
  ];
}

/** The puffs drift apart from the envelope's corner, where the flame went out, and fade as they go. */
function smokeShapesOf(state: IncidentFuseState): readonly Shape[] {
  const isSmoking = state.smokeProgress > 0 && state.smokeProgress < 1;
  return FLAME_SHAPE.SMOKE_ANGLES_DEGREES.map((degrees, i): Shape => {
    const angle = AnimationCurveUtil.radiansOf(degrees);
    const drift = FLAME_SHAPE.SMOKE_DRIFT_UNITS * state.smokeProgress;
    return SparkShapeUtil.smallSparkOf({
      key:         `smoke-${i}`,
      x:           FUSE_SHAPE.START_X_UNITS + (drift * Math.cos(angle)),
      y:           FUSE_SHAPE.START_Y_UNITS + (drift * Math.sin(angle)),
      turnDegrees: FLAME_SHAPE.SMOKE_TURN_DEGREES,
      opacity:     isSmoking ? 1 - state.smokeProgress : 0,
      sideUnits:   FLAME_SHAPE.SMOKE_SIDE_UNITS,
      fill:        'thinking',
    });
  });
}

function sealShapeOf(state: IncidentFuseState): Shape {
  const half = INCIDENT_STAMP.SEAL_SIDE_UNITS / 2;
  return {
    kind:      'rectangle',
    key:       'seal',
    x:         INCIDENT_STAMP.SEAL_CENTRE_X_UNITS - half,
    y:         INCIDENT_STAMP.SEAL_CENTRE_Y_UNITS - half,
    width:     INCIDENT_STAMP.SEAL_SIDE_UNITS,
    height:    INCIDENT_STAMP.SEAL_SIDE_UNITS,
    fill:      'body',
    opacity:   state.sealShown ? 1 : 0,
    transform: [{ rotateDegrees: INCIDENT_STAMP.SEAL_TURN_DEGREES, aboutX: INCIDENT_STAMP.SEAL_CENTRE_X_UNITS, aboutY: INCIDENT_STAMP.SEAL_CENTRE_Y_UNITS }],
  };
}

export const INCIDENT_FUSE_PROP = propDefinition({
  name:   'incidentFuse',
  hidden: Object.freeze<IncidentFuseState>({
    shown: 0, cycleOpacity: 1, burn: 0, flameScale: 0, smokeProgress: 0, sealShown: false, offsetY: 0,
  }),
  layer:    'behind-body',
  shapesOf: (state: IncidentFuseState) => ({
    opacity:   state.shown * state.cycleOpacity,
    transform: [{ translateX: 0, translateY: state.offsetY }],
    shapes:    [
      {
        kind:        'path',
        key:         'fuse',
        pathData:    FusePathUtil.unburnedPathOf(state.burn),
        fill:        'none',
        stroke:      'graphite',
        strokeWidth: FUSE_SHAPE.STROKE_UNITS,
        lineCap:     'round',
        lineJoin:    'round',
        opacity:     state.burn < 1 ? 1 : 0,
      },
      ...envelopeShapesOf({ key: 'envelope', x: INCIDENT_ENVELOPE.X_UNITS, y: INCIDENT_ENVELOPE.Y_UNITS }),
      sealShapeOf(state),
      ...flameShapesOf(state),
      ...smokeShapesOf(state),
    ],
  }),
});
