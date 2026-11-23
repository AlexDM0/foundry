/**
 * Sleep: Flint sleeps in its home, the host's corner. A Flint that lives elsewhere is
 * placed home first. `flint/sleep/SleepSequence.ts` draws the sleep itself; a cue, a click, a drag, a gesture or an emote wakes it, and on
 * the frame it sees the wake the sleep hands Flint to the rest.
 */
import { DIRECTOR }                             from '../../constants/Mind.ts';
import type { BehaviourPart }                   from '../../mind/BehaviourPart.ts';
import { PLAIN_BEHAVIOUR_PART }                 from '../../mind/BehaviourPart.ts';
import type { SpriteMindState }                 from '../../mind/MindState.ts';
import { withPlacedAtHome }                     from '../../mind/MindTransitions.ts';
import type { FrameTime, Perception }           from '../../mind/Perception.ts';
import { PlaceUtil }                            from '../../mind/utils/PlaceUtil.ts';
import { sleepStateFallingAsleep }              from '../../sleep/SleepSequence.ts';
import type { BehaviourStart, NothingNewFacts } from '../BehaviourDefinition.ts';
import { behaviourDefinition }                  from '../BehaviourDefinition.ts';
import { wanderAtRest }                         from '../wander/WanderBehaviour.ts';

export interface SleepBehaviourState {
  readonly name: 'sleep';
}

export function sleepStarted(state: SpriteMindState, start: BehaviourStart): SpriteMindState {
  if (state.behaviour.name === 'sleep' && state.sleep.phase === 'asleep') return state;
  const atHome = state.livesIn === null ? state : withPlacedAtHome(state, start.perception.home);
  return {
    ...atHome,
    behaviour:               { name: 'sleep' },
    gesture:                 null,
    emote:                   null,
    sleep:                   sleepStateFallingAsleep(state.sleep, start.elapsedMilliseconds),
    motion:                  { ...atHome.motion, walkDirection: 0 },
    mayRestoreStoredHabitat: false,
  };
}

export function sleepAfterFrame(state: SpriteMindState, perception: Perception, time: FrameTime): SpriteMindState {
  const { home } = perception;
  const held = home === null
    ? state
    : {
      ...state,
      motion: {
        ...state.motion, positionX: PlaceUtil.clampedToFloor(state.motion.positionX, home), floorY: home.floorY, walkDirection: 0 as const,
      },
    };
  return state.sleep.phase === 'asleep' ? held : { ...held, behaviour: wanderAtRest(time.elapsedMilliseconds) };
}

export function sleepBehaviourPartOf(): BehaviourPart {
  return PLAIN_BEHAVIOUR_PART;
}

/** A sleeping Flint sleeps on; an awake one goes home to sleep after the quiet time, when it has nowhere to visit and nothing to copy. */
function sleepIsChosen(facts: NothingNewFacts): boolean {
  return facts.isAsleep || facts.quietMilliseconds >= DIRECTOR.QUIET_BEFORE_SLEEP_MILLISECONDS;
}

export const SLEEP_BEHAVIOUR = behaviourDefinition({
  name:                   'sleep',
  intents:                ['sleep'],
  role:                   null,
  intentWhileRunning:     'laid-over-it',
  refusesItsOwnIntent:    false,
  intentKeepsTheQuiet:    true,
  asksDirector:           true,
  takesClicks:            true,
  takesSteering:          true,
  element:                'none',
  aimsItsOwnGestures:     false,
  chosenWhenNothingIsNew: sleepIsChosen,
  atRest:                 null,
  started:                sleepStarted,
  standingPlaceOf:        () => ({ kind: 'home' }),
  afterFrame:             (state, _own, perception, time) => sleepAfterFrame(state, perception, time),
  partOf:                 sleepBehaviourPartOf,
});
