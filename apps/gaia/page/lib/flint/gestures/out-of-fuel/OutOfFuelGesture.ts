/**
 * Out of fuel: a steady pose in which Flint, cooled and landed but awake, watches an empty gauge;
 * and its variant Refuel, one action that starts from that pose, fills the gauge and ends in a flare.
 */
import type { EyesPose, PosePart } from '../../SpritePose.ts';
import { EASING_RATES_PER_SECOND } from '../../constants/Easing.ts';
import { BLINK }                   from '../../constants/Motion.ts';
import type { SmallSparkPlace }    from '../../props/shapes/SparkShapeUtil.ts';
import type { GestureInput }       from '../GestureDefinition.ts';
import { gestureDefinition }       from '../GestureDefinition.ts';
import { GestureTimelineUtil }     from '../GestureTimelineUtil.ts';
import { snapSparksAt }            from '../SnapSparks.ts';
import type { FuelGaugeState }     from './FuelGaugeProp.ts';
import {
  EMPTY_GAUGE,
  OUT_OF_FUEL,
  REFUEL,
  REFUEL_SPARKS,
} from './constants/OutOfFuelValues.ts';

type OutOfFuelVariant = 'normal' | 'refuel';

const { progressBetween, timeInCycleOf } = GestureTimelineUtil;

/** The slow blink closes the eyes and opens them again; the look at the user comes each few seconds. */
function waitingEyesAt(elapsedMilliseconds: number): Partial<EyesPose> {
  const blinkStart = OUT_OF_FUEL.BLINK_INTERVAL_MILLISECONDS - OUT_OF_FUEL.BLINK_MILLISECONDS;
  const blink = progressBetween(timeInCycleOf(elapsedMilliseconds, OUT_OF_FUEL.BLINK_INTERVAL_MILLISECONDS), blinkStart, OUT_OF_FUEL.BLINK_INTERVAL_MILLISECONDS);
  const lookStart = OUT_OF_FUEL.LOOK_AT_USER_INTERVAL_MILLISECONDS - OUT_OF_FUEL.LOOK_AT_USER_MILLISECONDS;
  const looksAtUser = timeInCycleOf(elapsedMilliseconds, OUT_OF_FUEL.LOOK_AT_USER_INTERVAL_MILLISECONDS) >= lookStart;
  const openHeight = looksAtUser ? OUT_OF_FUEL.LOOK_AT_USER_EYE_HEIGHT_UNITS : OUT_OF_FUEL.EYE_HEIGHT_UNITS;
  const closing = Math.sin(Math.PI * blink);
  return {
    height: openHeight - ((openHeight - BLINK.CLOSED_HEIGHT_UNITS) * closing),
    lift:   OUT_OF_FUEL.EYE_LIFT_UNITS,
    shift:  looksAtUser ? OUT_OF_FUEL.LOOK_AT_USER_EYE_SHIFT_UNITS : OUT_OF_FUEL.EYE_SHIFT_UNITS,
  };
}

function emptyGaugeAt(elapsedMilliseconds: number): FuelGaugeState {
  const isDim = Math.floor(elapsedMilliseconds / EMPTY_GAUGE.LEVEL_BLINK_MILLISECONDS) % 2 === 1;
  return {
    shown:        1,
    level:        EMPTY_GAUGE.LEVEL,
    levelColour:  'alarm',
    levelOpacity: isDim ? EMPTY_GAUGE.DIM_LEVEL_OPACITY : EMPTY_GAUGE.BRIGHT_LEVEL_OPACITY,
    fade:         1,
  };
}

function outOfFuelPartOf(elapsedMilliseconds: number): PosePart {
  return {
    body: {
      tint:         { role: 'emberDark', amount: OUT_OF_FUEL.TINT_AMOUNT, ratePerSecond: EASING_RATES_PER_SECOND.FALLING_ASLEEP },
      hover:        OUT_OF_FUEL.HOVER_UNITS,
      leanDegrees:  OUT_OF_FUEL.LEAN_DEGREES,
      heightFactor: 1 - (OUT_OF_FUEL.SAG_HEIGHT_FACTOR * Math.sin(elapsedMilliseconds / OUT_OF_FUEL.SAG_DIVISOR_MILLISECONDS)),
    },
    eyes:     waitingEyesAt(elapsedMilliseconds),
    nearHand: null,
    farHand:  null,
    props:    { fuelGauge: emptyGaugeAt(elapsedMilliseconds) },
    sleep:    { glowOpacity: 0 },
  };
}

