/**
 * A drop on no habitat (`03-behaviour-and-architecture.md`, "Pointer"): Flint stays where the user let go and shows the Doubt emote; then
 * it goes back to the habitat it came from, around that habitat's corner, or to its home.
 */
import { EMOTE_CATALOG }                             from '../emotes/EmoteCatalog.ts';
import type { BehaviourPart }                        from '../mind/BehaviourPart.ts';
import { PLAIN_BEHAVIOUR_PART }                      from '../mind/BehaviourPart.ts';
import type { SpriteMindState, StrandedState }       from '../mind/MindState.ts';
import { wanderAtRest, withEmote, withPlacedAtHome } from '../mind/MindTransitions.ts';
import type { FrameTime, Perception }                from '../mind/Perception.ts';
import { PlaceUtil }                                 from '../mind/utils/PlaceUtil.ts';
import { visitStarted }                              from './VisitBehaviour.ts';

export function strandedStarted(state: SpriteMindState, returnToHabitatId: string | null, elapsedMilliseconds: number): SpriteMindState {
  return { ...withEmote(state, 'doubt', elapsedMilliseconds), behaviour: { name: 'stranded', startedAtMilliseconds: elapsedMilliseconds, returnToHabitatId } };
}

export function strandedAfterFrame(state: SpriteMindState, stranded: StrandedState, perception: Perception, time: FrameTime): SpriteMindState {
  if (time.elapsedMilliseconds - stranded.startedAtMilliseconds < EMOTE_CATALOG.doubt.durationMilliseconds) return state;
  const habitat = PlaceUtil.habitatById(perception, stranded.returnToHabitatId);
  if (habitat !== null && habitat.isRoomy) return visitStarted(state, habitat, perception, time.elapsedMilliseconds);
  return { ...withPlacedAtHome(state, perception.home), behaviour: wanderAtRest(time.elapsedMilliseconds) };
}

export function strandedPartOf(): BehaviourPart {
  return { ...PLAIN_BEHAVIOUR_PART, blinkIsAllowed: false };
}
