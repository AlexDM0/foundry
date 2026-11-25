/**
 * Assistant intercept: an incident flies in as an envelope, two pentagons catch it, Flint pulls it
 * close, opens it and reads the paper inside. The outcome alternates by cycle: handled (the paper goes back, the envelope goes into Flint,
 * a tick and happy eyes) and passed up (the hand lifts the envelope, and it flies up and fades).
 */
import type { EyesPose, HandPose, PosePart } from '../../SpritePose.ts';
import { BODY_SHAPE }                        from '../../constants/BodyShape.ts';
import { ENVELOPE_SHAPE }                    from '../../props/shapes/constants/SharedShapes.ts';
import { AnimationCurveUtil }                from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }                 from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf }   from '../GestureDefinition.ts';
import { GestureTimelineUtil }               from '../GestureTimelineUtil.ts';
import type { InterceptEnvelopeState }       from './InterceptEnvelopeProp.ts';
import {
  INTERCEPT_BODY,
  INTERCEPT_ENVELOPE,
  INTERCEPT_EXTENT,
  INTERCEPT_EYES,
  INTERCEPT_HANDS,
  INTERCEPT_LETTER_SHAPE,
  INTERCEPT_TIMELINE,
} from './constants/InterceptValues.ts';

const { progressBetween } = GestureTimelineUtil;
const { interpolated } = AnimationCurveUtil;

export type InterceptOutcome = 'handled' | 'passed-up';

/** The first cycle is handled, the next passed up, and so on. */
export function interceptOutcomeOf(elapsedMilliseconds: number): InterceptOutcome {
  return Math.floor(elapsedMilliseconds / INTERCEPT_TIMELINE.CYCLE_MILLISECONDS) % 2 === 0 ? 'handled' : 'passed-up';
}

/** Where the envelope is, turned and how large, before the letter inside it opens; it fades in as it flies in, at the start of each cycle. */
function envelopePlaceAt(timeInCycle: number, outcome: InterceptOutcome): Pick<InterceptEnvelopeState, 'x' | 'y' | 'turnDegrees' | 'scale' | 'envelopeOpacity'> {
  const flight = progressBetween(timeInCycle, 0, INTERCEPT_TIMELINE.CATCH_MILLISECONDS);
  const pull = progressBetween(timeInCycle, INTERCEPT_TIMELINE.CATCH_MILLISECONDS, INTERCEPT_TIMELINE.PULLED_MILLISECONDS);
  const held = {
    x:               interpolated(interpolated(INTERCEPT_ENVELOPE.FLIGHT_START_X_UNITS, INTERCEPT_ENVELOPE.CATCH_X_UNITS, flight), INTERCEPT_ENVELOPE.HELD_X_UNITS, pull),
    y:               interpolated(interpolated(INTERCEPT_ENVELOPE.FLIGHT_START_Y_UNITS, INTERCEPT_ENVELOPE.CATCH_Y_UNITS, flight), INTERCEPT_ENVELOPE.HELD_Y_UNITS, pull),
    turnDegrees:     interpolated(INTERCEPT_ENVELOPE.FLIGHT_TURN_DEGREES, 0, pull),
    scale:           1,
    envelopeOpacity: progressBetween(timeInCycle, 0, INTERCEPT_TIMELINE.FADE_IN_MILLISECONDS),
  };
  if (outcome === 'handled') {
    const tuck = progressBetween(timeInCycle, INTERCEPT_TIMELINE.PAPER_BACK_MILLISECONDS, INTERCEPT_TIMELINE.TUCKED_MILLISECONDS);
    return {
      ...held, x: interpolated(held.x, INTERCEPT_ENVELOPE.TUCKED_X_UNITS, tuck), y: interpolated(held.y, INTERCEPT_ENVELOPE.TUCKED_Y_UNITS, tuck), scale: 1 - tuck,
    };
  }
  const lift = progressBetween(timeInCycle, INTERCEPT_TIMELINE.READING_ENDS_MILLISECONDS, INTERCEPT_TIMELINE.LIFTED_MILLISECONDS);
  const flyAway = progressBetween(timeInCycle, INTERCEPT_TIMELINE.LIFTED_MILLISECONDS, INTERCEPT_TIMELINE.OUTCOME_ENDS_MILLISECONDS);
  return {
    ...held,
    y:               interpolated(interpolated(held.y, INTERCEPT_ENVELOPE.LIFTED_Y_UNITS, lift), INTERCEPT_ENVELOPE.FLOWN_Y_UNITS, flyAway),
    envelopeOpacity: Math.min(held.envelopeOpacity, 1 - flyAway),
  };
}

