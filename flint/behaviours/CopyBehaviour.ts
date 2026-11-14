/**
 * Copy (`03-behaviour-and-architecture.md`, "The mind"): Flint walks below the element the habitat's `copyTargetFor` names, an agent's row,
 * and copies that agent's state with the gesture of its intent. A new intent changes the gesture; a target that is gone, or an intent that
 * is not a gesture, ends the copy.
 */
import { intentMeaningOf }                 from '../IntentMeaning.ts';
import { COPY }                            from '../constants/Behaviours.ts';
import { WALK }                            from '../constants/Motion.ts';
import type { BehaviourPart }              from '../mind/BehaviourPart.ts';
import { PLAIN_BEHAVIOUR_PART }            from '../mind/BehaviourPart.ts';
import type { CopyState, SpriteMindState } from '../mind/MindState.ts';
import {
  wanderAtRest,
  withGesture,
  withoutGesture,
  withWalking,
  withWokenUp
} from '../mind/MindTransitions.ts';
import type { FrameTime, Perception } from '../mind/Perception.ts';
import { MovementUtil }               from '../mind/utils/MovementUtil.ts';
import { PlaceUtil }                  from '../mind/utils/PlaceUtil.ts';

export function copyStarted(state: SpriteMindState, habitatId: string, elapsedMilliseconds: number): SpriteMindState {
  return { ...withWokenUp(state, elapsedMilliseconds), behaviour: { name: 'copy', habitatId } };
}

function copyEnded(state: SpriteMindState, elapsedMilliseconds: number): SpriteMindState {
  return withWalking(withoutGesture({ ...state, behaviour: wanderAtRest(elapsedMilliseconds) }), 0);
}

export function copyAfterFrame(state: SpriteMindState, copy: CopyState, perception: Perception, time: FrameTime): SpriteMindState {
  const habitat = PlaceUtil.habitatById(perception, copy.habitatId);
  if (habitat === null || state.livesIn !== copy.habitatId || habitat.copyTarget === null) return copyEnded(state, time.elapsedMilliseconds);
  const meaning = intentMeaningOf(habitat.copyTarget.intent);
  if (meaning.kind !== 'gesture') return copyEnded(state, time.elapsedMilliseconds);
  const standX = PlaceUtil.clampedToFloor(habitat.copyTarget.centreX, habitat.box);
  const { positionX } = state.motion;
  const floored = { ...state, motion: { ...state.motion, floorY: habitat.box.floorY } };
  const isThere = Math.abs(standX - positionX) <= COPY.STANDING_TOLERANCE_UNITS;
  if (isThere || perception.reducedMotion) {
    const standing = withWalking({ ...floored, motion: { ...floored.motion, positionX: isThere ? positionX : standX } }, 0);
    return withGesture(standing, meaning.gesture, meaning.mood, time.elapsedMilliseconds);
  }
  const walking = withWalking(floored, MovementUtil.directionToward(positionX, standX));
  return { ...walking, motion: { ...walking.motion, positionX: MovementUtil.stepToward(positionX, standX, WALK.SPEED_UNITS_PER_SECOND, time.deltaMilliseconds) } };
}

export function copyPartOf(): BehaviourPart {
  return PLAIN_BEHAVIOUR_PART;
}
