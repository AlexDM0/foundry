/**
 * The small changes every behaviour and reflex makes to the mind, kept in one place so each holds `02-animations.md`, "Rules between
 * animations": walking stops a gesture unless it is point or grab, jumping stops a gesture unless it is point, and an emote stops sleep.
 */
import { intendedGestureOf }        from '../IntentMeaning.ts';
import type { Point }               from '../SpriteGeometry.ts';
import type { EmoteName }           from '../emotes/EmoteCatalog.ts';
import type { GestureIntent }       from '../gestures/GestureCatalog.ts';
import { sleepStateWaking }         from '../sleep/SleepSequence.ts';
import { GROUNDED, JumpMotionUtil } from '../utils/JumpMotionUtil.ts';
import type { WalkDirection }       from '../utils/WalkMotionUtil.ts';
import type { SpriteMindState }     from './MindState.ts';
import type { PlaceBox }            from './Perception.ts';
import { PlaceUtil }                from './utils/PlaceUtil.ts';

/** Sleep ends with its wake; the sleep behaviour sees the wake on its next frame and hands Flint to the rest. */
export function withWokenUp(state: SpriteMindState, elapsedMilliseconds: number): SpriteMindState {
  return { ...state, sleep: sleepStateWaking(state.sleep, elapsedMilliseconds) };
}

/** Starts the gesture of an intent; the gesture of the same intent goes on, with only its target changed. */
export function withGesture(state: SpriteMindState, intent: GestureIntent, elapsedMilliseconds: number, target: Point | null = null): SpriteMindState {
  const woken = withWokenUp(state, elapsedMilliseconds);
  if (state.gesture !== null && state.gesture.intent === intent) return { ...woken, gesture: { ...state.gesture, target } };
  return {
    ...woken,
    gesture: {
      intent, startedAtMilliseconds: elapsedMilliseconds, target, verdict: null,
    },
  };
}

export function withoutGesture(state: SpriteMindState): SpriteMindState {
  return state.gesture === null ? state : { ...state, gesture: null };
}

/** An emote replaces the one that shows, and wakes Flint. */
export function withEmote(state: SpriteMindState, name: EmoteName, elapsedMilliseconds: number): SpriteMindState {
  return { ...withWokenUp(state, elapsedMilliseconds), emote: { name, startedAtMilliseconds: elapsedMilliseconds } };
}

/** Sets the walk of this frame, which drives the wobble and the facing; a walk stops the gesture unless the gesture goes on through it. */
export function withWalking(state: SpriteMindState, direction: WalkDirection): SpriteMindState {
  const keepsGesture = direction === 0 || state.gesture === null || intendedGestureOf(state.gesture.intent).definition.continuesWhileWalking;
  return {
    ...state,
    gesture: keepsGesture ? state.gesture : null,
    motion:  { ...state.motion, walkDirection: direction, facing: direction === 0 ? state.motion.facing : direction },
  };
}

/** A jump starts only from the floor, and stops the gesture unless the gesture goes on through it. */
export function withJump(state: SpriteMindState): SpriteMindState {
  if (JumpMotionUtil.isAirborne(state.motion.jump)) return state;
  const keepsGesture = state.gesture === null || intendedGestureOf(state.gesture.intent).definition.continuesWhileJumping;
  return { ...state, gesture: keepsGesture ? state.gesture : null, motion: { ...state.motion, jump: JumpMotionUtil.launched(state.motion.jump) } };
}

/** Flint lives in its home, standing on its floor; it stays where it is when the home is not on the page. */
export function withPlacedAtHome(state: SpriteMindState, home: PlaceBox | null): SpriteMindState {
  if (home === null) return { ...state, livesIn: null };
  return {
    ...state,
    livesIn:  null,
    isPlaced: true,
    motion:   {
      ...state.motion, positionX: PlaceUtil.clampedToFloor(state.motion.positionX, home), floorY: home.floorY, walkDirection: 0, jump: GROUNDED,
    },
  };
}