function envelopeAt(timeInCycle: number, outcome: InterceptOutcome): InterceptEnvelopeState {
  const opening = progressBetween(timeInCycle, INTERCEPT_TIMELINE.PULLED_MILLISECONDS, INTERCEPT_TIMELINE.FLAP_OPEN_MILLISECONDS);
  const rising = progressBetween(timeInCycle, INTERCEPT_TIMELINE.FLAP_OPEN_MILLISECONDS, INTERCEPT_TIMELINE.PAPER_RISEN_MILLISECONDS);
  const goingBack = outcome === 'handled' ? progressBetween(timeInCycle, INTERCEPT_TIMELINE.READING_ENDS_MILLISECONDS, INTERCEPT_TIMELINE.PAPER_BACK_MILLISECONDS) : 0;
  const isTicked = outcome === 'handled' && timeInCycle >= INTERCEPT_TIMELINE.PAPER_BACK_MILLISECONDS;
  return {
    shown:       1,
    ...envelopePlaceAt(timeInCycle, outcome),
    flapDepth:   interpolated(INTERCEPT_LETTER_SHAPE.CLOSED_FLAP_DEPTH_UNITS, INTERCEPT_LETTER_SHAPE.OPEN_FLAP_DEPTH_UNITS, opening),
    paperRise:   INTERCEPT_LETTER_SHAPE.PAPER_RISE_UNITS * rising * (1 - goingBack),
    tickOpacity: isTicked ? 1 - progressBetween(timeInCycle, INTERCEPT_TIMELINE.OUTCOME_ENDS_MILLISECONDS, INTERCEPT_TIMELINE.CYCLE_MILLISECONDS) : 0,
  };
}

function pentagonOf(centreX: number, centreY: number, radius: number, placement: HandPose['placement']): HandPose {
  return {
    cornerCount: INTERCEPT_HANDS.CORNER_COUNT, centreX, centreY, radius, turnDegrees: 0, placement,
  };
}

/** The far hand at the envelope's upper right, the near hand coming in to its grip, both closing with the spread. */
function reachingHandsAt(timeInCycle: number, envelope: InterceptEnvelopeState): { readonly nearHand: HandPose; readonly farHand: HandPose } {
  const closing = progressBetween(timeInCycle, INTERCEPT_TIMELINE.REACH_STARTS_MILLISECONDS, INTERCEPT_TIMELINE.CATCH_MILLISECONDS);
  const spread = interpolated(INTERCEPT_HANDS.OPEN_SPREAD_UNITS, INTERCEPT_HANDS.CLOSED_SPREAD_UNITS, closing);
  const centreX = envelope.x + (ENVELOPE_SHAPE.WIDTH_UNITS / 2);
  const centreY = envelope.y + (ENVELOPE_SHAPE.HEIGHT_UNITS / 2);
  const approach = spread - INTERCEPT_HANDS.CLOSED_SPREAD_UNITS;
  return {
    nearHand: pentagonOf(
      envelope.x + INTERCEPT_HANDS.GRIP_FROM_CORNER_X_UNITS - (approach * INTERCEPT_HANDS.SPREAD_X),
      envelope.y + INTERCEPT_HANDS.GRIP_FROM_CORNER_Y_UNITS + (approach * INTERCEPT_HANDS.SPREAD_Y),
      INTERCEPT_HANDS.NEAR_RADIUS_UNITS,
      'eased',
    ),
    farHand: pentagonOf(centreX + (spread * INTERCEPT_HANDS.SPREAD_X), centreY - (spread * INTERCEPT_HANDS.SPREAD_Y), INTERCEPT_HANDS.FAR_RADIUS_UNITS, 'eased'),
  };
}

