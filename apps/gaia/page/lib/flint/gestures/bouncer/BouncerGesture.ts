/**
 * Bouncer: one hexagon holds a crimson rope to a post. Refuse keeps the rope hooked, stands firm,
 * shakes its head and shows a cross above the post; admit unhooks the rope, steps aside with a tick and happy eyes, and lets the props
 * fade. Both loop.
 */
import type { HandPose, PosePart }        from '../../SpritePose.ts';
import type { GestureInput }              from '../GestureDefinition.ts';
import { gestureDefinition }              from '../GestureDefinition.ts';
import { GestureTimelineUtil }            from '../GestureTimelineUtil.ts';
import type { BouncerBarrierState }       from './BouncerBarrierProp.ts';
import { BOUNCER_POSE, BOUNCER_TIMELINE } from './constants/BouncerValues.ts';

export type BouncerVariant = 'refuse' | 'admit';

const ROPE_HAND: HandPose = Object.freeze({
  cornerCount: BOUNCER_POSE.HAND_CORNER_COUNT,
  centreX:     BOUNCER_POSE.HAND_CENTRE_X_UNITS,
  centreY:     BOUNCER_POSE.HAND_CENTRE_Y_UNITS,
  radius:      BOUNCER_POSE.HAND_RADIUS_UNITS,
  turnDegrees: 0,
  placement:   'eased',
});

function isBetween(timeInCycle: number, startMilliseconds: number, endMilliseconds: number): boolean {
  return timeInCycle >= startMilliseconds && timeInCycle < endMilliseconds;
}

function refusePartOf(timeInCycle: number): PosePart {
  const isShaking = isBetween(timeInCycle, BOUNCER_TIMELINE.SHAKE_STARTS_MILLISECONDS, BOUNCER_TIMELINE.SHAKE_ENDS_MILLISECONDS);
  const barrier: BouncerBarrierState = {
    shown:        1,
    cycleOpacity: 1,
    unhooked:     0,
    crossOpacity: isBetween(timeInCycle, BOUNCER_TIMELINE.CROSS_SHOWS_MILLISECONDS, BOUNCER_TIMELINE.CROSS_HIDES_MILLISECONDS) ? 1 : 0,
    tickOpacity:  0,
  };
  return {
    body: {
      leanDegrees: BOUNCER_POSE.REFUSE_LEAN_DEGREES,
      widthFactor: BOUNCER_POSE.REFUSE_WIDTH_FACTOR,
      ...(isShaking ? { addedShake: BOUNCER_POSE.SHAKE_UNITS * Math.sin(timeInCycle / BOUNCER_POSE.SHAKE_DIVISOR_MILLISECONDS) } : {}),
    },
    eyes: {
      height:       BOUNCER_POSE.REFUSE_EYE_HEIGHT_UNITS,
      slantDegrees: BOUNCER_POSE.REFUSE_EYE_SLANT_DEGREES,
      shift:        BOUNCER_POSE.REFUSE_EYE_SHIFT_UNITS,
    },
    nearHand: ROPE_HAND,
    farHand:  null,
    props:    { bouncerBarrier: barrier },
  };
}

/**
 * While Flint unhooks the rope it works on it, upright as when it refuses, since the working lean would put the body corner under the hand
 * at (26, -26); once the rope hangs it steps aside, then lets go and the props fade.
 */
function admitPartOf(timeInCycle: number): PosePart {
  const isWelcoming = isBetween(timeInCycle, BOUNCER_TIMELINE.WELCOME_STARTS_MILLISECONDS, BOUNCER_TIMELINE.FADE_STARTS_MILLISECONDS);
  const isLetGo = timeInCycle >= BOUNCER_TIMELINE.FADE_STARTS_MILLISECONDS;
  const isHappy = isBetween(timeInCycle, BOUNCER_TIMELINE.HAPPY_EYES_START_MILLISECONDS, BOUNCER_TIMELINE.HAPPY_EYES_END_MILLISECONDS);
  const returning = GestureTimelineUtil.progressBetween(timeInCycle, 0, BOUNCER_TIMELINE.RETURN_MILLISECONDS);
  const fading = GestureTimelineUtil.progressBetween(timeInCycle, BOUNCER_TIMELINE.FADE_STARTS_MILLISECONDS, BOUNCER_TIMELINE.CYCLE_MILLISECONDS);
  const barrier: BouncerBarrierState = {
    shown:        1,
    cycleOpacity: Math.min(returning, 1 - fading),
    unhooked:     GestureTimelineUtil.progressBetween(timeInCycle, 0, BOUNCER_TIMELINE.UNHOOK_ENDS_MILLISECONDS),
    crossOpacity: 0,
    tickOpacity:  timeInCycle >= BOUNCER_TIMELINE.WELCOME_STARTS_MILLISECONDS ? 1 : 0,
  };
  const isUnhooking = !isWelcoming && !isLetGo;
  return {
    body: { leanDegrees: isWelcoming ? BOUNCER_POSE.ADMIT_LEAN_DEGREES : BOUNCER_POSE.REFUSE_LEAN_DEGREES },
    eyes: {
      ...(isWelcoming || isUnhooking ? { shift: BOUNCER_POSE.ADMIT_EYE_SHIFT_UNITS } : {}),
      ...(isHappy ? { happiness: 1 } : {}),
    },
    nearHand: isLetGo ? null : ROPE_HAND,
    farHand:  null,
    props:    { bouncerBarrier: barrier },
  };
}

function bouncerPartOf(input: GestureInput<BouncerVariant>): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, BOUNCER_TIMELINE.CYCLE_MILLISECONDS);
  return input.variant === 'refuse' ? refusePartOf(timeInCycle) : admitPartOf(timeInCycle);
}

export const BOUNCER_GESTURE = gestureDefinition({
  name:    'bouncer',
  intents: {
    refuse: { variant: 'refuse', durationMilliseconds: null, stillMomentMilliseconds: BOUNCER_TIMELINE.STILL_MOMENT_MILLISECONDS },
    admit:  { variant: 'admit', durationMilliseconds: null, stillMomentMilliseconds: BOUNCER_TIMELINE.STILL_MOMENT_MILLISECONDS },
  },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            bouncerPartOf,
});
