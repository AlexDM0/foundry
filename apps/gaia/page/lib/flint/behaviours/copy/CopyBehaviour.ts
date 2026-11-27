/**
 * Copy: Flint walks below the element the habitat's `copyTargetFor` names, an agent's row, and shows that agent's state with the gesture of
 * its intent. In a box that keeps Flint inside, the gesture's declared extent decides where Flint stands and which way it faces.
 */
import { gestureIntentOf }      from '../../IntentMeaning.ts';
import type { Facing }          from '../../SpriteGeometry.ts';
import { WALK }                 from '../../constants/Motion.ts';
import type { GestureIntent }   from '../../gestures/GestureCatalog.ts';
import type { BehaviourPart }   from '../../mind/BehaviourPart.ts';
import { PLAIN_BEHAVIOUR_PART } from '../../mind/BehaviourPart.ts';
import type { SpriteMindState } from '../../mind/MindState.ts';
import {
  withGesture,
  withoutGesture,
  withWalking,
  withWokenUp
} from '../../mind/MindTransitions.ts';
import type { FrameTime, PerceivedHabitat, Perception } from '../../mind/Perception.ts';
import { MovementUtil }                                 from '../../mind/utils/MovementUtil.ts';
import { PlaceUtil }                                    from '../../mind/utils/PlaceUtil.ts';
import { StanceUtil }                                   from '../../mind/utils/StanceUtil.ts';
import type { BehaviourStart, NothingNewFacts }         from '../BehaviourDefinition.ts';
import { behaviourDefinition }                          from '../BehaviourDefinition.ts';
import { wanderAtRest }                                 from '../wander/WanderBehaviour.ts';
import { COPY }                                         from './constants/CopyValues.ts';

export interface CopyState {
  readonly name:      'copy';
  readonly habitatId: string;
}

/** The habitat Flint lives in offers something to copy; otherwise the copy does not start. */
export function copyStarted(state: SpriteMindState, start: BehaviourStart): SpriteMindState {
  const habitat = PlaceUtil.habitatById(start.perception, state.livesIn);
  if (habitat === null || habitat.copyTarget === null) return state;
  const copy: CopyState = { name: 'copy', habitatId: habitat.id };
  return { ...withWokenUp(state, start.elapsedMilliseconds), behaviour: copy };
}

/** Where Flint stands to copy, and which way it faces there; null keeps the facing it walked in with. */
interface CopyStance {
  readonly standX: number;
  readonly facing: Facing | null;
}

/** Below the target; in a box that keeps Flint inside, where all it draws with the gesture fits nearest the target, turned if that is nearer. */
function copyStanceOf(state: SpriteMindState, habitat: PerceivedHabitat, targetX: number, gestureIntent: GestureIntent): CopyStance {
  if (!habitat.keepsFlintInside) return { standX: PlaceUtil.clampedToFloor(targetX, habitat.box), facing: null };
  return StanceUtil.stanceOf(habitat.box, StanceUtil.extentWithGestureOf(state, gestureIntent), state.motion, targetX);
}

function copyEnded(state: SpriteMindState, elapsedMilliseconds: number): SpriteMindState {
  return withWalking(withoutGesture({ ...state, behaviour: wanderAtRest(elapsedMilliseconds) }), 0);
}

export function copyAfterFrame(state: SpriteMindState, copy: CopyState, perception: Perception, time: FrameTime): SpriteMindState {
  const habitat = PlaceUtil.habitatById(perception, copy.habitatId);
  if (habitat === null || state.livesIn !== copy.habitatId || habitat.copyTarget === null) return copyEnded(state, time.elapsedMilliseconds);
  const gestureIntent = gestureIntentOf(habitat.copyTarget.intent);
  if (gestureIntent === null) return copyEnded(state, time.elapsedMilliseconds);
  const stance = copyStanceOf(state, habitat, habitat.copyTarget.centreX, gestureIntent);
  const { standX } = stance;
  const { positionX } = state.motion;
  const floored = { ...state, motion: { ...state.motion, floorY: habitat.box.floorY } };
  const isThere = Math.abs(standX - positionX) <= COPY.STANDING_TOLERANCE_UNITS;
  if (isThere || perception.reducedMotion) {
    // An extent that just fits the box leaves no room for the tolerance, so Flint stands exactly where the stance says.
    const heldX = isThere && stance.facing === null ? positionX : standX;
    const standing = withWalking({ ...floored, motion: { ...floored.motion, positionX: heldX } }, 0);
    const turned = stance.facing === null ? standing : { ...standing, motion: { ...standing.motion, facing: stance.facing } };
    return withGesture(turned, gestureIntent, time.elapsedMilliseconds);
  }
  const walking = withWalking(floored, MovementUtil.directionToward(positionX, standX));
  return { ...walking, motion: { ...walking.motion, positionX: MovementUtil.stepToward(positionX, standX, WALK.SPEED_UNITS_PER_SECOND, time.deltaMilliseconds) } };
}

export function copyPartOf(): BehaviourPart {
  return PLAIN_BEHAVIOUR_PART;
}

/** An awake Flint copies what its habitat offers, when it has nowhere to visit. */
function copyIsChosen(facts: NothingNewFacts): boolean {
  return !facts.isAsleep && facts.copyIsOffered;
}

export const COPY_BEHAVIOUR = behaviourDefinition({
  name:                   'copy',
  intents:                ['copy'],
  role:                   null,
  intentWhileRunning:     'gesture-ends-it',
  refusesItsOwnIntent:    false,
  intentKeepsTheQuiet:    false,
  asksDirector:           true,
  takesClicks:            true,
  takesSteering:          true,
  element:                'none',
  aimsItsOwnGestures:     false,
  chosenWhenNothingIsNew: copyIsChosen,
  atRest:                 null,
  started:                copyStarted,
  standingPlaceOf:        () => null,
  afterFrame:             copyAfterFrame,
  partOf:                 copyPartOf,
});
