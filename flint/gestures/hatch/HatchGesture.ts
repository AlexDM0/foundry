/**
 * Implements `06-more-animations.md`, "Hatch": Flint pushes a note through a slot in a wall and thinks while it waits. In the `normal`
 * variant a reply comes out, the hand takes it, Flint reads it and is happy; in the `queued` variant no reply comes, and Flint shrugs with
 * a stub in its hand and the sweat drop. The thinking dots are the Thinking emote's mark, and the sweat drop is the Sweatdrop emote's.
 */
import type {
  EmoteMarkPose,
  EyesPose,
  HandPose,
  PosePart,
} from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }                from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                           from '../../constants/HandShape.ts';
import type { GestureInput }                    from '../GestureDefinition.ts';
import { gestureDefinition }                    from '../GestureDefinition.ts';
import { GestureMarkUtil }                      from '../GestureMarkUtil.ts';
import { GestureTimelineUtil }                  from '../GestureTimelineUtil.ts';
import type { HatchPaperState, HatchWallState } from './HatchWallProp.ts';
import {
  HATCH_FACE,
  HATCH_HAND,
  HATCH_SHAPE,
  HATCH_TIMELINE,
} from './constants/HatchValues.ts';

type HatchVariant = 'normal' | 'queued';

const { progressBetween } = GestureTimelineUtil;

/** The thinking dots wait for the reply: until it comes, or, when none comes, until the shrug. */
function thinkingEndsFor(variant: HatchVariant): number {
  return variant === 'normal' ? HATCH_TIMELINE.REPLY_STARTS_MILLISECONDS : HATCH_TIMELINE.QUEUED_SHRUG_MILLISECONDS;
}

/** The hand holds the note out, pushes it in along a path set exactly so the note moves with it, then waits and takes the reply. */
function handAt(timeInCycle: number, variant: HatchVariant): HandPose | null {
  if (timeInCycle >= HATCH_TIMELINE.FADE_OUT_STARTS_MILLISECONDS) return null;
  const pentagon = { cornerCount: HAND_SHAPE.GRABBING_CORNER_COUNT, radius: HATCH_HAND.RADIUS_UNITS, turnDegrees: 0 } as const;
  const isPushing = timeInCycle >= HATCH_TIMELINE.PUSH_STARTS_MILLISECONDS && timeInCycle < HATCH_TIMELINE.PUSHED_MILLISECONDS;
  if (timeInCycle < HATCH_TIMELINE.PUSHED_MILLISECONDS) {
    const pushed = progressBetween(timeInCycle, HATCH_TIMELINE.PUSH_STARTS_MILLISECONDS, HATCH_TIMELINE.PUSHED_MILLISECONDS);
    return {
      ...pentagon,
      centreX:   HATCH_HAND.HOLD_X_UNITS + ((HATCH_HAND.PUSHED_X_UNITS - HATCH_HAND.HOLD_X_UNITS) * pushed),
      centreY:   HATCH_HAND.HOLD_Y_UNITS,
      placement: isPushing ? 'exact-position' : 'eased',
    };
  }
  const isTaking = variant === 'normal' && timeInCycle >= HATCH_TIMELINE.REPLY_STARTS_MILLISECONDS;
  return {
    ...pentagon,
    centreX:   isTaking ? HATCH_HAND.TAKE_X_UNITS : HATCH_HAND.WAIT_X_UNITS,
    centreY:   isTaking ? HATCH_HAND.TAKE_Y_UNITS : HATCH_HAND.WAIT_Y_UNITS,
    placement: 'eased',
  };
}

const NO_PAPER: HatchPaperState = Object.freeze({ nearX: HATCH_SHAPE.WALL_X_UNITS, centreY: HATCH_HAND.HOLD_Y_UNITS, opacity: 0 });

/** The stub stays at the hand's wait place after the hand has gone, and fades with the loop's other props. */
function wallAt(timeInCycle: number, variant: HatchVariant, hand: HandPose | null): HatchWallState {
  const replyOut = progressBetween(timeInCycle, HATCH_TIMELINE.REPLY_STARTS_MILLISECONDS, HATCH_TIMELINE.REPLY_TAKEN_MILLISECONDS);
  const isNoteHeld = hand !== null && timeInCycle < HATCH_TIMELINE.PUSHED_MILLISECONDS;
  const isQueuedShrug = variant === 'queued' && timeInCycle >= HATCH_TIMELINE.QUEUED_SHRUG_MILLISECONDS;
  return {
    shown:        1,
    cycleOpacity: Math.min(
      progressBetween(timeInCycle, 0, HATCH_TIMELINE.FADE_IN_MILLISECONDS),
      1 - progressBetween(timeInCycle, HATCH_TIMELINE.FADE_OUT_STARTS_MILLISECONDS, HATCH_TIMELINE.CYCLE_MILLISECONDS),
    ),
    note: isNoteHeld && hand !== null
      ? { nearX: hand.centreX + HATCH_HAND.TIP_GRIP_UNITS, centreY: hand.centreY, opacity: 1 }
      : NO_PAPER,
    reply: variant === 'normal' && timeInCycle >= HATCH_TIMELINE.REPLY_STARTS_MILLISECONDS
      ? {
        nearX:   HATCH_SHAPE.WALL_X_UNITS - ((HATCH_SHAPE.WALL_X_UNITS - HATCH_HAND.TAKE_X_UNITS - HATCH_HAND.PALM_GRIP_UNITS) * replyOut),
        centreY: HATCH_HAND.TAKE_Y_UNITS,
        opacity: 1,
      }
      : NO_PAPER,
    replyTickOpacity: variant === 'normal' && timeInCycle >= HATCH_TIMELINE.REPLY_TAKEN_MILLISECONDS ? 1 : 0,
    stub:             isQueuedShrug
      ? {
        nearX:   HATCH_HAND.WAIT_X_UNITS + HATCH_HAND.TIP_GRIP_UNITS,
        centreY: HATCH_HAND.WAIT_Y_UNITS,
        opacity: progressBetween(timeInCycle, HATCH_TIMELINE.QUEUED_SHRUG_MILLISECONDS, HATCH_TIMELINE.QUEUED_SHRUG_MILLISECONDS + HATCH_TIMELINE.STUB_FADE_IN_MILLISECONDS),
      }
      : NO_PAPER,
  };
}

