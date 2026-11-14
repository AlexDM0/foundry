/**
 * Carried (`02-animations.md`, "Carried"): while the user drags Flint, it hangs below the pointer and is nervous. The drop decides what
 * comes next: on a roomy habitat Flint falls to its floor (`flint/behaviours/LandingBehaviour.ts`); on no habitat it is stranded
 * (`flint/behaviours/StrandedBehaviour.ts`).
 */
import { CARRIED }                            from '../constants/Behaviours.ts';
import { BODY_SHAPE }                         from '../constants/BodyShape.ts';
import { carriedPartOf }                      from '../emotes/CarriedPose.ts';
import type { BehaviourPart }                 from '../mind/BehaviourPart.ts';
import type { CarriedState, SpriteMindState } from '../mind/MindState.ts';
import { withWalking, withWokenUp }           from '../mind/MindTransitions.ts';
import type { Perception }                    from '../mind/Perception.ts';
import { PlaceUtil }                          from '../mind/utils/PlaceUtil.ts';
import { GROUNDED }                           from '../utils/JumpMotionUtil.ts';
import { landingStarted }                     from './LandingBehaviour.ts';
import { strandedStarted }                    from './StrandedBehaviour.ts';

export function carriedStarted(state: SpriteMindState, elapsedMilliseconds: number): SpriteMindState {
  const woken = withWalking(withWokenUp(state, elapsedMilliseconds), 0);
  return {
    ...woken,
    behaviour:               { name: 'carried', startedAtMilliseconds: elapsedMilliseconds, cameFromHabitatId: state.livesIn },
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

export function carriedBehaviourPartOf(carried: CarriedState, state: SpriteMindState, elapsedMilliseconds: number, reducedMotion: boolean): BehaviourPart {
  const nervous = carriedPartOf({ carriedMilliseconds: elapsedMilliseconds - carried.startedAtMilliseconds, facing: state.motion.facing, reducedMotion });
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