const REFUEL_SPARKS_CENTRE = Object.freeze({ x: REFUEL_SPARKS.CENTRE_X_UNITS, y: REFUEL_SPARKS.CENTRE_Y_UNITS });

/** The sparks of Merge's snap, from the body centre, with a longer travel. */
function flareSparksAt(elapsedMilliseconds: number): SmallSparkPlace[] {
  return snapSparksAt(elapsedMilliseconds - REFUEL.FLARE_MILLISECONDS, REFUEL_SPARKS_CENTRE, REFUEL_SPARKS.TRAVEL_FACTOR);
}

function refuelEyesAt(elapsedMilliseconds: number): Partial<EyesPose> {
  if (elapsedMilliseconds >= REFUEL.HAPPY_EYES_MILLISECONDS) return { happiness: 1 };
  if (elapsedMilliseconds >= REFUEL.FLARE_MILLISECONDS) return { height: REFUEL.FLARE_EYE_HEIGHT_UNITS };
  return { height: OUT_OF_FUEL.EYE_HEIGHT_UNITS, lift: OUT_OF_FUEL.EYE_LIFT_UNITS, shift: OUT_OF_FUEL.EYE_SHIFT_UNITS };
}

function refuelPartOf(elapsedMilliseconds: number): PosePart {
  const filled = progressBetween(elapsedMilliseconds, 0, REFUEL.FILLED_MILLISECONDS);
  const hasFlared = elapsedMilliseconds >= REFUEL.FLARE_MILLISECONDS;
  const sinceFlare = elapsedMilliseconds - REFUEL.FLARE_MILLISECONDS;
  const hop = progressBetween(sinceFlare, 0, REFUEL.HOP_MILLISECONDS);
  const isSwollen = hasFlared && sinceFlare < REFUEL.SWELL_MILLISECONDS;
  const glow = hasFlared ? REFUEL.FLARE_GLOW_OPACITY * (1 - progressBetween(elapsedMilliseconds, REFUEL.FLARE_MILLISECONDS, REFUEL.GLOW_OUT_MILLISECONDS)) : 0;
  const level = EMPTY_GAUGE.LEVEL + ((REFUEL.FULL_LEVEL - EMPTY_GAUGE.LEVEL) * filled);
  return {
    body: {
      tint: { role: 'emberDark', amount: 0, ratePerSecond: EASING_RATES_PER_SECOND.BODY },
      ...(hasFlared
        ? { addedLift: hop < 1 ? REFUEL.HOP_UNITS * Math.sin(Math.PI * hop) : 0 }
        : { hover: OUT_OF_FUEL.HOVER_UNITS, leanDegrees: OUT_OF_FUEL.LEAN_DEGREES }),
      ...(isSwollen ? { widthFactor: REFUEL.SWELL_FACTOR, heightFactor: REFUEL.SWELL_FACTOR } : {}),
    },
    eyes:     refuelEyesAt(elapsedMilliseconds),
    nearHand: null,
    farHand:  null,
    props:    {
      fuelGauge: {
        shown:        1,
        level,
        levelColour:  filled >= 1 ? 'done' : 'body',
        levelOpacity: 1,
        fade:         1 - progressBetween(elapsedMilliseconds, REFUEL.GAUGE_FADES_MILLISECONDS, REFUEL.DURATION_MILLISECONDS),
      },
      refuelSparks: { shown: 1, sparks: flareSparksAt(elapsedMilliseconds) },
    },
    sleep: { glowOpacity: glow },
  };
}

export const OUT_OF_FUEL_GESTURE = gestureDefinition({
  name:    'out-of-fuel',
  intents: {
    'out-of-fuel': { variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: OUT_OF_FUEL.STILL_MOMENT_MILLISECONDS },
    'refuel':      { variant: 'refuel', durationMilliseconds: REFUEL.DURATION_MILLISECONDS, stillMomentMilliseconds: REFUEL.STILL_MOMENT_MILLISECONDS },
  },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            (input: GestureInput<OutOfFuelVariant>) => (input.variant === 'refuel'
    ? refuelPartOf(input.elapsedMilliseconds)
    : outOfFuelPartOf(input.elapsedMilliseconds)),
});
