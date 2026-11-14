/**
 * The mind stage, pure (`03-behaviour-and-architecture.md`, "The mind"): on each frame the reflexes run, then a waiting intent, then the
 * behaviour, then the timers of the jump, the gesture, the emote and sleep; and the target pose the mind asks for. The state, the
 * behaviours and the directors are in `flint/mind/` and `flint/behaviours/`.
 */
import type { MotionState }                                   from './MotionPose.ts';
import { motionBasePose }                                     from './MotionPose.ts';
import type { PoseLayer }                                     from './PoseComposition.ts';
import { composedTargetPose, NO_LAYER, poseWithPart }         from './PoseComposition.ts';
import type { Pose }                                          from './SpritePose.ts';
import { carriedAfterFrame, carriedBehaviourPartOf }          from './behaviours/CarriedBehaviour.ts';
import { copyAfterFrame, copyPartOf }                         from './behaviours/CopyBehaviour.ts';
import { cursorPlayAfterFrame, cursorPlayPartOf }             from './behaviours/CursorPlayBehaviour.ts';
import { landingAfterFrame, landingPartOf }                   from './behaviours/LandingBehaviour.ts';
import { sleepAfterFrame, sleepBehaviourPartOf }              from './behaviours/SleepBehaviour.ts';
import { strandedAfterFrame, strandedPartOf }                 from './behaviours/StrandedBehaviour.ts';
import { visitAfterFrame, visitPartOf }                       from './behaviours/VisitBehaviour.ts';
import { wanderAfterFrame, wanderPartOf }                     from './behaviours/WanderBehaviour.ts';
import { EMOTE_CATALOG }                                      from './emotes/EmoteCatalog.ts';
import { GESTURE_CATALOG }                                    from './gestures/GestureCatalog.ts';
import type { GestureInput }                                  from './gestures/GestureDefinition.ts';
import type { BehaviourPart }                                 from './mind/BehaviourPart.ts';
import { mindStateWithIntentApplied }                         from './mind/IntentApplication.ts';
import type { ActiveGesture, PendingIntent, SpriteMindState } from './mind/MindState.ts';
import type { FrameTime, Perception }                         from './mind/Perception.ts';
import { mindStateReachingFor }                               from './mind/Reaching.ts';
import {
  mindStateAfterCues,
  mindStateAfterHappenings,
  mindStateKeepingItsPlace,
  mindStatePlaced
} from './mind/Reflexes.ts';
import { sleepIsActive, sleepPartOf, sleepStateAfterFrame } from './sleep/SleepSequence.ts';
import { JumpMotionUtil }                                   from './utils/JumpMotionUtil.ts';

/** Where Flint stands, for the sensors that stop Flint while that place is off the screen; in the air while it is carried or stranded. */
export type StandingPlace =
  | { readonly kind: 'home' }
  | { readonly kind: 'habitat'; readonly habitatId: string }
  | { readonly kind: 'in-the-air' };

export function standingPlaceOf(state: SpriteMindState): StandingPlace {
  const { behaviour } = state;
  if (behaviour.name === 'carried' || behaviour.name === 'stranded') return { kind: 'in-the-air' };
  if (behaviour.name === 'visit' || behaviour.name === 'dropped') return { kind: 'habitat', habitatId: behaviour.habitatId };
  return state.livesIn === null ? { kind: 'home' } : { kind: 'habitat', habitatId: state.livesIn };
}

/** A later intent replaces one that waits; the next frame carries it out. */
export function mindStateWithPendingIntent(state: SpriteMindState, pending: PendingIntent): SpriteMindState {
  return { ...state, pendingIntent: pending };
}

/** The director has seen the cues that waited. */
export function mindStateAfterDirectorAsked(state: SpriteMindState, elapsedMilliseconds: number): SpriteMindState {
  return { ...state, directorInbox: [], lastDirectorAskMilliseconds: elapsedMilliseconds };
}

function behaviourAfterFrame(state: SpriteMindState, perception: Perception, time: FrameTime): SpriteMindState {
  const { behaviour } = state;
  switch (behaviour.name) {
    case 'wander':
      return wanderAfterFrame(state, behaviour, perception, time);
    case 'sleep':
      return sleepAfterFrame(state, perception);
    case 'visit':
      return visitAfterFrame(state, behaviour, perception, time);
    case 'copy':
      return copyAfterFrame(state, behaviour, perception, time);
    case 'cursor-play':
      return cursorPlayAfterFrame(state, behaviour, perception, time);
    case 'carried':
      return carriedAfterFrame(state, perception);
    case 'dropped':
      return landingAfterFrame(state, behaviour, perception, time);
    case 'stranded':
      return strandedAfterFrame(state, behaviour, perception, time);
  }
}

function gestureAfterFrame(gesture: ActiveGesture | null, motion: MotionState, elapsedMilliseconds: number): ActiveGesture | null {
  if (gesture === null) return null;
  const definition = GESTURE_CATALOG[gesture.name];
  const gestureMilliseconds = elapsedMilliseconds - gesture.startedAtMilliseconds;
  if (definition.durationMilliseconds !== null && gestureMilliseconds >= definition.durationMilliseconds) return null;
  if (definition.verdict === null || gesture.verdict !== null || gestureMilliseconds < definition.verdict.momentMilliseconds) return gesture;
  const verdict = definition.verdict.verdictOf({
    elapsedMilliseconds: gestureMilliseconds, mood: gesture.mood, facing: motion.facing, sidewaysWidth: 1, target: gesture.target, verdict: null,
  });
  return { ...gesture, verdict };
}

