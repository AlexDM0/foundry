/**
 * Cursor play (`02-animations.md` and `03-behaviour-and-architecture.md`, "Pointer"): after a click Flint is surprised, then walks and
 * jumps to the pointer along its floor and grabs at it when it is near. When the pointer leaves the component, or stands still for some
 * seconds, Flint shows the Doubt emote and stops. Under reduced motion it only turns and grabs.
 */
import { CURSOR_PLAY }                           from '../constants/Behaviours.ts';
import { BODY_SHAPE }                            from '../constants/BodyShape.ts';
import { HOVER, WALK }                           from '../constants/Motion.ts';
import { GESTURE_CATALOG }                       from '../gestures/GestureCatalog.ts';
import type { BehaviourPart }                    from '../mind/BehaviourPart.ts';
import { PLAIN_BEHAVIOUR_PART }                  from '../mind/BehaviourPart.ts';
import type { CursorPlayState, SpriteMindState } from '../mind/MindState.ts';
import {
  wanderAtRest,
  withEmote,
  withGesture,
  withJump,
  withWalking
} from '../mind/MindTransitions.ts';
import type { FrameTime, Perception } from '../mind/Perception.ts';
import { MovementUtil }               from '../mind/utils/MovementUtil.ts';
import { PlaceUtil }                  from '../mind/utils/PlaceUtil.ts';
import { IdleMotionUtil }             from '../utils/IdleMotionUtil.ts';
import { JumpMotionUtil }             from '../utils/JumpMotionUtil.ts';

export function cursorPlayStarted(state: SpriteMindState, elapsedMilliseconds: number): SpriteMindState {
  return {
    ...withEmote(state, 'surprised', elapsedMilliseconds),
    behaviour:               { name: 'cursor-play', pointerMovedAtMilliseconds: elapsedMilliseconds, nextGrabAtMilliseconds: elapsedMilliseconds },
    mayRestoreStoredHabitat: false,
  };
}

function cursorPlayStopped(state: SpriteMindState, elapsedMilliseconds: number): SpriteMindState {
  return withWalking({ ...withEmote(state, 'doubt', elapsedMilliseconds), behaviour: wanderAtRest(elapsedMilliseconds) }, 0);
}

export function cursorPlayAfterFrame(state: SpriteMindState, play: CursorPlayState, perception: Perception, time: FrameTime): SpriteMindState {
  const { elapsedMilliseconds } = time;
  const box = PlaceUtil.boxWhereFlintLives(state, perception);
  const { pointer } = perception;
  if (box === null || pointer === null || !PlaceUtil.isInside(box, pointer.x, pointer.y)) return cursorPlayStopped(state, elapsedMilliseconds);
  const pointerMovedAtMilliseconds = pointer.hasMoved ? elapsedMilliseconds : play.pointerMovedAtMilliseconds;
  if (elapsedMilliseconds - pointerMovedAtMilliseconds >= CURSOR_PLAY.STILL_POINTER_MILLISECONDS) return cursorPlayStopped(state, elapsedMilliseconds);

  const { motion } = state;
  const hover = perception.reducedMotion ? HOVER.HEIGHT_UNITS : IdleMotionUtil.hoverHeightAt(elapsedMilliseconds);
  const originY = box.floorY - motion.jump.height - hover;
  const sidewaysUnits = pointer.x - motion.positionX;
  const fromCentreY = pointer.y - originY - BODY_SHAPE.CENTRE_Y_UNITS;
  const facing = MovementUtil.facingToward(motion.positionX, pointer.x, motion.facing);
  let next: SpriteMindState = { ...state, behaviour: { ...play, pointerMovedAtMilliseconds }, motion: { ...motion, floorY: box.floorY, facing } };

  const walkToX = PlaceUtil.clampedToFloor(pointer.x, box);
  if (!perception.reducedMotion && Math.abs(sidewaysUnits) > CURSOR_PLAY.STANDING_DISTANCE_UNITS && walkToX !== motion.positionX) {
    next = withWalking(next, MovementUtil.directionToward(motion.positionX, walkToX));
    next = { ...next, motion: { ...next.motion, positionX: MovementUtil.stepToward(motion.positionX, walkToX, WALK.SPEED_UNITS_PER_SECOND, time.deltaMilliseconds) } };
  } else {
    next = withWalking(next, 0);
  }

  const pointerIsHigh = -fromCentreY > CURSOR_PLAY.JUMP_HEIGHT_UNITS && Math.abs(sidewaysUnits) <= CURSOR_PLAY.JUMP_WIDTH_UNITS;
  if (!perception.reducedMotion && pointerIsHigh && next.gesture === null && !JumpMotionUtil.isAirborne(motion.jump)) next = withJump(next);

  const target = { x: sidewaysUnits * facing, y: pointer.y - originY };
  if (next.gesture?.name === 'grab') return withGesture(next, 'grab', 'normal', elapsedMilliseconds, target);
  const isNear = Math.hypot(sidewaysUnits, fromCentreY) <= CURSOR_PLAY.GRAB_DISTANCE_UNITS;
  if (!isNear || next.gesture !== null || elapsedMilliseconds < play.nextGrabAtMilliseconds) return next;
  const grabMilliseconds = GESTURE_CATALOG.grab.durationMilliseconds ?? 0;
  const grabbing = withGesture(next, 'grab', 'normal', elapsedMilliseconds, target);
  const nextGrabAtMilliseconds = elapsedMilliseconds + grabMilliseconds + CURSOR_PLAY.PAUSE_AFTER_GRAB_MILLISECONDS;
  return { ...grabbing, behaviour: { ...play, pointerMovedAtMilliseconds, nextGrabAtMilliseconds } };
}

export function cursorPlayPartOf(): BehaviourPart {
  return { ...PLAIN_BEHAVIOUR_PART, blinkIsAllowed: false };
}
