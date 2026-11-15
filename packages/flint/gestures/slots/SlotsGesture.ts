/**
 * Implements `06-more-animations.md`, "Slots": the concurrency limit. In `slots` a spark falls into each of three sockets in turn, lands
 * with a spring and lights its ring, while a triangle points at the socket that fills; then the sparks breathe. In `slots-full` every
 * socket has its spark: a pentagon holds a ticket above each socket in turn, each ring refuses it in crimson, and Flint takes the ticket
 * back, sweats and waits.
 */
import type { Point } from '../../SpriteGeometry.ts';
import type {
  EmoteMarkPose,
  EyesPose,
  HandPose,
  PosePart,
} from '../../SpritePose.ts';
import { BODY_SHAPE, EYE_SHAPE }                         from '../../constants/BodyShape.ts';
import { HAND_SHAPE }                                    from '../../constants/HandShape.ts';
import { SPRING }                                        from '../../constants/Motion.ts';
import { AnimationCurveUtil }                            from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }                             from '../GestureDefinition.ts';
import { gestureDefinition }                             from '../GestureDefinition.ts';
import { GestureMarkUtil }                               from '../GestureMarkUtil.ts';
import { GestureTimelineUtil }                           from '../GestureTimelineUtil.ts';
import type { SlotsSparkState, SlotsState, SocketLight } from './SlotRailProp.ts';
import {
  SLOTS_EYES,
  SLOTS_FULL,
  SLOTS_POINTER,
  SLOTS_SHAPE,
  SLOTS_SPARKS,
  SLOTS_TIMELINE,
} from './constants/SlotsValues.ts';

type SlotsVariant = 'normal' | 'full';

const { progressBetween } = GestureTimelineUtil;

/** The spring of an emote mark, from the moment it first passes its full size: a landing that overshoots and settles, never a growth. */
const LANDING_SPRING_START_PROGRESS = SPRING.PHASE_OFFSET / SPRING.DECAY_PER_PROGRESS;

function sceneOpacityAt(timeInCycle: number): number {
  return Math.min(
    progressBetween(timeInCycle, 0, SLOTS_TIMELINE.FADE_IN_MILLISECONDS),
    1 - progressBetween(timeInCycle, SLOTS_TIMELINE.FADES_OUT_MILLISECONDS, SLOTS_TIMELINE.CYCLE_MILLISECONDS),
  );
}

function fallStartOf(socketIndex: number): number {
  return SLOTS_SPARKS.FIRST_FALL_MILLISECONDS + (socketIndex * SLOTS_SPARKS.FALL_INTERVAL_MILLISECONDS);
}

function eyeLiftFollowing(followedY: number): number {
  return AnimationCurveUtil.clamp((followedY - SLOTS_EYES.LIFT_CENTRE_Y_UNITS) / SLOTS_EYES.LIFT_DIVISOR_UNITS, SLOTS_EYES.LIFT_LOWEST_UNITS, SLOTS_EYES.LIFT_HIGHEST_UNITS);
}

/** A spark is unseen until it falls; it falls with `p²`, lands with the spring, and from the hand's leave it breathes. */
function fallingSparkAt(timeInCycle: number, elapsedMilliseconds: number, socketIndex: number, sceneOpacity: number): SlotsSparkState {
  const fallStarts = fallStartOf(socketIndex);
  const landing = fallStarts + SLOTS_SPARKS.FALL_MILLISECONDS;
  const fall = progressBetween(timeInCycle, fallStarts, landing);
  const settling = progressBetween(timeInCycle, landing, landing + SPRING.DURATION_MILLISECONDS);
  const isBreathing = timeInCycle >= SLOTS_SPARKS.HAND_LEAVES_MILLISECONDS;
  const breathScale = 1 + (SLOTS_SPARKS.PULSE_FACTOR * Math.sin((elapsedMilliseconds / SLOTS_SPARKS.PULSE_DIVISOR_MILLISECONDS) + socketIndex));
  const landingScale = AnimationCurveUtil.springScaleAt(LANDING_SPRING_START_PROGRESS + ((1 - LANDING_SPRING_START_PROGRESS) * settling));
  return {
    y:       SLOTS_SPARKS.FALL_START_Y_UNITS + ((SLOTS_SHAPE.SOCKET_Y_UNITS - SLOTS_SPARKS.FALL_START_Y_UNITS) * fall * fall),
    scale:   isBreathing ? breathScale : landingScale,
    opacity: timeInCycle >= fallStarts ? sceneOpacity : 0,
  };
}

