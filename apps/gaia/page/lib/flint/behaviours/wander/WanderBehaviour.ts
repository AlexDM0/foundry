/**
 * Wander, the rest every other behaviour ends in: Flint rests and walks between seeded points of its floor, while a gesture or an emote is
 * laid over it. In a box that keeps Flint inside, it walks to where all a gesture or emote draws fits before that plays.
 */
import { WALK }                                             from '../../constants/Motion.ts';
import type { BehaviourPart }                               from '../../mind/BehaviourPart.ts';
import { PLAIN_BEHAVIOUR_PART }                             from '../../mind/BehaviourPart.ts';
import type { ActiveEmote, ActiveGesture, SpriteMindState } from '../../mind/MindState.ts';
import { withWalking, withWokenUp }                         from '../../mind/MindTransitions.ts';
import type { FrameTime, Perception, PlaceBox }             from '../../mind/Perception.ts';
import { MovementUtil }                                     from '../../mind/utils/MovementUtil.ts';
import type { StandingRange }                               from '../../mind/utils/PlaceUtil.ts';
import { PlaceUtil }                                        from '../../mind/utils/PlaceUtil.ts';
import { SeededSequenceUtil }                               from '../../mind/utils/SeededSequenceUtil.ts';
import type { Stance }                                      from '../../mind/utils/StanceUtil.ts';
import { StanceUtil }                                       from '../../mind/utils/StanceUtil.ts';
import { sleepIsActive }                                    from '../../sleep/SleepSequence.ts';
import { WalkMotionUtil }                                   from '../../utils/WalkMotionUtil.ts';
import { behaviourDefinition }                              from '../BehaviourDefinition.ts';
import { WANDER }                                           from './constants/WanderValues.ts';

const { nextSeedOf, fractionOf } = SeededSequenceUtil;

export interface WanderState {
  readonly name:                  'wander';
  /** Where Flint walks to; null rests. */
  readonly walkToX:               number | null;
  readonly restUntilMilliseconds: number;
  /** How far above its floor Flint still is; absent until the first frame of the wander measures it. */
  readonly liftUnits?:            number;
  /** In a box that keeps Flint inside, what waits while Flint walks to where it fits; absent when nothing waits. */
  readonly deferredPlay?:         DeferredPlay;
}

/** A gesture and an emote laid over the rest that wait, each as it was given, so an intent given meanwhile waits beside them. */
interface DeferredPlay {
  readonly gesture: ActiveGesture | null;
  readonly emote:   ActiveEmote | null;
}

const NOTHING_DEFERRED: DeferredPlay = Object.freeze({ gesture: null, emote: null });

function wanderStateOf(walkToX: number | null, restUntilMilliseconds: number, liftUnits: number): WanderState {
  return {
    name: 'wander', walkToX, restUntilMilliseconds, liftUnits,
  };
}

/** A wander that rests first, for the shortest rest; its first frame measures how far above its floor Flint is. */
export function wanderAtRest(elapsedMilliseconds: number): WanderState {
  return { name: 'wander', walkToX: null, restUntilMilliseconds: elapsedMilliseconds + WANDER.REST_SHORTEST_MILLISECONDS };
}

function restUntilAfter(elapsedMilliseconds: number, seed: number): number {
  return elapsedMilliseconds + WANDER.REST_SHORTEST_MILLISECONDS + (fractionOf(seed) * WANDER.REST_SPREAD_MILLISECONDS);
}

function keepsFlintInside(state: SpriteMindState, perception: Perception): boolean {
  return PlaceUtil.habitatById(perception, state.livesIn)?.keepsFlintInside === true;
}

function restingRangeOf(state: SpriteMindState, perception: Perception, box: PlaceBox): StandingRange {
  return keepsFlintInside(state, perception) ? StanceUtil.restingRangeOf(box, state) : PlaceUtil.standingRangeOf(box);
}

function clampedToRange(positionX: number, range: StandingRange): number {
  return Math.min(range.highestX, Math.max(range.lowestX, positionX));
}

/** What plays or waits: a gesture or an emote given since it was deferred replaces the one that waits, as it would replace one that plays. */
function playOf(state: SpriteMindState, deferred: DeferredPlay): DeferredPlay {
  return { gesture: state.gesture ?? deferred.gesture, emote: state.emote ?? deferred.emote };
}

/** The play that waited starts again from its beginning, now that Flint stands where it fits. */
function withPlayResumed(state: SpriteMindState, play: DeferredPlay, elapsedMilliseconds: number): SpriteMindState {
  const gesture = state.gesture ?? (play.gesture === null ? null : { ...play.gesture, startedAtMilliseconds: elapsedMilliseconds, verdict: null });
  const emote = state.emote ?? (play.emote === null ? null : { ...play.emote, startedAtMilliseconds: elapsedMilliseconds });
  return { ...state, gesture, emote };
}

/** In a box that keeps Flint inside, where a gesture or an emote laid over the rest fits nearest to where Flint stands; null elsewhere. */
function playingStanceOf(state: SpriteMindState, perception: Perception, box: PlaceBox): Stance | null {
  const extent = StanceUtil.playingExtentOf(state);
  if (extent === null || !keepsFlintInside(state, perception)) return null;
  return StanceUtil.stanceOf(box, extent, state.motion, state.motion.positionX);
}

