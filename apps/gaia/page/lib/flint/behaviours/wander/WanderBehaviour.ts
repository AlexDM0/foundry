/**
 * Wander: Flint rests, then walks to another point of its floor, and rests again. It walks
 * only while it does nothing else, and under reduced motion it stands still. Its points come from the seeded sequence in the mind's state,
 * so a run is the same each time. A walk the host steers wins over the wander's own walk. It is the rest: every other behaviour ends in it,
 * and its intent only wakes Flint, while a gesture or an emote is laid over it. A Flint that a behaviour left above its floor comes down
 * at the body rate, while the floor itself follows its box at once. In a box that keeps Flint inside it rests far enough from the walls
 * for its attendants, and a gesture or an emote laid over it waits while Flint walks to where all it draws fits, and then plays there,
 * turned the way it fits.
 */
import { WALK }                                 from '../../constants/Motion.ts';
import type { BehaviourPart }                   from '../../mind/BehaviourPart.ts';
import { PLAIN_BEHAVIOUR_PART }                 from '../../mind/BehaviourPart.ts';
import type { SpriteMindState }                 from '../../mind/MindState.ts';
import { withWalking, withWokenUp }             from '../../mind/MindTransitions.ts';
import type { FrameTime, Perception, PlaceBox } from '../../mind/Perception.ts';
import { MovementUtil }                         from '../../mind/utils/MovementUtil.ts';
import type { StandingRange }                   from '../../mind/utils/PlaceUtil.ts';
import { PlaceUtil }                            from '../../mind/utils/PlaceUtil.ts';
import { SeededSequenceUtil }                   from '../../mind/utils/SeededSequenceUtil.ts';
import type { Stance }                          from '../../mind/utils/StanceUtil.ts';
import { StanceUtil }                           from '../../mind/utils/StanceUtil.ts';
import { sleepIsActive }                        from '../../sleep/SleepSequence.ts';
import { WalkMotionUtil }                       from '../../utils/WalkMotionUtil.ts';
import { behaviourDefinition }                  from '../BehaviourDefinition.ts';
import { WANDER }                               from './constants/WanderValues.ts';

const { nextSeedOf, fractionOf } = SeededSequenceUtil;

export interface WanderState {
  readonly name:                  'wander';
  /** Where Flint walks to; null rests. */
  readonly walkToX:               number | null;
  readonly restUntilMilliseconds: number;
  /** How far above its floor Flint still is; absent until the first frame of the wander measures it. */
  readonly liftUnits?:            number;
}

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

/** The gesture, or else the emote, waits as the intent it came from, and starts again once Flint stands where it fits. */
function withPlayingDeferred(state: SpriteMindState): SpriteMindState {
  if (state.gesture !== null) return { ...state, gesture: null, pendingIntent: { intent: state.gesture.intent, visitTargetId: null } };
  if (state.emote !== null) return { ...state, emote: null, pendingIntent: { intent: state.emote.name, visitTargetId: null } };
  return state;
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
  const standing = { ...state, motion: { ...state.motion, floorY: box.floorY - liftUnits } };
  const { positionX } = state.motion;
  const range = restingRangeOf(state, perception, box);
  const heldX = clampedToRange(positionX, range);
  const lowered = wanderStateOf(wander.walkToX, wander.restUntilMilliseconds, liftUnits);
  const stance = state.steeredWalk === 0 ? playingStanceOf(state, perception, box) : null;
  if (stance !== null) {
    const steppedX = perception.reducedMotion ? stance.standX : MovementUtil.stepToward(positionX, stance.standX, WALK.SPEED_UNITS_PER_SECOND, time.deltaMilliseconds);
    const resting = wanderStateOf(null, wander.restUntilMilliseconds, liftUnits);
    if (steppedX === stance.standX) {
      return withWalking({ ...standing, motion: { ...standing.motion, positionX: steppedX, facing: stance.facing }, behaviour: resting }, 0);
    }
    // Until Flint stands there nothing it reaches with shows, since it would show over the box's edge.
    const walking = withWalking(withPlayingDeferred(standing), MovementUtil.directionToward(positionX, stance.standX));
    return { ...walking, motion: { ...walking.motion, positionX: steppedX }, behaviour: resting };
  }
  if (perception.reducedMotion) return withWalking({ ...standing, motion: { ...standing.motion, positionX: heldX }, behaviour: lowered }, 0);
  if (state.steeredWalk !== 0) {
    const walking = withWalking(standing, state.steeredWalk);
    const steppedX = WalkMotionUtil.positionAfterStep(positionX, state.steeredWalk, time.deltaMilliseconds, range.lowestX, range.highestX);
    const resting = wanderStateOf(null, time.elapsedMilliseconds + WANDER.REST_SHORTEST_MILLISECONDS, liftUnits);
    return { ...walking, motion: { ...walking.motion, positionX: steppedX }, behaviour: resting };
  }
  const isOffItsFloor = heldX !== positionX;
  const isBusy = state.gesture !== null || state.emote !== null || sleepIsActive(state.sleep);
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
