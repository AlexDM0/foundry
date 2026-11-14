/**
 * Wander (`03-behaviour-and-architecture.md`, "The mind"): Flint rests, then walks to another point of its floor, and rests again. It walks
 * only while it does nothing else, and under reduced motion it stands still. Its points come from a seeded sequence in the mind's state,
 * so a run is the same each time. A walk the host steers wins over the wander's own walk.
 */
import { WANDER, WANDER_SEQUENCE }           from '../constants/Behaviours.ts';
import { WALK }                              from '../constants/Motion.ts';
import type { BehaviourPart }                from '../mind/BehaviourPart.ts';
import { PLAIN_BEHAVIOUR_PART }              from '../mind/BehaviourPart.ts';
import type { SpriteMindState, WanderState } from '../mind/MindState.ts';
import { wanderAtRest, withWalking }         from '../mind/MindTransitions.ts';
import type { FrameTime, Perception }        from '../mind/Perception.ts';
import { MovementUtil }                      from '../mind/utils/MovementUtil.ts';
import { PlaceUtil }                         from '../mind/utils/PlaceUtil.ts';
import { sleepIsActive }                     from '../sleep/SleepSequence.ts';
import { WalkMotionUtil }                    from '../utils/WalkMotionUtil.ts';

function nextSeedOf(seed: number): number {
  return ((seed * WANDER_SEQUENCE.MULTIPLIER) + WANDER_SEQUENCE.INCREMENT) % WANDER_SEQUENCE.MODULUS;
}

function fractionOf(seed: number): number {
  return seed / WANDER_SEQUENCE.MODULUS;
}

function restUntilAfter(elapsedMilliseconds: number, seed: number): number {
  return elapsedMilliseconds + WANDER.REST_SHORTEST_MILLISECONDS + (fractionOf(seed) * WANDER.REST_SPREAD_MILLISECONDS);
}

export function wanderAfterFrame(state: SpriteMindState, wander: WanderState, perception: Perception, time: FrameTime): SpriteMindState {
  const box = PlaceUtil.boxWhereFlintLives(state, perception);
  if (box === null) return withWalking(state, 0);
  const standing = { ...state, motion: { ...state.motion, floorY: box.floorY } };
  const { positionX } = state.motion;
  const heldX = PlaceUtil.clampedToFloor(positionX, box);
  if (perception.reducedMotion) return withWalking({ ...standing, motion: { ...standing.motion, positionX: heldX } }, 0);
  if (state.steeredWalk !== 0) {
    const range = PlaceUtil.standingRangeOf(box);
    const walking = withWalking(standing, state.steeredWalk);
    const steppedX = WalkMotionUtil.positionAfterStep(positionX, state.steeredWalk, time.deltaMilliseconds, range.lowestX, range.highestX);
    return { ...walking, motion: { ...walking.motion, positionX: steppedX }, behaviour: wanderAtRest(time.elapsedMilliseconds) };
  }
  const isOffItsFloor = heldX !== positionX;
  const isBusy = state.gesture !== null || state.emote !== null || sleepIsActive(state.sleep);
  if (isBusy && !isOffItsFloor) return withWalking({ ...standing, behaviour: { ...wander, walkToX: null } }, 0);

  let seed = state.wanderSeed;
  let { walkToX, restUntilMilliseconds } = wander;
  if (isOffItsFloor) {
    walkToX = heldX;
  } else if (walkToX === null && time.elapsedMilliseconds >= restUntilMilliseconds) {
    seed = nextSeedOf(seed);
    const range = PlaceUtil.standingRangeOf(box);
    const pickedX = range.lowestX + (fractionOf(seed) * (range.highestX - range.lowestX));
    if (Math.abs(pickedX - positionX) >= WANDER.SHORTEST_WALK_UNITS) walkToX = pickedX;
    else restUntilMilliseconds = restUntilAfter(time.elapsedMilliseconds, seed);
  }
  if (walkToX === null) return withWalking({ ...standing, wanderSeed: seed, behaviour: { ...wander, walkToX, restUntilMilliseconds } }, 0);

  const targetX = PlaceUtil.clampedToFloor(walkToX, box);
  const steppedX = MovementUtil.stepToward(positionX, targetX, WALK.SPEED_UNITS_PER_SECOND, time.deltaMilliseconds);
  const walking = withWalking(standing, MovementUtil.directionToward(positionX, targetX));
  if (steppedX !== targetX) {
    return {
      ...walking, wanderSeed: seed, motion: { ...walking.motion, positionX: steppedX }, behaviour: { ...wander, walkToX: targetX, restUntilMilliseconds }
    };
  }
  seed = nextSeedOf(seed);
  return {
    ...withWalking(walking, 0),
    wanderSeed: seed,
    motion:     { ...walking.motion, positionX: steppedX, walkDirection: 0 },
    behaviour:  { ...wander, walkToX: null, restUntilMilliseconds: restUntilAfter(time.elapsedMilliseconds, seed) },
  };
}

export function wanderPartOf(): BehaviourPart {
  return PLAIN_BEHAVIOUR_PART;
}
