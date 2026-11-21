/**
 * The landing after a drop on a habitat (`03-behaviour-and-architecture.md`, "Pointer"): Flint falls from the pointer to the bottom edge of
 * the habitat's box, lands with the squash of a jump, looks around, and then lives there and hears `arrived`. Under reduced motion it is on
 * the floor at once. Only the drag starts it, through `landingStarted`.
 */
import type { BehaviourPart }                           from '../../mind/BehaviourPart.ts';
import type { SpriteMindState }                         from '../../mind/MindState.ts';
import type { FrameTime, PerceivedHabitat, Perception } from '../../mind/Perception.ts';
import { PlaceUtil }                                    from '../../mind/utils/PlaceUtil.ts';
import { GROUNDED, JumpMotionUtil }                     from '../../utils/JumpMotionUtil.ts';
import { withArrival }                                  from '../Arrival.ts';
import type { BehaviourPartInput }                      from '../BehaviourDefinition.ts';
import { behaviourDefinition }                          from '../BehaviourDefinition.ts';
import { wanderAtRest }                                 from '../wander/WanderBehaviour.ts';
import { LOOK_AROUND }                                  from './constants/LandingValues.ts';

export interface LandingState {
  readonly name:                 'landing';
  readonly habitatId:            string;
  /** Null while Flint falls to the floor. */
  readonly landedAtMilliseconds: number | null;
}

const LOOK_AROUND_MILLISECONDS = LOOK_AROUND.GLANCE_EYE_SHIFTS_UNITS.length * LOOK_AROUND.GLANCE_MILLISECONDS;

export function landingStarted(state: SpriteMindState, habitat: PerceivedHabitat, reducedMotion: boolean): SpriteMindState {
  const fallUnits = reducedMotion ? 0 : Math.max(0, habitat.box.floorY - state.motion.floorY);
  const landing: LandingState = { name: 'landing', habitatId: habitat.id, landedAtMilliseconds: null };
  return {
    ...state,
    behaviour: landing,
    motion:    {
      ...state.motion,
      positionX: PlaceUtil.clampedToFloor(state.motion.positionX, habitat.box),
      floorY:    habitat.box.floorY,
      jump:      fallUnits > 0 ? { height: fallUnits, upwardSpeed: 0, landingRemainingMilliseconds: 0 } : GROUNDED,
    },
  };
}

export function landingAfterFrame(state: SpriteMindState, landing: LandingState, perception: Perception, time: FrameTime): SpriteMindState {
  const habitat = PlaceUtil.habitatById(perception, landing.habitatId);
  if (habitat === null || !habitat.isRoomy) return { ...state, behaviour: wanderAtRest(time.elapsedMilliseconds) };
  const floored = { ...state, motion: { ...state.motion, positionX: PlaceUtil.clampedToFloor(state.motion.positionX, habitat.box), floorY: habitat.box.floorY } };
  if (JumpMotionUtil.isAirborne(state.motion.jump)) return floored;
  if (landing.landedAtMilliseconds === null) {
    const landed: LandingState = { ...landing, landedAtMilliseconds: time.elapsedMilliseconds };
    return { ...floored, behaviour: landed };
  }
  if (time.elapsedMilliseconds - landing.landedAtMilliseconds < LOOK_AROUND_MILLISECONDS) return floored;
  return withArrival(floored, habitat.id, time.elapsedMilliseconds, null);
}

export function landingPartOf(landing: LandingState, input: BehaviourPartInput): BehaviourPart {
  const glance = landing.landedAtMilliseconds === null
    ? undefined
    : LOOK_AROUND.GLANCE_EYE_SHIFTS_UNITS[Math.floor((input.elapsedMilliseconds - landing.landedAtMilliseconds) / LOOK_AROUND.GLANCE_MILLISECONDS)];
  return {
    part:           glance === undefined ? null : { eyes: { shift: glance } },
    occlusion:      null,
    positionEasing: 'exact',
    blinkIsAllowed: false,
  };
}

export const LANDING_BEHAVIOUR = behaviourDefinition({
  name:                   'landing',
  intents:                [],
  role:                   null,
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
  started:                null,
  standingPlaceOf:        (landing: LandingState) => ({ kind: 'habitat', habitatId: landing.habitatId }),
  afterFrame:             landingAfterFrame,
  partOf:                 landingPartOf,
});
