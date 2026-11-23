/**
 * Unplugged: the event stream is down. Flint holds the loose plug, looks at it and at the blinking
 * socket, changes its pentagon to a hexagon and pushes the plug in, placed exactly; sparks fly, the slots turn green, and pulses of the
 * stream run down the cable. The hand is held to the plug, so the two move as one part.
 */
import type { EyesPose, PosePart }         from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }           from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                      from '../../constants/HandShape.ts';
import { SparkShapeUtil }                  from '../../props/shapes/SparkShapeUtil.ts';
import type { SmallSparkPlace }            from '../../props/shapes/SparkShapeUtil.ts';
import { AnimationCurveUtil }              from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import type { UnpluggedState }             from './UnpluggedSocketProp.ts';
import {
  UNPLUGGED_EYES,
  UNPLUGGED_HAND,
  UNPLUGGED_SHAPE,
  UNPLUGGED_SPARKS,
  UNPLUGGED_TIMELINE,
} from './constants/UnpluggedValues.ts';

const { progressBetween } = GestureTimelineUtil;

function sparksAt(timeInCycle: number): readonly SmallSparkPlace[] {
  const flight = (timeInCycle - UNPLUGGED_TIMELINE.PLUGGED_IN_MILLISECONDS) / UNPLUGGED_SPARKS.FLIGHT_MILLISECONDS;
  return UNPLUGGED_SPARKS.ANGLES_DEGREES.map((angleDegrees) => SparkShapeUtil.flyingSparkPlaceOf({
    origin: { x: UNPLUGGED_SPARKS.FROM_X_UNITS, y: UNPLUGGED_SPARKS.FROM_Y_UNITS }, angleDegrees, travelUnits: UNPLUGGED_SPARKS.TRAVEL_UNITS, flight,
  }));
}

function unpluggedStateAt(timeInCycle: number): UnpluggedState {
  const sceneOpacity = Math.min(
    progressBetween(timeInCycle, 0, UNPLUGGED_TIMELINE.FADE_IN_MILLISECONDS),
    1 - progressBetween(timeInCycle, UNPLUGGED_TIMELINE.STREAM_ENDS_MILLISECONDS, UNPLUGGED_TIMELINE.CYCLE_MILLISECONDS),
  );
  const pushed = progressBetween(timeInCycle, UNPLUGGED_TIMELINE.PUSH_STARTS_MILLISECONDS, UNPLUGGED_TIMELINE.PLUGGED_IN_MILLISECONDS);
  const isConnected = timeInCycle >= UNPLUGGED_TIMELINE.PLUGGED_IN_MILLISECONDS;
  const isWarningOn = !isConnected && Math.floor(timeInCycle / UNPLUGGED_TIMELINE.WARNING_BLINK_MILLISECONDS) % 2 === 0;
  const isStreaming = isConnected && timeInCycle < UNPLUGGED_TIMELINE.STREAM_ENDS_MILLISECONDS;
  return {
    shown:          1,
    sceneOpacity,
    plugX:          UNPLUGGED_SHAPE.PLUG_OUT_X_UNITS + ((UNPLUGGED_SHAPE.PLUG_IN_X_UNITS - UNPLUGGED_SHAPE.PLUG_OUT_X_UNITS) * pushed),
    plugY:          UNPLUGGED_SHAPE.PLUG_Y_UNITS,
    warningOpacity: isWarningOn ? sceneOpacity : 0,
    isConnected,
    sparks:         sparksAt(timeInCycle),
    pulseAlong:     isStreaming ? AnimationCurveUtil.cycleProgressOf(timeInCycle - UNPLUGGED_TIMELINE.PLUGGED_IN_MILLISECONDS, UNPLUGGED_TIMELINE.PULSE_MILLISECONDS) : 0,
    pulseOpacity:   isStreaming ? sceneOpacity : 0,
  };
}

function eyesAt(timeInCycle: number): Partial<EyesPose> {
  if (timeInCycle >= UNPLUGGED_TIMELINE.HAPPY_EYES_FROM_MILLISECONDS) return { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, happiness: 1 };
  if (timeInCycle >= UNPLUGGED_TIMELINE.PLUGGED_IN_MILLISECONDS) return { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: UNPLUGGED_EYES.PLUGGED_IN_HEIGHT_UNITS };
  const atPlug = { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: UNPLUGGED_EYES.HEIGHT_UNITS, lift: UNPLUGGED_EYES.AT_PLUG_LIFT_UNITS };
  if (timeInCycle < UNPLUGGED_TIMELINE.LOOKS_AT_PLUG_MILLISECONDS || timeInCycle >= UNPLUGGED_TIMELINE.HAND_CHANGES_MILLISECONDS) return atPlug;
  const worried = { ...atPlug, rightHeightOverride: UNPLUGGED_EYES.RIGHT_HEIGHT_UNITS };
  if (timeInCycle < UNPLUGGED_TIMELINE.LOOKS_AT_SOCKET_MILLISECONDS) return worried;
  return { ...worried, shift: UNPLUGGED_EYES.AT_SOCKET_SHIFT_UNITS, lift: UNPLUGGED_EYES.AT_SOCKET_LIFT_UNITS };
}

function unpluggedPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, UNPLUGGED_TIMELINE.CYCLE_MILLISECONDS);
  const isPushing = timeInCycle >= UNPLUGGED_TIMELINE.HAND_CHANGES_MILLISECONDS;
  return {
    body:     { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes:     eyesAt(timeInCycle),
    nearHand: timeInCycle < UNPLUGGED_TIMELINE.PLUGGED_IN_MILLISECONDS
      ? {
        cornerCount: isPushing ? HAND_SHAPE.FASTENING_CORNER_COUNT : HAND_SHAPE.GRABBING_CORNER_COUNT,
        centreX:     0,
        centreY:     0,
        radius:      UNPLUGGED_HAND.RADIUS_UNITS,
        turnDegrees: 0,
        placement:   { heldTo: 'unpluggedSocket' },
      }
      : null,
    farHand: null,
    props:   { unpluggedSocket: unpluggedStateAt(timeInCycle) },
  };
}

export const UNPLUGGED_GESTURE = gestureDefinition({
  name:                  'unplugged',
  intents:               { unplugged: singleFormOf(null, UNPLUGGED_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            unpluggedPartOf,
});
