/**
 * Sleep (`03-behaviour-and-architecture.md`, "The mind"): Flint sleeps in its home, the host's corner. A Flint that lives elsewhere is
 * placed home first. `flint/sleep/SleepSequence.ts` draws the sleep itself; a cue, a click or a drag ends it, through the reflexes.
 */
import type { BehaviourPart }      from '../mind/BehaviourPart.ts';
import { PLAIN_BEHAVIOUR_PART }    from '../mind/BehaviourPart.ts';
import type { SpriteMindState }    from '../mind/MindState.ts';
import { withPlacedAtHome }        from '../mind/MindTransitions.ts';
import type { Perception }         from '../mind/Perception.ts';
import { PlaceUtil }               from '../mind/utils/PlaceUtil.ts';
import { sleepStateFallingAsleep } from '../sleep/SleepSequence.ts';

export function sleepStarted(state: SpriteMindState, perception: Perception, elapsedMilliseconds: number): SpriteMindState {
  if (state.behaviour.name === 'sleep') return state;
  const atHome = state.livesIn === null ? state : withPlacedAtHome(state, perception.home);
  return {
    ...atHome,
    behaviour:               { name: 'sleep' },
    gesture:                 null,
    emote:                   null,
    sleep:                   sleepStateFallingAsleep(state.sleep, elapsedMilliseconds),
    motion:                  { ...atHome.motion, walkDirection: 0 },
    mayRestoreStoredHabitat: false,
  };
}

export function sleepAfterFrame(state: SpriteMindState, perception: Perception): SpriteMindState {
  const { home } = perception;
  if (home === null) return state;
  return {
    ...state,
    motion: {
      ...state.motion, positionX: PlaceUtil.clampedToFloor(state.motion.positionX, home), floorY: home.floorY, walkDirection: 0
    }
  };
}

export function sleepBehaviourPartOf(): BehaviourPart {
  return PLAIN_BEHAVIOUR_PART;
}
