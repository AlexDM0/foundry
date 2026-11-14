/**
 * The small changes every behaviour and reflex makes to the mind, kept in one place so each holds `02-animations.md`, "Rules between
 * animations": walking stops a gesture unless it is point or grab, jumping stops a gesture unless it is point, and an emote stops sleep.
 */
import { ARRIVED_CUE }                       from '../SpriteHabitat.ts';
import type { Point }                        from '../SpritePose.ts';
import { WANDER }                            from '../constants/Behaviours.ts';
import type { EmoteName }                    from '../emotes/EmoteDefinition.ts';
import { GESTURE_CATALOG }                   from '../gestures/GestureCatalog.ts';
import type { GestureName, Mood }            from '../gestures/GestureDefinition.ts';
import { sleepStateWaking }                  from '../sleep/SleepSequence.ts';
import { GROUNDED, JumpMotionUtil }          from '../utils/JumpMotionUtil.ts';
import type { WalkDirection }                from '../utils/WalkMotionUtil.ts';
import type { SpriteMindState, WanderState } from './MindState.ts';
import type { PlaceBox }                     from './Perception.ts';
import { PlaceUtil }                         from './utils/PlaceUtil.ts';

/** A wander that rests first, for the shortest rest. */
export function wanderAtRest(elapsedMilliseconds: number): WanderState {
  return { name: 'wander', walkToX: null, restUntilMilliseconds: elapsedMilliseconds + WANDER.REST_SHORTEST_MILLISECONDS };
}

/** Sleep ends with its wake; a sleeping Flint wanders again. */
export function withWokenUp(state: SpriteMindState, elapsedMilliseconds: number): SpriteMindState {
  return {
    ...state,
    sleep:     sleepStateWaking(state.sleep, elapsedMilliseconds),
    behaviour: state.behaviour.name === 'sleep' ? wanderAtRest(elapsedMilliseconds) : state.behaviour,
  };
}

/** Starts a gesture in a mood it has, or the normal mood; the same gesture in the same mood goes on, with only its target changed. */
export function withGesture(state: SpriteMindState, name: GestureName, mood: Mood, elapsedMilliseconds: number, target: Point | null = null): SpriteMindState {
  const definition = GESTURE_CATALOG[name];
  const moodItHas = definition.moods.includes(mood) ? mood : 'normal';
  const woken = withWokenUp(state, elapsedMilliseconds);
  if (state.gesture !== null && state.gesture.name === name && state.gesture.mood === moodItHas) return { ...woken, gesture: { ...state.gesture, target } };
  return {
    ...woken,
    gesture: {
      name, mood: moodItHas, startedAtMilliseconds: elapsedMilliseconds, target, verdict: null,
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
  const keepsGesture = direction === 0 || state.gesture === null || GESTURE_CATALOG[state.gesture.name].continuesWhileWalking;
  return {
    ...state,
    gesture: keepsGesture ? state.gesture : null,
    motion:  { ...state.motion, walkDirection: direction, facing: direction === 0 ? state.motion.facing : direction },
  };
}

/** A jump starts only from the floor, and stops the gesture unless the gesture goes on through it. */
export function withJump(state: SpriteMindState): SpriteMindState {
  if (JumpMotionUtil.isAirborne(state.motion.jump)) return state;
  const keepsGesture = state.gesture === null || GESTURE_CATALOG[state.gesture.name].continuesWhileJumping;
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

/**
 * Flint now lives in the habitat and wanders there; the habitat hears `arrived` in place of the cues of the place it left. `greeted` is
 * true after a pop-in, whose own wave is the greeting.
 */
export function withArrival(state: SpriteMindState, habitatId: string, elapsedMilliseconds: number, greeted: boolean): SpriteMindState {
  return {
    ...state,
    livesIn:                 habitatId,
    behaviour:               wanderAtRest(elapsedMilliseconds),
    directorInbox:           [ARRIVED_CUE],
    recentCues:              [ARRIVED_CUE],
    greetedOnArrival:        greeted,
    mayRestoreStoredHabitat: false,
  };
}
