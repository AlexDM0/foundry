/**
 * The mind stage, pure (`03-behaviour-and-architecture.md`, "The mind"): on each frame the reflexes run, then a waiting intent, then the
 * behaviour, then the timers of the jump, the gesture, the emote and sleep; and the target pose the mind asks for. The state and the
 * directors are in `flint/mind/`; the behaviours are reached through the behaviour catalog, the gestures and emotes through their intents.
 */
import { emoteDefinitionOf, intendedGestureOf }                       from './IntentMeaning.ts';
import type { MotionState }                                           from './MotionPose.ts';
import { motionBasePose }                                             from './MotionPose.ts';
import type { PoseLayer }                                             from './PoseComposition.ts';
import { composedTargetPose, NO_LAYER, poseWithPart }                 from './PoseComposition.ts';
import type { Pose }                                                  from './SpritePose.ts';
import { EMPTY_PAGE }                                                 from './SpritePose.ts';
import type { AttendantName }                                         from './attendants/AttendantCatalog.ts';
import { attendantMembersAt, EMPTY_ATTENDANT_ROSTER, rosterAttended } from './attendants/AttendantRoster.ts';
import { behaviourDefinitionOf, restingBehaviourAt }                  from './behaviours/BehaviourCatalog.ts';
import { SEEDED_SEQUENCE }                                            from './constants/Mind.ts';
import type { GestureInput }                                          from './gestures/GestureDefinition.ts';
import { mindStateWithIntentApplied }                                 from './mind/IntentApplication.ts';
import type {
  ActiveGesture,
  PendingIntent,
  SpriteMindState,
  StandingPlace
} from './mind/MindState.ts';
import type { FrameTime, Perception } from './mind/Perception.ts';
import { mindStateReachingFor }       from './mind/Reaching.ts';
import {
  mindStateAfterCues,
  mindStateAfterHappenings,
  mindStateKeepingItsPlace,
  mindStatePlaced
} from './mind/Reflexes.ts';
import {
  SLEEP_AWAKE,
  sleepIsActive,
  sleepPartOf,
  sleepStateAfterFrame
} from './sleep/SleepSequence.ts';
import { GROUNDED, JumpMotionUtil } from './utils/JumpMotionUtil.ts';

export const INITIAL_MIND_STATE: SpriteMindState = Object.freeze({
  motion: Object.freeze({
    positionX: 0, floorY: 0, facing: 1, walkDirection: 0, jump: GROUNDED,
  }),
  isPlaced:                    false,
  livesIn:                     null,
  behaviour:                   restingBehaviourAt(0),
  gesture:                     null,
  emote:                       null,
  sleep:                       SLEEP_AWAKE,
  lastIntent:                  null,
  pendingIntent:               null,
  directorInbox:               Object.freeze([]),
  recentCues:                  Object.freeze([]),
  lastDirectorAskMilliseconds: 0,
  quietSinceMilliseconds:      0,
  arrivalGreeting:             null,
  mayRestoreStoredHabitat:     true,
  sequenceSeed:                SEEDED_SEQUENCE.INITIAL_SEED,
  steeredWalk:                 0,
  attendants:                  EMPTY_ATTENDANT_ROSTER,
});

/** Where Flint stands: where its running behaviour puts it, or else where it lives. */
export function standingPlaceOf(state: SpriteMindState): StandingPlace {
  const { behaviour } = state;
  const ownPlace = behaviourDefinitionOf(behaviour.name).standingPlaceOf(behaviour);
  if (ownPlace !== null) return ownPlace;
  return state.livesIn === null ? { kind: 'home' } : { kind: 'habitat', habitatId: state.livesIn };
}

/** A later intent replaces one that waits; the next frame carries it out. */
export function mindStateWithPendingIntent(state: SpriteMindState, pending: PendingIntent): SpriteMindState {
  return { ...state, pendingIntent: pending };
}

/** The host's count of one attendant, from now on; nothing else in the mind changes it. */
export function mindStateAttended(state: SpriteMindState, name: AttendantName, count: number, elapsedMilliseconds: number): SpriteMindState {
  return { ...state, attendants: rosterAttended(state.attendants, name, count, elapsedMilliseconds) };
}

/** The director has seen the cues that waited. */
export function mindStateAfterDirectorAsked(state: SpriteMindState, elapsedMilliseconds: number): SpriteMindState {
  return { ...state, directorInbox: [], lastDirectorAskMilliseconds: elapsedMilliseconds };
}