export function wanderAfterFrame(state: SpriteMindState, wander: WanderState, perception: Perception, time: FrameTime): SpriteMindState {
  const box = PlaceUtil.boxWhereFlintLives(state, perception);
  if (box === null) return withWalking(state, 0);
  const measuredLiftUnits = wander.liftUnits ?? MovementUtil.liftAbove(state.motion.floorY, box.floorY);
  const liftUnits = MovementUtil.loweredLiftOf(measuredLiftUnits, time.deltaMilliseconds, perception.reducedMotion);
  const play = playOf(state, wander.deferredPlay ?? NOTHING_DEFERRED);
  const { positionX } = state.motion;
  const range = restingRangeOf(state, perception, box);
  const heldX = clampedToRange(positionX, range);
  const lowered = wanderStateOf(wander.walkToX, wander.restUntilMilliseconds, liftUnits);
  const stance = state.steeredWalk === 0 ? playingStanceOf({ ...state, ...play }, perception, box) : null;
  const floored = { ...state, motion: { ...state.motion, floorY: box.floorY - liftUnits } };
  if (stance !== null) {
    const steppedX = perception.reducedMotion ? stance.standX : MovementUtil.stepToward(positionX, stance.standX, WALK.SPEED_UNITS_PER_SECOND, time.deltaMilliseconds);
    const resting = wanderStateOf(null, wander.restUntilMilliseconds, liftUnits);
    const waiting: WanderState = { ...resting, deferredPlay: play };
    if (steppedX === stance.standX) {
      const playing = withPlayResumed(floored, play, time.elapsedMilliseconds);
      return withWalking({ ...playing, motion: { ...playing.motion, positionX: steppedX, facing: stance.facing }, behaviour: resting }, 0);
    }
    // Until Flint stands there nothing it reaches with shows, since it would show over the box's edge.
    const walking = withWalking({ ...floored, gesture: null, emote: null }, MovementUtil.directionToward(positionX, stance.standX));
    return { ...walking, motion: { ...walking.motion, positionX: steppedX }, behaviour: waiting };
  }
  const standing = withPlayResumed(floored, play, time.elapsedMilliseconds);
  if (perception.reducedMotion) return withWalking({ ...standing, motion: { ...standing.motion, positionX: heldX }, behaviour: lowered }, 0);
  if (state.steeredWalk !== 0) {
    const walking = withWalking(standing, state.steeredWalk);
    const steppedX = WalkMotionUtil.positionAfterStep(positionX, state.steeredWalk, time.deltaMilliseconds, range.lowestX, range.highestX);
    const resting = wanderStateOf(null, time.elapsedMilliseconds + WANDER.REST_SHORTEST_MILLISECONDS, liftUnits);
    return { ...walking, motion: { ...walking.motion, positionX: steppedX }, behaviour: resting };
  }
  const isOffItsFloor = heldX !== positionX;
  const isBusy = standing.gesture !== null || standing.emote !== null || sleepIsActive(state.sleep);
  if (isBusy && !isOffItsFloor) return withWalking({ ...standing, behaviour: wanderStateOf(null, wander.restUntilMilliseconds, liftUnits) }, 0);

  let seed = state.sequenceSeed;
  let { walkToX, restUntilMilliseconds } = wander;
  if (isOffItsFloor) {
    walkToX = heldX;
  } else if (walkToX === null && time.elapsedMilliseconds >= restUntilMilliseconds) {
    seed = nextSeedOf(seed);
    const pickedX = range.lowestX + (fractionOf(seed) * (range.highestX - range.lowestX));
    if (Math.abs(pickedX - positionX) >= WANDER.SHORTEST_WALK_UNITS) walkToX = pickedX;
    else restUntilMilliseconds = restUntilAfter(time.elapsedMilliseconds, seed);
  }
  if (walkToX === null) return withWalking({ ...standing, sequenceSeed: seed, behaviour: wanderStateOf(walkToX, restUntilMilliseconds, liftUnits) }, 0);

  const targetX = clampedToRange(walkToX, range);
  const steppedX = MovementUtil.stepToward(positionX, targetX, WALK.SPEED_UNITS_PER_SECOND, time.deltaMilliseconds);
  const walking = withWalking(standing, MovementUtil.directionToward(positionX, targetX));
  if (steppedX !== targetX) {
    return {
      ...walking, sequenceSeed: seed, motion: { ...walking.motion, positionX: steppedX }, behaviour: wanderStateOf(targetX, restUntilMilliseconds, liftUnits)
    };
  }
  seed = nextSeedOf(seed);
  return {
    ...withWalking(walking, 0),
    sequenceSeed: seed,
    motion:       { ...walking.motion, positionX: steppedX, walkDirection: 0 },
    behaviour:    wanderStateOf(null, restUntilAfter(time.elapsedMilliseconds, seed), liftUnits),
  };
}

export function wanderPartOf(): BehaviourPart {
  return PLAIN_BEHAVIOUR_PART;
}

export const WANDER_BEHAVIOUR = behaviourDefinition({
  name:                   'wander',
  intents:                ['wander'],
  role:                   'rest',
  intentWhileRunning:     'laid-over-it',
  refusesItsOwnIntent:    false,
  intentKeepsTheQuiet:    true,
  asksDirector:           true,
  takesClicks:            true,
  takesSteering:          true,
  element:                'none',
  aimsItsOwnGestures:     false,
  chosenWhenNothingIsNew: null,
  atRest:                 wanderAtRest,
  // The rule director answers the wander whenever nothing is new, so its intent only wakes Flint; a gesture or a copy goes on.
  started:                (state, start) => withWokenUp(state, start.elapsedMilliseconds),
  standingPlaceOf:        () => null,
  afterFrame:             wanderAfterFrame,
  partOf:                 wanderPartOf,
});
