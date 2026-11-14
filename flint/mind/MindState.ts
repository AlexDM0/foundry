/**
 * The state of Flint's mind, as plain data: where it lives, the behaviour it runs with that behaviour's own state, its gesture, emote and
 * sleep, and what waits for the director. `flint/SpriteMind.ts` changes it on each frame; nothing else keeps state between frames.
 */
import type { MotionState }             from '../MotionPose.ts';
import type { SpriteCue, SpriteIntent } from '../SpriteHabitat.ts';
import type { Facing, Point }           from '../SpritePose.ts';
import { WANDER_SEQUENCE }              from '../constants/Behaviours.ts';
import type { EmoteName }               from '../emotes/EmoteDefinition.ts';
import type { GestureName, Mood }       from '../gestures/GestureDefinition.ts';
import type { SleepState }              from '../sleep/SleepSequence.ts';
import { SLEEP_AWAKE }                  from '../sleep/SleepSequence.ts';
import { GROUNDED }                     from '../utils/JumpMotionUtil.ts';
import type { WalkDirection }           from '../utils/WalkMotionUtil.ts';

export interface ActiveGesture {
  readonly name:                  GestureName;
  readonly mood:                  Mood;
  readonly startedAtMilliseconds: number;
  /** The grab's target, relative to the bottom tip, for Flint facing right. */
  readonly target:                Point | null;
  /** What the gesture's verdict answered at its moment; null before it. */
  readonly verdict:               boolean | null;
}

export interface ActiveEmote {
  readonly name:                  EmoteName;
  readonly startedAtMilliseconds: number;
}

export interface WanderState {
  readonly name:                  'wander';
  /** Where Flint walks to; null rests. */
  readonly walkToX:               number | null;
  readonly restUntilMilliseconds: number;
}

export interface SleepBehaviourState {
  readonly name: 'sleep';
}

/** The steps of `02-animations.md`, "Pop-in around a corner", in order. */
export type PopInStep = 'go' | 'go-behind' | 'wait' | 'peek' | 'duck' | 'peek-again' | 'wave' | 'move-in';

export interface VisitState {
  readonly name:                      'visit';
  readonly habitatId:                 string;
  /** The side of the box Flint comes around: 1 its right edge, -1 its left edge. It is also the way out of the box. */
  readonly edgeSide:                  Facing;
  /** Overlay units, measured on each frame, so the component drawn in front moves with the page. */
  readonly edgeX:                     number;
  readonly step:                      PopInStep;
  readonly stepStartedAtMilliseconds: number;
  /** The x of the body centre from the edge, positive outside the box. */
  readonly offsetUnits:               number;
}

export interface CopyState {
  readonly name:      'copy';
  readonly habitatId: string;
}

export interface CursorPlayState {
  readonly name:                       'cursor-play';
  readonly pointerMovedAtMilliseconds: number;
  /** A next grab waits for this time, so the hands do not snap shut without a pause. */
  readonly nextGrabAtMilliseconds:     number;
}

export interface CarriedState {
  readonly name:                  'carried';
  readonly startedAtMilliseconds: number;
  /** Where Flint lived when the drag started; null is its home. */
  readonly cameFromHabitatId:     string | null;
}

export interface DroppedState {
  readonly name:                 'dropped';
  readonly habitatId:            string;
  /** Null while Flint falls to the floor. */
  readonly landedAtMilliseconds: number | null;
}

export interface StrandedState {
  readonly name:                  'stranded';
  readonly startedAtMilliseconds: number;
  /** Null is its home. */
  readonly returnToHabitatId:     string | null;
}

export type BehaviourState =
  | WanderState
  | SleepBehaviourState
  | VisitState
  | CopyState
  | CursorPlayState
  | CarriedState
  | DroppedState
  | StrandedState;

export type BehaviourName = BehaviourState['name'];

/** An intent that waits for the next frame, with the habitat that a `visit` goes to, chosen when the intent was given. */
export interface PendingIntent {
  readonly intent:        SpriteIntent;
  readonly visitTargetId: string | null;
}

export interface SpriteMindState {
  readonly motion:                      MotionState;
  /** False until the first floor is seen, which places Flint in the middle of it. */
  readonly isPlaced:                    boolean;
  /** The habitat Flint lives in; null is its home. */
  readonly livesIn:                     string | null;
  readonly behaviour:                   BehaviourState;
  readonly gesture:                     ActiveGesture | null;
  readonly emote:                       ActiveEmote | null;
  readonly sleep:                       SleepState;
  readonly lastIntent:                  SpriteIntent | null;
  readonly pendingIntent:               PendingIntent | null;
  /** The cues of the habitat Flint lives in that the director has not seen, the most recent last. */
  readonly directorInbox:               readonly SpriteCue[];
  readonly recentCues:                  readonly SpriteCue[];
  readonly lastDirectorAskMilliseconds: number;
  readonly quietSinceMilliseconds:      number;
  /** The pop-in just waved, so the arrival's own wave is not repeated. */
  readonly greetedOnArrival:            boolean;
  /** True until Flint first moves on its own, so a stored habitat that registers late can still take it in. */
  readonly mayRestoreStoredHabitat:     boolean;
  readonly wanderSeed:                  number;
  /** The walk the host holds through `steer`, as a held arrow key does; the wander follows it while it is not 0. */
  readonly steeredWalk:                 WalkDirection;
}

export const INITIAL_MIND_STATE: SpriteMindState = Object.freeze({
  motion: Object.freeze({
    positionX: 0, floorY: 0, facing: 1, walkDirection: 0, jump: GROUNDED,
  }),
  isPlaced:                    false,
  livesIn:                     null,
  behaviour:                   Object.freeze({ name: 'wander', walkToX: null, restUntilMilliseconds: 0 }),
  gesture:                     null,
  emote:                       null,
  sleep:                       SLEEP_AWAKE,
  lastIntent:                  null,
  pendingIntent:               null,
  directorInbox:               Object.freeze([]),
  recentCues:                  Object.freeze([]),
  lastDirectorAskMilliseconds: 0,
  quietSinceMilliseconds:      0,
  greetedOnArrival:            false,
  mayRestoreStoredHabitat:     true,
  wanderSeed:                  WANDER_SEQUENCE.INITIAL_SEED,
  steeredWalk:                 0,
});