/** The socket that fills next: the triangle points at socket n from the landing of spark n - 1 until spark n lands. */
function fillingSocketAt(timeInCycle: number): number {
  const landed = SLOTS_SHAPE.SOCKET_X_UNITS.filter((_socketX, i) => timeInCycle >= fallStartOf(i) + SLOTS_SPARKS.FALL_MILLISECONDS).length;
  return Math.min(SLOTS_SHAPE.SOCKET_X_UNITS.length - 1, landed);
}

function fillingPartOf(timeInCycle: number, elapsedMilliseconds: number): PosePart {
  const sceneOpacity = sceneOpacityAt(timeInCycle);
  const sparks = SLOTS_SHAPE.SOCKET_X_UNITS.map((_socketX, i) => fallingSparkAt(timeInCycle, elapsedMilliseconds, i, sceneOpacity));
  const sockets = sparks.map((_spark, i): SocketLight => (timeInCycle >= fallStartOf(i) + SLOTS_SPARKS.FALL_MILLISECONDS ? 'lit' : 'free'));
  const socketIndex = fillingSocketAt(timeInCycle);
  const isPointing = timeInCycle < SLOTS_SPARKS.HAND_LEAVES_MILLISECONDS;
  const slots: SlotsState = {
    shown: 1, sceneOpacity, sockets, sparks, sheetOpacity: 0, sheetX: SLOTS_FULL.REST_X_UNITS, sheetY: SLOTS_FULL.REST_Y_UNITS,
  };
  return {
    body: { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes: isPointing
      ? { height: SLOTS_EYES.HEIGHT_UNITS, shift: SLOTS_EYES.SHIFT_BASE_UNITS + socketIndex, lift: eyeLiftFollowing(sparks[socketIndex]?.y ?? SLOTS_SHAPE.SOCKET_Y_UNITS) }
      : { height: SLOTS_EYES.HEIGHT_UNITS, shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS },
    nearHand: null,
    farHand:  isPointing
      ? {
        cornerCount: HAND_SHAPE.POINTING_CORNER_COUNT,
        centreX:     (SLOTS_SHAPE.SOCKET_X_UNITS[socketIndex] ?? 0) + SLOTS_POINTER.OFFSET_X_UNITS,
        centreY:     SLOTS_POINTER.Y_UNITS,
        radius:      SLOTS_POINTER.RADIUS_UNITS,
        turnDegrees: SLOTS_POINTER.TURN_DEGREES,
        placement:   'eased',
      }
      : null,
    props: { slotRail: slots },
  };
}

/** The ticket moves above each socket in turn and is refused there; from the last refusal it goes back to the rest place. */
function sheetPlaceAt(timeInCycle: number): { readonly x: number; readonly y: number; readonly refusingSocket: number | null } {
  const rest = { x: SLOTS_FULL.REST_X_UNITS, y: SLOTS_FULL.REST_Y_UNITS };
  const moveMilliseconds = SLOTS_FULL.SOCKET_MILLISECONDS - SLOTS_FULL.REFUSAL_MILLISECONDS;
  let from: Point = rest;
  for (let i = 0; i < SLOTS_SHAPE.SOCKET_X_UNITS.length; i++) {
    const starts = SLOTS_FULL.FIRST_SOCKET_MILLISECONDS + (i * SLOTS_FULL.SOCKET_MILLISECONDS);
    const above = { x: SLOTS_SHAPE.SOCKET_X_UNITS[i] ?? 0, y: SLOTS_FULL.ABOVE_SOCKET_Y_UNITS };
    if (timeInCycle < starts + SLOTS_FULL.SOCKET_MILLISECONDS) {
      const moved = progressBetween(timeInCycle, starts, starts + moveMilliseconds);
      const isRefusing = timeInCycle >= starts + moveMilliseconds;
      return { x: from.x + ((above.x - from.x) * moved), y: from.y + ((above.y - from.y) * moved), refusingSocket: isRefusing ? i : null };
    }
    from = above;
  }
  const back = progressBetween(timeInCycle, SLOTS_FULL.BACK_MILLISECONDS, SLOTS_FULL.BACK_MILLISECONDS + moveMilliseconds);
  return { x: from.x + ((rest.x - from.x) * back), y: from.y + ((rest.y - from.y) * back), refusingSocket: null };
}

/** The sweat drop of the Sweatdrop emote while Flint waits, until the props go. */
function sweatDropAt(timeInCycle: number): EmoteMarkPose | null {
  return GestureMarkUtil.sweatDropIn(timeInCycle, { startMilliseconds: SLOTS_FULL.BACK_MILLISECONDS, endMilliseconds: SLOTS_TIMELINE.FADES_OUT_MILLISECONDS });
}

function fullPartOf(timeInCycle: number): PosePart {
  const sceneOpacity = sceneOpacityAt(timeInCycle);
  const sheet = sheetPlaceAt(timeInCycle);
  const isWaiting = timeInCycle >= SLOTS_FULL.BACK_MILLISECONDS;
  const isHolding = timeInCycle < SLOTS_TIMELINE.FADES_OUT_MILLISECONDS;
  const slots: SlotsState = {
    shown:        1,
    sceneOpacity,
    sockets:      SLOTS_SHAPE.SOCKET_X_UNITS.map((_socketX, i): SocketLight => (sheet.refusingSocket === i ? 'refusing' : 'lit')),
    sparks:       SLOTS_SHAPE.SOCKET_X_UNITS.map(() => ({ y: SLOTS_SHAPE.SOCKET_Y_UNITS, scale: 1, opacity: sceneOpacity })),
    sheetOpacity: sceneOpacity,
    sheetX:       sheet.x,
    sheetY:       sheet.y,
  };
  const hand: HandPose = {
    cornerCount: HAND_SHAPE.GRABBING_CORNER_COUNT, centreX: 0, centreY: 0, radius: SLOTS_FULL.HAND_RADIUS_UNITS, turnDegrees: 0, placement: { heldTo: 'slotRail' },
  };
  const eyes: Partial<EyesPose> = isWaiting
    ? { height: SLOTS_FULL.WAIT_EYE_HEIGHT_UNITS, shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, lift: eyeLiftFollowing(sheet.y) }
    : { height: SLOTS_EYES.HEIGHT_UNITS, shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, lift: eyeLiftFollowing(sheet.y) };
  const sweatDrop = sweatDropAt(timeInCycle);
  return {
    body:     { leanDegrees: isWaiting ? 0 : BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes,
    nearHand: isHolding ? hand : null,
    farHand:  null,
    props:    { slotRail: slots },
    ...(sweatDrop === null ? {} : { emoteMark: sweatDrop }),
  };
}

function slotsPartOf(input: GestureInput<SlotsVariant>): PosePart {
  const timeInCycle = GestureTimelineUtil.timeInCycleOf(input.elapsedMilliseconds, SLOTS_TIMELINE.CYCLE_MILLISECONDS);
  return input.variant === 'full' ? fullPartOf(timeInCycle) : fillingPartOf(timeInCycle, input.elapsedMilliseconds);
}

export const SLOTS_GESTURE = gestureDefinition({
  name:    'slots',
  intents: {
    'slots':      { variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: SLOTS_TIMELINE.STILL_MOMENT_MILLISECONDS },
    'slots-full': { variant: 'full', durationMilliseconds: null, stillMomentMilliseconds: SLOTS_TIMELINE.FULL_STILL_MOMENT_MILLISECONDS },
  },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            slotsPartOf,
});