/** Once caught, the near hand holds the envelope until it lets it go; then it stays where it let go, until the hand goes away. */
function holdingHandsAt(timeInCycle: number, envelope: InterceptEnvelopeState, outcome: InterceptOutcome): Pick<PosePart, 'nearHand' | 'farHand'> {
  const lettingGoMilliseconds = outcome === 'handled' ? INTERCEPT_TIMELINE.PAPER_BACK_MILLISECONDS : INTERCEPT_TIMELINE.LIFTED_MILLISECONDS;
  const lastHeld = envelopeAt(lettingGoMilliseconds, outcome);
  const nearHand = timeInCycle < lettingGoMilliseconds
    ? pentagonOf(0, 0, INTERCEPT_HANDS.NEAR_RADIUS_UNITS, { heldTo: 'interceptEnvelope' })
    : pentagonOf(lastHeld.x + INTERCEPT_HANDS.GRIP_FROM_CORNER_X_UNITS, lastHeld.y + INTERCEPT_HANDS.GRIP_FROM_CORNER_Y_UNITS, INTERCEPT_HANDS.NEAR_RADIUS_UNITS, 'eased');
  const isFarHandHolding = timeInCycle < INTERCEPT_TIMELINE.FAR_HAND_LEAVES_MILLISECONDS;
  return {
    nearHand,
    farHand: isFarHandHolding ? reachingHandsAt(timeInCycle, envelope).farHand : null,
  };
}

function eyesAt(timeInCycle: number, elapsedMilliseconds: number, outcome: InterceptOutcome): Partial<EyesPose> {
  if (timeInCycle < INTERCEPT_TIMELINE.REACH_STARTS_MILLISECONDS) return {};
  if (timeInCycle < INTERCEPT_TIMELINE.PULLED_MILLISECONDS) return { height: INTERCEPT_EYES.CATCHING_HEIGHT_UNITS };
  if (timeInCycle < INTERCEPT_TIMELINE.READING_ENDS_MILLISECONDS) {
    return {
      height: INTERCEPT_EYES.READING_HEIGHT_UNITS,
      lift:   INTERCEPT_EYES.READING_LIFT_UNITS,
      shift:  INTERCEPT_EYES.READING_SHIFT_UNITS + Math.sin(elapsedMilliseconds / INTERCEPT_EYES.READING_SHIFT_DIVISOR_MILLISECONDS),
    };
  }
  if (timeInCycle >= INTERCEPT_TIMELINE.OUTCOME_ENDS_MILLISECONDS) return {};
  if (outcome === 'passed-up') return { lift: INTERCEPT_EYES.PASSED_UP_LIFT_UNITS };
  return timeInCycle >= INTERCEPT_TIMELINE.PAPER_BACK_MILLISECONDS ? { happiness: 1 } : {};
}

function interceptPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, INTERCEPT_TIMELINE.CYCLE_MILLISECONDS);
  const outcome = interceptOutcomeOf(input.elapsedMilliseconds);
  const envelope = envelopeAt(timeInCycle, outcome);
  const isWorking = timeInCycle >= INTERCEPT_TIMELINE.REACH_STARTS_MILLISECONDS && timeInCycle < INTERCEPT_TIMELINE.OUTCOME_ENDS_MILLISECONDS;
  const isCaught = timeInCycle >= INTERCEPT_TIMELINE.CATCH_MILLISECONDS;
  const hands = !isWorking ? { nearHand: null, farHand: null } : isCaught ? holdingHandsAt(timeInCycle, envelope, outcome) : reachingHandsAt(timeInCycle, envelope);
  const hop = progressBetween(timeInCycle, INTERCEPT_TIMELINE.CATCH_MILLISECONDS, INTERCEPT_TIMELINE.CATCH_MILLISECONDS + INTERCEPT_TIMELINE.HOP_MILLISECONDS);
  return {
    body: {
      ...(isWorking ? { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES } : {}),
      ...(hop > 0 && hop < 1 ? { addedLift: INTERCEPT_BODY.HOP_UNITS * Math.sin(Math.PI * hop) } : {}),
    },
    eyes:  eyesAt(timeInCycle, input.elapsedMilliseconds, outcome),
    ...hands,
    props: { interceptEnvelope: envelope },
  };
}

export const INTERCEPT_GESTURE = gestureDefinition({
  name:                  'intercept',
  intents:               { intercept: singleFormOf(null, INTERCEPT_TIMELINE.STILL_MOMENT_MILLISECONDS, INTERCEPT_EXTENT) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            interceptPartOf,
});
