/**
 * Forced stop: a pentagon goes to the plug and pulls it out of its socket, the cable goes slack, two
 * small sparks fly from the socket, and the spark the plug fed dies. From the pull the hand and the plug move as one, set exactly. No
 * happy eyes.
 */
import type { EyesPose, HandPose, PosePart } from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }             from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                        from '../../constants/HandShape.ts';
import type { GestureInput }                 from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf }   from '../GestureDefinition.ts';
import { GestureTimelineUtil }               from '../GestureTimelineUtil.ts';
import {
  DEATH_EYES,
  FED_SPARK,
  FORCED_STOP,
  LOOK_AT_PLUG,
  PLUG,
  PULL,
  SOCKET_SPARKS
} from './constants/ForcedStopValues.ts';

const { progressBetween } = GestureTimelineUtil;

function plugPlaceAt(elapsedMilliseconds: number): { readonly x: number; readonly y: number } {
  const pulled = progressBetween(elapsedMilliseconds, PULL.STARTS_MILLISECONDS, PULL.ENDS_MILLISECONDS);
  return { x: PLUG.IN_X_UNITS + ((PLUG.OUT_X_UNITS - PLUG.IN_X_UNITS) * pulled), y: PLUG.IN_Y_UNITS + ((PLUG.OUT_Y_UNITS - PLUG.IN_Y_UNITS) * pulled) };
}

/** Before the pull the hand eases to the plug's grip; from the pull it sits on the grip of the moving plug, set exactly. */
function handAt(elapsedMilliseconds: number): HandPose | null {
  if (elapsedMilliseconds < PULL.REACH_STARTS_MILLISECONDS || elapsedMilliseconds >= FORCED_STOP.FADE_OUT_STARTS_MILLISECONDS) return null;
  const plug = plugPlaceAt(elapsedMilliseconds);
  return {
    cornerCount: HAND_SHAPE.GRABBING_CORNER_COUNT,
    centreX:     plug.x + PLUG.GRIP_OFFSET_X_UNITS,
    centreY:     plug.y + PLUG.GRIP_OFFSET_Y_UNITS,
    radius:      PULL.HAND_RADIUS_UNITS,
    turnDegrees: 0,
    placement:   elapsedMilliseconds >= PULL.STARTS_MILLISECONDS ? 'exact-position' : 'eased',
  };
}

function eyesAt(elapsedMilliseconds: number): Partial<EyesPose> {
  const working = { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS };
  if (elapsedMilliseconds >= LOOK_AT_PLUG.STARTS_MILLISECONDS) return { ...working, height: DEATH_EYES.HEIGHT_UNITS, lift: LOOK_AT_PLUG.EYE_LIFT_UNITS };
  if (elapsedMilliseconds >= FED_SPARK.DIES_MILLISECONDS) return { ...working, height: DEATH_EYES.HEIGHT_UNITS, lift: DEATH_EYES.LIFT_UNITS };
  if (elapsedMilliseconds >= PULL.REACH_STARTS_MILLISECONDS) return { ...working, lift: PULL.REACH_EYE_LIFT_UNITS };
  return working;
}

function forcedStopPartOf(input: GestureInput): PosePart {
  const { elapsedMilliseconds } = input;
  const fade = Math.min(
    progressBetween(elapsedMilliseconds, 0, FORCED_STOP.FADE_IN_ENDS_MILLISECONDS),
    1 - progressBetween(elapsedMilliseconds, FORCED_STOP.FADE_OUT_STARTS_MILLISECONDS, FORCED_STOP.DURATION_MILLISECONDS),
  );
  const plug = plugPlaceAt(elapsedMilliseconds);
  const death = progressBetween(elapsedMilliseconds, FED_SPARK.DIES_MILLISECONDS, FED_SPARK.DEAD_MILLISECONDS);
  const bob = FED_SPARK.BOB_UNITS * Math.sin(elapsedMilliseconds / FED_SPARK.BOB_DIVISOR_MILLISECONDS);
  return {
    body:     { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes:     eyesAt(elapsedMilliseconds),
    nearHand: handAt(elapsedMilliseconds),
    farHand:  null,
    props:    {
      forcedStopPlug: {
        shown:             1,
        plugX:             plug.x,
        plugY:             plug.y,
        cableSlack:        progressBetween(elapsedMilliseconds, PULL.STARTS_MILLISECONDS, PULL.ENDS_MILLISECONDS),
        socketSparkFlight: (elapsedMilliseconds - PULL.STARTS_MILLISECONDS) / SOCKET_SPARKS.FLIGHT_MILLISECONDS,
        fade,
      },
      dyingSpark: {
        shown: 1, offsetY: bob + (FED_SPARK.FALL_UNITS * death), death, fade,
      },
    },
  };
}

export const FORCED_STOP_GESTURE = gestureDefinition({
  name:                  'forced-stop',
  intents:               { 'forced-stop': singleFormOf(FORCED_STOP.DURATION_MILLISECONDS, FORCED_STOP.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            forcedStopPartOf,
});