/** The dots of the Thinking emote, from the moment the note is in until the wait ends. */
function thinkingDotsAt(timeInCycle: number, variant: HatchVariant): EmoteMarkPose | null {
  return GestureMarkUtil.thinkingDotsIn(timeInCycle, { startMilliseconds: HATCH_TIMELINE.PUSHED_MILLISECONDS, endMilliseconds: thinkingEndsFor(variant) });
}

/** The sweat drop of the Sweatdrop emote from the shrug on, until the loop ends. */
function sweatDropAt(timeInCycle: number): EmoteMarkPose | null {
  return GestureMarkUtil.sweatDropIn(timeInCycle, { startMilliseconds: HATCH_TIMELINE.QUEUED_SHRUG_MILLISECONDS, endMilliseconds: HATCH_TIMELINE.CYCLE_MILLISECONDS });
}

function eyesAt(timeInCycle: number, variant: HatchVariant): Partial<EyesPose> {
  const isWaiting = timeInCycle >= HATCH_TIMELINE.PUSHED_MILLISECONDS && timeInCycle < thinkingEndsFor(variant);
  if (isWaiting || (variant === 'normal' && timeInCycle >= HATCH_TIMELINE.REPLY_STARTS_MILLISECONDS && timeInCycle < HATCH_TIMELINE.REPLY_TAKEN_MILLISECONDS)) {
    return { shift: HATCH_FACE.WAITING_EYE_SHIFT_UNITS };
  }
  const isAfterReply = timeInCycle >= HATCH_TIMELINE.REPLY_TAKEN_MILLISECONDS && timeInCycle < HATCH_TIMELINE.FADE_OUT_STARTS_MILLISECONDS;
  if (variant === 'normal' && isAfterReply) {
    return {
      shift:  EYE_SHAPE.SHIFT_AT_WORK_UNITS,
      height: HATCH_FACE.READING_EYE_HEIGHT_UNITS,
      lift:   HATCH_FACE.READING_EYE_LIFT_UNITS,
      ...(timeInCycle >= HATCH_TIMELINE.HAPPY_EYES_MILLISECONDS ? { happiness: 1 } : {}),
    };
  }
  const isShrugging = variant === 'queued' && timeInCycle >= HATCH_TIMELINE.QUEUED_SHRUG_MILLISECONDS && timeInCycle < HATCH_TIMELINE.FADE_OUT_STARTS_MILLISECONDS;
  if (isShrugging) return { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, rightHeightOverride: HATCH_FACE.SHRUG_RIGHT_EYE_HEIGHT_UNITS };
  return { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS };
}

function hatchPartOf(input: GestureInput<HatchVariant>): PosePart {
  const { variant } = input;
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, HATCH_TIMELINE.CYCLE_MILLISECONDS);
  const hand = handAt(timeInCycle, variant);
  const isShrugging = variant === 'queued' && timeInCycle >= HATCH_TIMELINE.QUEUED_SHRUG_MILLISECONDS && timeInCycle < HATCH_TIMELINE.FADE_OUT_STARTS_MILLISECONDS;
  const mark = thinkingDotsAt(timeInCycle, variant) ?? (variant === 'queued' ? sweatDropAt(timeInCycle) : null);
  return {
    body: {
      leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES,
      ...(isShrugging ? { addedLift: HATCH_FACE.SHRUG_LIFT_UNITS, heightFactor: HATCH_FACE.SHRUG_HEIGHT_FACTOR } : {}),
    },
    eyes:      eyesAt(timeInCycle, variant),
    nearHand:  hand,
    farHand:   null,
    emoteMark: mark,
    props:     { hatchWall: wallAt(timeInCycle, variant, hand) },
  };
}

export const HATCH_GESTURE = gestureDefinition({
  name:    'hatch',
  intents: {
    'hatch':        { variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: HATCH_TIMELINE.STILL_MOMENT_MILLISECONDS },
    'hatch-queued': { variant: 'queued', durationMilliseconds: null, stillMomentMilliseconds: HATCH_TIMELINE.QUEUED_STILL_MOMENT_MILLISECONDS },
  },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            hatchPartOf,
});
