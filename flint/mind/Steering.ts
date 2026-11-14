/**
 * The host's direct control of Flint, as the arrow keys and the space bar of the playground: a held walk, a jump, a turn, and a rest that
 * ends the gesture. Steering is a reflex: it wakes a sleeping Flint and ends a copy, and a visit, a drag or a landing ignores it.
 */
import type { FlintSteering }                  from '../SpriteHabitat.ts';
import type { BehaviourName, SpriteMindState } from './MindState.ts';
import {
  wanderAtRest,
  withJump,
  withoutGesture,
  withWalking,
  withWokenUp
} from './MindTransitions.ts';

const BEHAVIOURS_THAT_TAKE_STEERING: readonly BehaviourName[] = ['wander', 'sleep', 'copy', 'cursor-play'];

function wanderingOf(state: SpriteMindState, elapsedMilliseconds: number): SpriteMindState {
  const woken = withWokenUp(state, elapsedMilliseconds);
  return {
    ...woken,
    behaviour:               woken.behaviour.name === 'wander' ? woken.behaviour : wanderAtRest(elapsedMilliseconds),
    quietSinceMilliseconds:  elapsedMilliseconds,
    mayRestoreStoredHabitat: false,
  };
}

/** Under reduced motion, a jump is ignored: Flint holds still poses. */
export function mindStateSteered(state: SpriteMindState, steering: FlintSteering, elapsedMilliseconds: number, reducedMotion: boolean): SpriteMindState {
  if (!BEHAVIOURS_THAT_TAKE_STEERING.includes(state.behaviour.name)) return state;
  const wandering = wanderingOf(state, elapsedMilliseconds);
  switch (steering) {
    case 'walk-left':
      return { ...wandering, steeredWalk: -1 };
    case 'walk-right':
      return { ...wandering, steeredWalk: 1 };
    case 'stop-walking':
      return withWalking({ ...wandering, steeredWalk: 0, behaviour: wanderAtRest(elapsedMilliseconds) }, 0);
    case 'jump':
      return reducedMotion ? wandering : withJump(wandering);
    case 'face-left':
      return { ...wandering, motion: { ...wandering.motion, facing: -1 } };
    case 'face-right':
      return { ...wandering, motion: { ...wandering.motion, facing: 1 } };
    case 'rest':
      return withWalking(withoutGesture({ ...wandering, steeredWalk: 0, behaviour: wanderAtRest(elapsedMilliseconds) }), 0);
  }
}
