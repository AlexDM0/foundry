/**
 * A drop on no habitat: Flint stays where the user let go and shows the Doubt emote; then
 * it goes back to the habitat it came from, around that habitat's corner, or to its home. Only the drag starts it, through
 * `strandedStarted`.
 */
import { emoteDefinitionOf }           from '../../IntentMeaning.ts';
import type { BehaviourPart }          from '../../mind/BehaviourPart.ts';
import { PLAIN_BEHAVIOUR_PART }        from '../../mind/BehaviourPart.ts';
import type { SpriteMindState }        from '../../mind/MindState.ts';
import { withEmote, withPlacedAtHome } from '../../mind/MindTransitions.ts';
import type { FrameTime, Perception }  from '../../mind/Perception.ts';
import { PlaceUtil }                   from '../../mind/utils/PlaceUtil.ts';
import { behaviourDefinition }         from '../BehaviourDefinition.ts';
import { visitStarted }                from '../visit/VisitBehaviour.ts';
import { wanderAtRest }                from '../wander/WanderBehaviour.ts';

export interface StrandedState {
  readonly name:                  'stranded';
  readonly startedAtMilliseconds: number;
  /** Null is its home. */
  readonly returnToHabitatId:     string | null;
}

export function strandedStarted(state: SpriteMindState, returnToHabitatId: string | null, elapsedMilliseconds: number): SpriteMindState {
  const stranded: StrandedState = { name: 'stranded', startedAtMilliseconds: elapsedMilliseconds, returnToHabitatId };
  return { ...withEmote(state, 'doubt', elapsedMilliseconds), behaviour: stranded };
}

export function strandedAfterFrame(state: SpriteMindState, stranded: StrandedState, perception: Perception, time: FrameTime): SpriteMindState {
  if (time.elapsedMilliseconds - stranded.startedAtMilliseconds < emoteDefinitionOf('doubt').durationMilliseconds) return state;
  const habitat = PlaceUtil.habitatById(perception, stranded.returnToHabitatId);
  if (habitat !== null && habitat.isRoomy) return visitStarted(state, habitat, perception, time.elapsedMilliseconds);
  return { ...withPlacedAtHome(state, perception.home), behaviour: wanderAtRest(time.elapsedMilliseconds) };
}

export function strandedPartOf(): BehaviourPart {
  return { ...PLAIN_BEHAVIOUR_PART, blinkIsAllowed: false };
}

export const STRANDED_BEHAVIOUR = behaviourDefinition({
  name:                   'stranded',
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
  standingPlaceOf:        () => ({ kind: 'in-the-air' }),
  afterFrame:             strandedAfterFrame,
  partOf:                 strandedPartOf,
});
