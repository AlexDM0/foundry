/**
 * Carried: while the user drags Flint, it hangs below the pointer and is nervous. The drop decides what
 * comes next: on a roomy habitat Flint falls to its floor (`flint/behaviours/landing/`); on no habitat it is stranded
 * (`flint/behaviours/stranded/`).
 */
import { BODY_SHAPE }                              from '../../constants/BodyShape.ts';
import { carriedPartOf }                           from '../../emotes/nervous/CarriedPose.ts';
import type { BehaviourPart }                      from '../../mind/BehaviourPart.ts';
import type { SpriteMindState }                    from '../../mind/MindState.ts';
import { withWalking, withWokenUp }                from '../../mind/MindTransitions.ts';
import type { Perception }                         from '../../mind/Perception.ts';
import { PlaceUtil }                               from '../../mind/utils/PlaceUtil.ts';
import { GROUNDED }                                from '../../utils/JumpMotionUtil.ts';
import type { BehaviourPartInput, BehaviourStart } from '../BehaviourDefinition.ts';
import { behaviourDefinition }                     from '../BehaviourDefinition.ts';
import { landingStarted }                          from '../landing/LandingBehaviour.ts';
import { strandedStarted }                         from '../stranded/StrandedBehaviour.ts';
import { CARRIED }                                 from './constants/CarriedValues.ts';

export interface CarriedState {
  readonly name:                  'carried';
  readonly startedAtMilliseconds: number;
  /** Where Flint lived when the drag started; null is its home. */
  readonly cameFromHabitatId:     string | null;
}

export function carriedStarted(state: SpriteMindState, start: BehaviourStart): SpriteMindState {
  const { elapsedMilliseconds } = start;
  const woken = withWalking(withWokenUp(state, elapsedMilliseconds), 0);
  const carried: CarriedState = { name: 'carried', startedAtMilliseconds: elapsedMilliseconds, cameFromHabitatId: state.livesIn };
  return {
    ...woken,
    behaviour:               carried,
    gesture:                 null,
    emote:                   null,
    motion:                  { ...woken.motion, jump: GROUNDED },
    mayRestoreStoredHabitat: false,
  };
}

/** The top tip of the body hangs just below the pointer; the floor is set so, with no hover. */
export function carriedAfterFrame(state: SpriteMindState, perception: Perception): SpriteMindState {
  const { pointer } = perception;
  if (pointer === null) return state;
  return { ...state, motion: { ...state.motion, positionX: pointer.x, floorY: pointer.y + CARRIED.HANG_GAP_UNITS + BODY_SHAPE.HEIGHT_UNITS } };
}

/** A drop on a roomy habitat lands there; any other drop, or a cancelled drag, strands Flint. */
export function carriedDropped(state: SpriteMindState, carried: CarriedState, habitatId: string | null, perception: Perception, elapsedMilliseconds: number): SpriteMindState {
  const habitat = PlaceUtil.habitatById(perception, habitatId);
  if (habitat === null || !habitat.isRoomy) return strandedStarted(state, carried.cameFromHabitatId, elapsedMilliseconds);
  return landingStarted(state, habitat, perception.reducedMotion);
}

export function carriedBehaviourPartOf(carried: CarriedState, input: BehaviourPartInput): BehaviourPart {
  const nervous = carriedPartOf({
    carriedMilliseconds: input.elapsedMilliseconds - carried.startedAtMilliseconds,
    facing:              input.state.motion.facing,
    reducedMotion:       input.reducedMotion,
  });
  return {
    part: {
      ...nervous,
      body:        { ...nervous.body, hover: 0 },
      exactFields: [...(nervous.exactFields ?? []), 'hover'],
    },
    occlusion:      null,
    positionEasing: 'exact',
    blinkIsAllowed: false,
  };
}

export const CARRIED_BEHAVIOUR = behaviourDefinition({
  name:                   'carried',
  intents:                [],
  role:                   'drag',
  intentWhileRunning:     'dropped',
  refusesItsOwnIntent:    false,
  intentKeepsTheQuiet:    false,
  asksDirector:           false,
  takesClicks:            false,
  takesSteering:          false,
  element:                'none',
  aimsItsOwnGestures:     false,
  chosenWhenNothingIsNew: null,
  atRest:                 null,
  started:                carriedStarted,
  standingPlaceOf:        () => ({ kind: 'in-the-air' }),
  afterFrame:             (state, _carried, perception) => carriedAfterFrame(state, perception),
  droppedOn:              carriedDropped,
  partOf:                 carriedBehaviourPartOf,
});