function behaviourAfterFrame(state: SpriteMindState, perception: Perception, time: FrameTime): SpriteMindState {
  const { behaviour } = state;
  return behaviourDefinitionOf(behaviour.name).afterFrame(state, behaviour, perception, time);
}

function gestureAfterFrame(gesture: ActiveGesture | null, motion: MotionState, elapsedMilliseconds: number): ActiveGesture | null {
  if (gesture === null) return null;
  const { definition, form } = intendedGestureOf(gesture.intent);
  const gestureMilliseconds = elapsedMilliseconds - gesture.startedAtMilliseconds;
  if (form.durationMilliseconds !== null && gestureMilliseconds >= form.durationMilliseconds) return null;
  if (definition.verdict === null || gesture.verdict !== null || gestureMilliseconds < definition.verdict.momentMilliseconds) return gesture;
  const verdict = definition.verdict.verdictOf({
    elapsedMilliseconds: gestureMilliseconds, variant: form.variant, facing: motion.facing, sidewaysWidth: 1, target: gesture.target, verdict: null,
  });
  return { ...gesture, verdict };
}

function withTimersAdvanced(state: SpriteMindState, time: FrameTime): SpriteMindState {
  const { elapsedMilliseconds } = time;
  const { emote } = state;
  const emoteHasEnded = emote !== null && elapsedMilliseconds - emote.startedAtMilliseconds >= emoteDefinitionOf(emote.name).durationMilliseconds;
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
  const { target } = perception;
  const reaching = target.kind === 'on-the-page' ? mindStateReachingFor(behaved, target.box, elapsedMilliseconds, perception.reducedMotion) : behaved;
  return withTimersAdvanced(reaching, time);
}

function gestureInputOf(gesture: ActiveGesture, incoming: Pose, elapsedMilliseconds: number, reducedMotion: boolean): GestureInput {
  const { form } = intendedGestureOf(gesture.intent);
  return {
    elapsedMilliseconds: reducedMotion ? form.stillMomentMilliseconds : elapsedMilliseconds - gesture.startedAtMilliseconds,
    variant:             form.variant,
    facing:              incoming.body.facing,
    sidewaysWidth:       incoming.body.sidewaysWidth,
    target:              gesture.target,
    verdict:             gesture.verdict,
  };
}

/**
 * The target pose: the motion's base with the behaviour's part, then the gesture, the emote, sleep and the attendants, in the order of
 * `flint/PoseComposition.ts`.
 */
export function targetPoseOfMind(state: SpriteMindState, elapsedMilliseconds: number, reducedMotion: boolean): Pose {
  const { gesture, emote } = state;
  const behaviourPart = behaviourDefinitionOf(state.behaviour.name).partOf(state.behaviour, { state, elapsedMilliseconds, reducedMotion });
  const blinkIsAllowed = behaviourPart.blinkIsAllowed && gesture === null && emote === null && !sleepIsActive(state.sleep);
  const moved = poseWithPart(motionBasePose(state.motion, elapsedMilliseconds, { blinkIsAllowed }), behaviourPart.part);
  const base: Pose = {
    ...moved, body: { ...moved.body, positionEasing: behaviourPart.positionEasing }, occlusion: behaviourPart.occlusion, page: behaviourPart.page ?? EMPTY_PAGE,
  };
  const gestureLayer: PoseLayer = gesture === null
    ? NO_LAYER
    : (incoming) => intendedGestureOf(gesture.intent).definition.targetPose(gestureInputOf(gesture, incoming, elapsedMilliseconds, reducedMotion));
  const emoteLayer: PoseLayer = emote === null
    ? NO_LAYER
    : (incoming) => emoteDefinitionOf(emote.name).targetPose({ ageMilliseconds: elapsedMilliseconds - emote.startedAtMilliseconds, facing: incoming.body.facing, reducedMotion });
  const sleepLayer: PoseLayer = (incoming) => sleepPartOf({
    state: state.sleep, elapsedMilliseconds, incomingEyeHeight: incoming.eyes.height, reducedMotion,
  });
  return composedTargetPose({
    base,
    gesture:    gestureLayer,
    emote:      emoteLayer,
    sleep:      sleepLayer,
    attendants: attendantMembersAt(state.attendants, elapsedMilliseconds, reducedMotion),
    reducedMotion,
  });
}
