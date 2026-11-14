/**
 * The landing after a drop on a habitat (`03-behaviour-and-architecture.md`, "Pointer"): Flint falls from the pointer to the bottom edge of
 * the habitat's box, lands with the squash of a jump, looks around, and then lives there and hears `arrived`. Under reduced motion it is on
 * the floor at once.
 */
import { LOOK_AROUND }                                  from '../constants/Behaviours.ts';
import type { BehaviourPart }                           from '../mind/BehaviourPart.ts';
import type { DroppedState, SpriteMindState }           from '../mind/MindState.ts';
import { wanderAtRest, withArrival }                    from '../mind/MindTransitions.ts';
import type { FrameTime, PerceivedHabitat, Perception } from '../mind/Perception.ts';
import { PlaceUtil }                                    from '../mind/utils/PlaceUtil.ts';
import { GROUNDED, JumpMotionUtil }                     from '../utils/JumpMotionUtil.ts';

const LOOK_AROUND_MILLISECONDS = LOOK_AROUND.GLANCE_EYE_SHIFTS_UNITS.length * LOOK_AROUND.GLANCE_MILLISECONDS;

export function landingStarted(state: SpriteMindState, habitat: PerceivedHabitat, reducedMotion: boolean): SpriteMindState {
  const fallUnits = reducedMotion ? 0 : Math.max(0, habitat.box.floorY - state.motion.floorY);
  return {
    ...state,
    behaviour: { name: 'dropped', habitatId: habitat.id, landedAtMilliseconds: null },
    motion:    {
      ...state.motion,
      positionX: PlaceUtil.clampedToFloor(state.motion.positionX, habitat.box),
      floorY:    habitat.box.floorY,
      jump:      fallUnits > 0 ? { height: fallUnits, upwardSpeed: 0, landingRemainingMilliseconds: 0 } : GROUNDED,
    },
  };
}

export function landingAfterFrame(state: SpriteMindState, dropped: DroppedState, perception: Perception, time: FrameTime): SpriteMindState {
  const habitat = PlaceUtil.habitatById(perception, dropped.habitatId);
  if (habitat === null || !habitat.isRoomy) return { ...state, behaviour: wanderAtRest(time.elapsedMilliseconds) };
  const floored = { ...state, motion: { ...state.motion, positionX: PlaceUtil.clampedToFloor(state.motion.positionX, habitat.box), floorY: habitat.box.floorY } };
  if (JumpMotionUtil.isAirborne(state.motion.jump)) return floored;
  if (dropped.landedAtMilliseconds === null) return { ...floored, behaviour: { ...dropped, landedAtMilliseconds: time.elapsedMilliseconds } };
  if (time.elapsedMilliseconds - dropped.landedAtMilliseconds < LOOK_AROUND_MILLISECONDS) return floored;
  return withArrival(floored, habitat.id, time.elapsedMilliseconds, false);
}

export function landingPartOf(dropped: DroppedState, elapsedMilliseconds: number): BehaviourPart {
  const glance = dropped.landedAtMilliseconds === null
    ? undefined
    : LOOK_AROUND.GLANCE_EYE_SHIFTS_UNITS[Math.floor((elapsedMilliseconds - dropped.landedAtMilliseconds) / LOOK_AROUND.GLANCE_MILLISECONDS)];
  return {
    part:           glance === undefined ? null : { eyes: { shift: glance } },
    occlusion:      null,
    positionEasing: 'exact',
    blinkIsAllowed: false,
  };
}
