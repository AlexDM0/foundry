/** The sparks of the shared vocabulary: the spark of a Watcher, and the small spark of an effect. */
import type { Point }                     from '../../SpriteGeometry.ts';
import type { FlintColourRole }           from '../../constants/Palette.ts';
import type { Shape, TransformStep }      from '../../drawing/Shape.ts';
import { AnimationCurveUtil }             from '../../utils/AnimationCurveUtil.ts';
import { SMALL_SPARK_SHAPE, SPARK_SHAPE } from './constants/SharedShapes.ts';

/** A live spark is orange with a light core; a dim one, not yet woken, is dark with no core; a dead one is grey with no core. */
export type SparkLook = 'live' | 'dim' | 'dead';

const SPARK_FILLS: Readonly<Record<SparkLook, FlintColourRole>> = Object.freeze({
  live: 'body',
  dim:  'emberDark',
  dead: 'paperEdge',
});

export interface SparkOptions {
  readonly key:          string;
  readonly centreX:      number;
  readonly centreY:      number;
  /** The default is the spark's own turn of 45 degrees. */
  readonly turnDegrees?: number;
  /** The default is a live spark. */
  readonly look?:        SparkLook;
  readonly opacity?:     number;
  /** Around the spark's centre, for its spring, its pulse or its death; 1 by default. */
  readonly scale?:       number;
}

/** Where a small spark is, as it flies: its point, its turn and its fade. */
export interface SmallSparkPlace {
  readonly x:           number;
  readonly y:           number;
  readonly turnDegrees: number;
  readonly opacity:     number;
}

/** A small spark that flies straight out from its origin; `flight` goes from 0 at the burst to 1 at the end of its flight. */
export interface SparkFlight {
  readonly origin:       Point;
  /** 0 is forward, negative is up. */
  readonly angleDegrees: number;
  readonly travelUnits:  number;
  readonly flight:       number;
}

export interface SmallSparkOptions extends SmallSparkPlace {
  readonly key:        string;
  /** The default is the small spark of the vocabulary; Merge keeps its own larger side, and a flame or a puff its own. */
  readonly sideUnits?: number;
  /** The default is the body colour: a flame's core is light, a puff of smoke grey. */
  readonly fill?:      FlintColourRole;
}

function scaledAroundCentre(options: SparkOptions): readonly TransformStep[] {
  const scale = options.scale ?? 1;
  if (scale === 1) return [];
  return [
    { translateX: options.centreX, translateY: options.centreY },
    { scaleX: scale, scaleY: scale },
    { translateX: -options.centreX, translateY: -options.centreY },
  ];
}

function squareOf(key: string, options: SparkOptions, sideUnits: number, fill: FlintColourRole): Shape {
  return {
    kind:      'rectangle',
    key,
    x:         options.centreX - (sideUnits / 2),
    y:         options.centreY - (sideUnits / 2),
    width:     sideUnits,
    height:    sideUnits,
    fill,
    ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
    transform: [...scaledAroundCentre(options), { rotateDegrees: options.turnDegrees ?? SPARK_SHAPE.TURN_DEGREES, aboutX: options.centreX, aboutY: options.centreY }],
  };
}

export const SparkShapeUtil = Object.freeze({
  sparkOf: (options: SparkOptions): readonly Shape[] => {
    const look = options.look ?? 'live';
    const outer = squareOf(options.key, options, SPARK_SHAPE.SIDE_UNITS, SPARK_FILLS[look]);
    return look === 'live' ? [outer, squareOf(`${options.key}-core`, options, SPARK_SHAPE.CORE_SIDE_UNITS, 'emberLight')] : [outer];
  },

  /** Where a small spark is on its flight: it flies straight out at its angle, turns half a turn and fades; unseen before and after. */
  flyingSparkPlaceOf: (sparkFlight: SparkFlight): SmallSparkPlace => {
    const flown = AnimationCurveUtil.clamp(sparkFlight.flight);
    const angle = AnimationCurveUtil.radiansOf(sparkFlight.angleDegrees);
    const isFlying = sparkFlight.flight > 0 && sparkFlight.flight < 1;
    return {
      x:           sparkFlight.origin.x + (Math.cos(angle) * sparkFlight.travelUnits * flown),
      y:           sparkFlight.origin.y + (Math.sin(angle) * sparkFlight.travelUnits * flown),
      turnDegrees: SMALL_SPARK_SHAPE.FLIGHT_TURN_DEGREES * flown,
      opacity:     isFlying ? 1 - sparkFlight.flight : 0,
    };
  },

  /** A square placed at its point and turned around it. */
  smallSparkOf: (options: SmallSparkOptions): Shape => {
    const sideUnits = options.sideUnits ?? SMALL_SPARK_SHAPE.SIDE_UNITS;
    return {
      kind:      'rectangle',
      key:       options.key,
      x:         -sideUnits / 2,
      y:         -sideUnits / 2,
      width:     sideUnits,
      height:    sideUnits,
      fill:      options.fill ?? 'body',
      opacity:   options.opacity,
      transform: [{ translateX: options.x, translateY: options.y }, { rotateDegrees: options.turnDegrees }],
    };
  },
});