function withTimersAdvanced(state: SpriteMindState, time: FrameTime): SpriteMindState {
  const { elapsedMilliseconds } = time;
  const { emote } = state;
  const emoteHasEnded = emote !== null && elapsedMilliseconds - emote.startedAtMilliseconds >= EMOTE_CATALOG[emote.name].durationMilliseconds;
  return {
    ...state,
    motion:  { ...state.motion, jump: JumpMotionUtil.advanced(state.motion.jump, time.deltaMilliseconds) },
    gesture: gestureAfterFrame(state.gesture, state.motion, elapsedMilliseconds),
    emote:   emoteHasEnded ? null : emote,
    sleep:   sleepStateAfterFrame(state.sleep, elapsedMilliseconds),
  };
}

export function mindStateAfterFrame(state: SpriteMindState, perception: Perception, time: FrameTime): SpriteMindState {
  const { elapsedMilliseconds } = time;
  const placed = mindStatePlaced(state, perception);
  const heard = mindStateAfterCues(placed, perception, elapsedMilliseconds);
  const kept = mindStateKeepingItsPlace(heard, perception, elapsedMilliseconds);
  const answered = mindStateAfterHappenings(kept, perception, elapsedMilliseconds);
  const intended = answered.pendingIntent === null ? answered : mindStateWithIntentApplied(answered, answered.pendingIntent, perception, elapsedMilliseconds);
  const behaved = behaviourAfterFrame(intended, perception, time);
  const reaching = perception.reachTarget === null ? behaved : mindStateReachingFor(behaved, perception.reachTarget, elapsedMilliseconds, perception.reducedMotion);
  return withTimersAdvanced(reaching, time);
}

function behaviourPartOf(state: SpriteMindState, elapsedMilliseconds: number, reducedMotion: boolean): BehaviourPart {
  const { behaviour } = state;
  switch (behaviour.name) {
    case 'wander':
      return wanderPartOf();
    case 'sleep':
      return sleepBehaviourPartOf();
    case 'visit':
      return visitPartOf(behaviour);
    case 'copy':
      return copyPartOf();
    case 'cursor-play':
      return cursorPlayPartOf();
    case 'carried':
      return carriedBehaviourPartOf(behaviour, state, elapsedMilliseconds, reducedMotion);
    case 'dropped':
      return landingPartOf(behaviour, elapsedMilliseconds);
    case 'stranded':
      return strandedPartOf();
  }
}

function gestureInputOf(gesture: ActiveGesture, incoming: Pose, elapsedMilliseconds: number, reducedMotion: boolean): GestureInput {
  const definition = GESTURE_CATALOG[gesture.name];
  return {
    elapsedMilliseconds: reducedMotion ? definition.stillMomentMilliseconds : elapsedMilliseconds - gesture.startedAtMilliseconds,
    mood:                gesture.mood,
    facing:              incoming.body.facing,
    sidewaysWidth:       incoming.body.sidewaysWidth,
    target:              gesture.target,
    verdict:             gesture.verdict,
  };
}

/** The target pose: the motion's base with the behaviour's part, then the gesture, the emote and sleep, in the order of `flint/PoseComposition.ts`. */
export function targetPoseOfMind(state: SpriteMindState, elapsedMilliseconds: number, reducedMotion: boolean): Pose {
  const { gesture, emote } = state;
  const behaviourPart = behaviourPartOf(state, elapsedMilliseconds, reducedMotion);
  const blinkIsAllowed = behaviourPart.blinkIsAllowed && gesture === null && emote === null && !sleepIsActive(state.sleep);
  const moved = poseWithPart(motionBasePose(state.motion, elapsedMilliseconds, { blinkIsAllowed }), behaviourPart.part);
  const base: Pose = { ...moved, body: { ...moved.body, positionEasing: behaviourPart.positionEasing }, occlusion: behaviourPart.occlusion };
  const gestureLayer: PoseLayer = gesture === null
    ? NO_LAYER
    : (incoming) => GESTURE_CATALOG[gesture.name].targetPose(gestureInputOf(gesture, incoming, elapsedMilliseconds, reducedMotion));
  const emoteLayer: PoseLayer = emote === null
    ? NO_LAYER
    : (incoming) => EMOTE_CATALOG[emote.name].targetPose({ ageMilliseconds: elapsedMilliseconds - emote.startedAtMilliseconds, facing: incoming.body.facing, reducedMotion });
  const sleepLayer: PoseLayer = (incoming) => sleepPartOf({
    state: state.sleep, elapsedMilliseconds, incomingEyeHeight: incoming.eyes.height, reducedMotion,
  });
  return composedTargetPose({
    base,
    gesture: gestureLayer,
    emote:   emoteLayer,
    sleep:   sleepLayer,
    reducedMotion,
  });
}
