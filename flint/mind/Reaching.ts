/**
 * A grab the host aims at an element (`perform('grab', element)`), as the playground's grab at its floating square: Flint turns to the
 * target once, when the grab starts, and its hands follow the target on each frame. Cursor play aims its own grabs at the pointer.
 */
import { HOVER }                from '../constants/Motion.ts';
import { IdleMotionUtil }       from '../utils/IdleMotionUtil.ts';
import type { SpriteMindState } from './MindState.ts';
import type { PerceivedPoint }  from './Perception.ts';
import { MovementUtil }         from './utils/MovementUtil.ts';

export function mindStateReachingFor(state: SpriteMindState, target: PerceivedPoint, elapsedMilliseconds: number, reducedMotion: boolean): SpriteMindState {
  const { gesture, motion, behaviour } = state;
  if (gesture?.name !== 'grab' || behaviour.name === 'cursor-play') return state;
  const facing = gesture.target === null ? MovementUtil.facingToward(motion.positionX, target.x, motion.facing) : motion.facing;
  const hover = reducedMotion ? HOVER.HEIGHT_UNITS : IdleMotionUtil.hoverHeightAt(elapsedMilliseconds);
  const originY = motion.floorY - motion.jump.height - hover;
  return {
    ...state,
    motion:  { ...motion, facing },
    gesture: { ...gesture, target: { x: (target.x - motion.positionX) * facing, y: target.y - originY } },
  };
}
