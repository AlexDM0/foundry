/**
 * Implements `06-more-animations.md`, "Airlock": one block at a time passes. The left door opens, the front block enters the chamber and
 * the queue moves up, the door closes, one hexagon turns the chamber and the block lands, the right door opens, the block goes onto the
 * main line, and while it fades a new block joins the back of the queue. The props fade in only at the very start, so the loop runs on
 * without a break.
 */
import type { PosePart }                   from '../../SpritePose.ts';
import { BODY_SHAPE }                      from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                      from '../../constants/HandShape.ts';
import { AnimationCurveUtil }              from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import type { AirlockChamberState }        from './AirlockChamberProp.ts';
import {
  AIRLOCK_EYES,
  AIRLOCK_HAND,
  AIRLOCK_SHAPE,
  AIRLOCK_TIMELINE
} from './constants/AirlockValues.ts';

const { progressBetween } = GestureTimelineUtil;
const { interpolated } = AnimationCurveUtil;


function chamberAt(elapsedMilliseconds: number, timeInCycle: number): AirlockChamberState {
  const at = (start: number, end: number): number => progressBetween(timeInCycle, start, end);
  const entering = at(AIRLOCK_TIMELINE.LEFT_DOOR_OPEN_MILLISECONDS, AIRLOCK_TIMELINE.ENTERED_MILLISECONDS);
  const leaving = at(AIRLOCK_TIMELINE.RIGHT_DOOR_OPEN_MILLISECONDS, AIRLOCK_TIMELINE.ON_MAIN_LINE_MILLISECONDS);
  const fading = at(AIRLOCK_TIMELINE.RIGHT_DOOR_CLOSED_MILLISECONDS, AIRLOCK_TIMELINE.CYCLE_MILLISECONDS);
  const isLeaving = timeInCycle >= AIRLOCK_TIMELINE.RIGHT_DOOR_OPEN_MILLISECONDS;
  return {
    shown:        1,
    introOpacity: progressBetween(elapsedMilliseconds, 0, AIRLOCK_TIMELINE.FADE_IN_MILLISECONDS),
    doorOpenings: [
      at(AIRLOCK_TIMELINE.LEFT_DOOR_OPENS_MILLISECONDS, AIRLOCK_TIMELINE.LEFT_DOOR_OPEN_MILLISECONDS)
        - at(AIRLOCK_TIMELINE.ENTERED_MILLISECONDS, AIRLOCK_TIMELINE.LEFT_DOOR_CLOSED_MILLISECONDS),
      at(AIRLOCK_TIMELINE.TURN_ENDS_MILLISECONDS, AIRLOCK_TIMELINE.RIGHT_DOOR_OPEN_MILLISECONDS)
        - at(AIRLOCK_TIMELINE.RIGHT_DOOR_CLOSES_MILLISECONDS, AIRLOCK_TIMELINE.RIGHT_DOOR_CLOSED_MILLISECONDS),
    ],
    queueDrop:       AIRLOCK_SHAPE.QUEUE_STEP_UNITS * entering,
    newcomerOpacity: fading,
    travellerX:      isLeaving
      ? interpolated(AIRLOCK_SHAPE.CHAMBER_PLACE_X_UNITS, AIRLOCK_SHAPE.MAIN_LINE_PLACE_X_UNITS, leaving)
      : interpolated(AIRLOCK_SHAPE.QUEUE_X_UNITS, AIRLOCK_SHAPE.CHAMBER_PLACE_X_UNITS, entering),
    travellerY: isLeaving
      ? interpolated(AIRLOCK_SHAPE.CHAMBER_PLACE_Y_UNITS, AIRLOCK_SHAPE.MAIN_LINE_PLACE_Y_UNITS, leaving)
      : interpolated(AIRLOCK_SHAPE.QUEUE_FRONT_Y_UNITS, AIRLOCK_SHAPE.CHAMBER_PLACE_Y_UNITS, entering),
    travellerLanded:  at(AIRLOCK_TIMELINE.LEFT_DOOR_CLOSED_MILLISECONDS, AIRLOCK_TIMELINE.TURN_ENDS_MILLISECONDS),
    travellerOpacity: 1 - fading,
  };
}

function airlockPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, AIRLOCK_TIMELINE.CYCLE_MILLISECONDS);
  const chamber = chamberAt(input.elapsedMilliseconds, timeInCycle);
  const isHandAtChamber = timeInCycle >= AIRLOCK_TIMELINE.LEFT_DOOR_CLOSED_MILLISECONDS && timeInCycle < AIRLOCK_TIMELINE.ON_MAIN_LINE_MILLISECONDS;
  const isHappy = timeInCycle >= AIRLOCK_TIMELINE.ON_MAIN_LINE_MILLISECONDS && timeInCycle < AIRLOCK_TIMELINE.HAPPY_EYES_END_MILLISECONDS;
  const travelled = (chamber.travellerX - AIRLOCK_SHAPE.QUEUE_X_UNITS) / (AIRLOCK_SHAPE.MAIN_LINE_PLACE_X_UNITS - AIRLOCK_SHAPE.QUEUE_X_UNITS);
  const turn = progressBetween(timeInCycle, AIRLOCK_TIMELINE.LEFT_DOOR_CLOSED_MILLISECONDS, AIRLOCK_TIMELINE.TURN_ENDS_MILLISECONDS);
  return {
    body: { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes: {
      shift:  interpolated(AIRLOCK_EYES.FIRST_SHIFT_UNITS, AIRLOCK_EYES.LAST_SHIFT_UNITS, travelled),
      height: AIRLOCK_EYES.HEIGHT_UNITS,
      ...(isHappy ? { happiness: 1 } : {}),
    },
    nearHand: isHandAtChamber
      ? {
        cornerCount: HAND_SHAPE.FASTENING_CORNER_COUNT,
        centreX:     AIRLOCK_HAND.CENTRE_X_UNITS,
        centreY:     AIRLOCK_HAND.CENTRE_Y_UNITS,
        radius:      AIRLOCK_HAND.RADIUS_UNITS,
        turnDegrees: AIRLOCK_HAND.TURN_DEGREES * turn,
        placement:   'eased',
      }
      : null,
    farHand: null,
    props:   { airlockChamber: chamber },
  };
}

export const AIRLOCK_GESTURE = gestureDefinition({
  name:                  'airlock',
  intents:               { airlock: singleFormOf(null, AIRLOCK_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            airlockPartOf,
});
