/**
 * A gesture the host aims at an element (`perform(intent, element)`), as the playground's grab at its floating square: Flint turns to the
 * centre of the target's box once, when the gesture starts, and its hands follow it on each frame. A behaviour that aims its own gestures,
 * as cursor play aims its grabs at the pointer, is left to them.
 */
import { intendedGestureOf }     from '../IntentMeaning.ts';
import { behaviourDefinitionOf } from '../behaviours/BehaviourCatalog.ts';
import { HOVER }                 from '../constants/Motion.ts';
import { IdleMotionUtil }        from '../utils/IdleMotionUtil.ts';
import type { SpriteMindState }  from './MindState.ts';
import type { PlaceBox }         from './Perception.ts';
import { MovementUtil }          from './utils/MovementUtil.ts';

export function mindStateReachingFor(state: SpriteMindState, targetBox: PlaceBox, elapsedMilliseconds: number, reducedMotion: boolean): SpriteMindState {
  const { gesture, motion, behaviour } = state;
  if (gesture === null || !intendedGestureOf(gesture.intent).definition.aimsAtElement || behaviourDefinitionOf(behaviour.name).aimsItsOwnGestures) return state;
  const target = { x: (targetBox.leftX + targetBox.rightX) / 2, y: (targetBox.topY + targetBox.floorY) / 2 };
  const facing = gesture.target === null ? MovementUtil.facingToward(motion.positionX, target.x, motion.facing) : motion.facing;
  const hover = reducedMotion ? HOVER.HEIGHT_UNITS : IdleMotionUtil.hoverHeightAt(elapsedMilliseconds);
  const originY = motion.floorY - motion.jump.height - hover;
  return {
    ...state,
    motion:  { ...motion, facing },
    gesture: { ...gesture, target: { x: (target.x - motion.positionX) * facing, y: target.y - originY } },
  };
}
