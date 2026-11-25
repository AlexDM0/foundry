/**
 * Sandbox: Flint types in the normal mood under a dome, reaches out with a pentagon, is stopped
 * where its edge meets the dome (which lights up and ripples), springs back with a wobble, sweats, and goes back to typing. The far hand
 * rests on its key while the near hand is away.
 */
import type { EmoteMarkPoseOf, HandPose, PosePart } from '../../SpritePose.ts';
import type { GestureInput }                        from '../GestureDefinition.ts';
import { gestureDefinition, singleFormOf }          from '../GestureDefinition.ts';
import { GestureMarkUtil }                          from '../GestureMarkUtil.ts';
import { GestureTimelineUtil }                      from '../GestureTimelineUtil.ts';
import { TypingUtil }                               from '../TypingUtil.ts';
import type { TypingHands }                         from '../TypingUtil.ts';
import {
  SANDBOX_EXTENT,
  SANDBOX_REACH,
  SANDBOX_SWEAT,
  SANDBOX_TIMELINE,
  SANDBOX_TYPING,
} from './constants/SandboxValues.ts';

const { progressBetween } = GestureTimelineUtil;

/** The two squares of normal typing; a hand that is not typing rests on its key. */
function typingHandsAt(timeInCycle: number, isTapping: boolean): TypingHands {
  return isTapping ? TypingUtil.normalTypingHandsAt(timeInCycle) : { nearHand: TypingUtil.handOnKeyOf('near', 0), farHand: TypingUtil.handOnKeyOf('far', 0) };
}

/** The pentagon goes out level to the dome and stops at the contact, then springs back with a wobble; placed exactly throughout. */
function reachingHandAt(timeInCycle: number): HandPose {
  const reach = progressBetween(timeInCycle, SANDBOX_TIMELINE.REACH_STARTS_MILLISECONDS, SANDBOX_TIMELINE.CONTACT_MILLISECONDS);
  const recoil = progressBetween(timeInCycle, SANDBOX_TIMELINE.CONTACT_MILLISECONDS, SANDBOX_TIMELINE.RECOIL_ENDS_MILLISECONDS);
  const contactX = SANDBOX_REACH.START_X_UNITS + ((SANDBOX_REACH.CONTACT_X_UNITS - SANDBOX_REACH.START_X_UNITS) * reach);
  return {
    cornerCount: SANDBOX_REACH.HAND_CORNER_COUNT,
    centreX:     contactX + ((SANDBOX_REACH.RECOIL_X_UNITS - SANDBOX_REACH.CONTACT_X_UNITS) * recoil),
    centreY:     SANDBOX_REACH.REACH_Y_UNITS + ((SANDBOX_REACH.RECOIL_Y_UNITS - SANDBOX_REACH.REACH_Y_UNITS) * recoil),
    radius:      SANDBOX_REACH.HAND_RADIUS_UNITS,
    turnDegrees: SANDBOX_REACH.WOBBLE_DEGREES * Math.sin(SANDBOX_REACH.WOBBLE_HALF_TURNS * Math.PI * recoil),
    placement:   'exact-position',
  };
}

/** The sweat drop of the Sweatdrop emote, from the end of the recoil until the hands go back. */
function sweatDropAt(timeInCycle: number): EmoteMarkPoseOf<'sweat-drop'> | null {
  return GestureMarkUtil.sweatDropIn(timeInCycle, { startMilliseconds: SANDBOX_TIMELINE.RECOIL_ENDS_MILLISECONDS, endMilliseconds: SANDBOX_TIMELINE.SWEAT_ENDS_MILLISECONDS });
}

function sandboxPartOf(input: GestureInput): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, SANDBOX_TIMELINE.CYCLE_MILLISECONDS);
  const isTyping = timeInCycle < SANDBOX_TIMELINE.REACH_STARTS_MILLISECONDS;
  const isReaching = !isTyping && timeInCycle < SANDBOX_TIMELINE.RECOIL_ENDS_MILLISECONDS;
  const isSweating = timeInCycle >= SANDBOX_TIMELINE.RECOIL_ENDS_MILLISECONDS && timeInCycle < SANDBOX_TIMELINE.SWEAT_ENDS_MILLISECONDS;
  const isReturning = timeInCycle >= SANDBOX_TIMELINE.SWEAT_ENDS_MILLISECONDS;
  const typingHands = typingHandsAt(timeInCycle, isTyping);
  const flash = timeInCycle < SANDBOX_TIMELINE.CONTACT_MILLISECONDS
    ? 0
    : 1 - progressBetween(timeInCycle, SANDBOX_TIMELINE.CONTACT_MILLISECONDS, SANDBOX_TIMELINE.CONTACT_MILLISECONDS + SANDBOX_TIMELINE.DOME_FLASH_MILLISECONDS);
  const ripplesOpacity = timeInCycle < SANDBOX_TIMELINE.CONTACT_MILLISECONDS
    ? 0
    : 1 - progressBetween(timeInCycle, SANDBOX_TIMELINE.CONTACT_MILLISECONDS, SANDBOX_TIMELINE.CONTACT_MILLISECONDS + SANDBOX_TIMELINE.RIPPLES_FADE_MILLISECONDS);
  const workingEyes = { height: SANDBOX_TYPING.EYE_HEIGHT_UNITS, shift: SANDBOX_TYPING.EYE_SHIFT_UNITS };
  const sweatingEyes = { height: SANDBOX_SWEAT.EYE_HEIGHT_UNITS, shift: SANDBOX_SWEAT.EYE_SHIFT_UNITS };
  return {
    body:      { leanDegrees: SANDBOX_TYPING.LEAN_DEGREES },
    eyes:      isSweating ? sweatingEyes : { ...workingEyes, ...(isTyping || isReturning ? { lift: SANDBOX_TYPING.EYE_LIFT_UNITS } : {}) },
    nearHand:  isTyping || isReturning ? typingHands.nearHand : isReaching ? reachingHandAt(timeInCycle) : null,
    farHand:   typingHands.farHand,
    props:     { keyboard: { shown: 1, drop: 0 }, sandboxDome: { shown: 1, flash, ripplesOpacity } },
    emoteMark: isSweating ? sweatDropAt(timeInCycle) : null,
  };
}

export const SANDBOX_GESTURE = gestureDefinition({
  name:                  'sandbox',
  intents:               { sandbox: singleFormOf(null, SANDBOX_TIMELINE.STILL_MOMENT_MILLISECONDS, SANDBOX_EXTENT) },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            sandboxPartOf,
});
