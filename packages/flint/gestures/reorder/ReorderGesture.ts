/**
 * Implements `06-more-animations.md`, "Reorder": a pentagon takes the third card of a stack at its right end, pulls it out, lifts it while
 * the cards above it move down, and pushes it in on top. From the pull on, the hand is held to the card, so the two move as one part.
 */
import type { Point }                      from '../../SpriteGeometry.ts';
import type { HandPose, PosePart }         from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }           from '../../constants/BodyShape.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf } from '../GestureDefinition.ts';
import { GestureTimelineUtil }             from '../GestureTimelineUtil.ts';
import { movedCardGripOf }                 from './ReorderStackProp.ts';
import {
  REORDER_EYES,
  REORDER_HAND,
  REORDER_STACK,
  REORDER_TIMELINE
} from './constants/ReorderValues.ts';

const MOVED_CARD_REST_Y_UNITS = REORDER_STACK.CARD_Y_UNITS[REORDER_STACK.MOVED_CARD_INDEX] ?? 0;
const TOP_CARD_Y_UNITS = REORDER_STACK.CARD_Y_UNITS[0] ?? 0;

/** The top left corner of the moved card: out to the right, up above the stack, then in on top of it. */
function movedCardAt(timeInCycle: number): Point {
  const { progressBetween } = GestureTimelineUtil;
  const pulled = progressBetween(timeInCycle, REORDER_TIMELINE.PULL_STARTS_MILLISECONDS, REORDER_TIMELINE.LIFT_STARTS_MILLISECONDS);
  const lifted = progressBetween(timeInCycle, REORDER_TIMELINE.LIFT_STARTS_MILLISECONDS, REORDER_TIMELINE.PUSH_STARTS_MILLISECONDS);
  const pushed = progressBetween(timeInCycle, REORDER_TIMELINE.PUSH_STARTS_MILLISECONDS, REORDER_TIMELINE.PUSH_ENDS_MILLISECONDS);
  return {
    x: REORDER_STACK.CARD_X_UNITS + (REORDER_STACK.PULL_UNITS * (pulled - pushed)),
    y: MOVED_CARD_REST_Y_UNITS
      + ((REORDER_STACK.LIFTED_Y_UNITS - MOVED_CARD_REST_Y_UNITS) * lifted)
      + ((TOP_CARD_Y_UNITS - REORDER_STACK.LIFTED_Y_UNITS) * pushed),
  };
}

/** The hand reaches for the card's right end, then is held to the card until it is in on top. */
function handAt(timeInCycle: number, movedCard: Point): HandPose | null {
  if (timeInCycle < REORDER_TIMELINE.REACH_STARTS_MILLISECONDS || timeInCycle >= REORDER_TIMELINE.PUSH_ENDS_MILLISECONDS) return null;
  const grip = movedCardGripOf({ movedCardX: movedCard.x, movedCardY: movedCard.y });
  return {
    cornerCount: REORDER_HAND.CORNER_COUNT,
    centreX:     grip.x,
    centreY:     grip.y,
    radius:      REORDER_HAND.RADIUS_UNITS,
    turnDegrees: 0,
    placement:   timeInCycle < REORDER_TIMELINE.PULL_STARTS_MILLISECONDS ? 'eased' : { heldTo: 'reorderStack' },
  };
}

function reorderPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, REORDER_TIMELINE.CYCLE_MILLISECONDS);
  const movedCard = movedCardAt(timeInCycle);
  const lifted = GestureTimelineUtil.progressBetween(timeInCycle, REORDER_TIMELINE.LIFT_STARTS_MILLISECONDS, REORDER_TIMELINE.PUSH_STARTS_MILLISECONDS);
  const leaving = GestureTimelineUtil.progressBetween(timeInCycle, REORDER_TIMELINE.LEAVES_MILLISECONDS, REORDER_TIMELINE.CYCLE_MILLISECONDS);
  const isHappy = timeInCycle >= REORDER_TIMELINE.HAPPY_STARTS_MILLISECONDS && timeInCycle < REORDER_TIMELINE.LEAVES_MILLISECONDS;
  return {
    body: { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes: {
      shift:  EYE_SHAPE.SHIFT_AT_WORK_UNITS,
      height: REORDER_EYES.HEIGHT_UNITS,
      lift:   REORDER_EYES.HIGHEST_LIFT_UNITS * lifted,
      ...(isHappy ? { happiness: 1 } : {}),
    },
    nearHand: handAt(timeInCycle, movedCard),
    farHand:  null,
    props:    {
      reorderStack: {
        shown:          1,
        cycleOpacity:   Math.min(GestureTimelineUtil.progressBetween(timeInCycle, 0, REORDER_TIMELINE.FADE_IN_MILLISECONDS), 1 - leaving),
        movedCardX:     movedCard.x,
        movedCardY:     movedCard.y,
        cardsAboveDrop: REORDER_STACK.CARDS_ABOVE_DROP_UNITS * lifted,
      },
    },
  };
}

export const REORDER_GESTURE = gestureDefinition({
  name:                  'reorder',
  intents:               { reorder: singleFormOf(null, REORDER_TIMELINE.STILL_MOMENT_MILLISECONDS) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            reorderPartOf,
});
