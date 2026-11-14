/**
 * The end of a visit or a landing: Flint now lives in the habitat and rests there; the habitat hears `arrived` in place of the cues of the
 * place it left. It is shared by the behaviours that arrive, beside them, since it starts the rest.
 */
import { ARRIVED_CUE }          from '../constants/Mind.ts';
import type { SpriteMindState } from '../mind/MindState.ts';
import { wanderAtRest }         from './wander/WanderBehaviour.ts';

/** `greeting` is the intent the arrival itself carried out, as the wave of a pop-in, so an answer to `arrived` does not repeat it. */
export function withArrival(state: SpriteMindState, habitatId: string, elapsedMilliseconds: number, greeting: string | null): SpriteMindState {
  return {
    ...state,
    livesIn:                 habitatId,
    behaviour:               wanderAtRest(elapsedMilliseconds),
    directorInbox:           [ARRIVED_CUE],
    recentCues:              [ARRIVED_CUE],
    arrivalGreeting:         greeting,
    mayRestoreStoredHabitat: false,
  };
}
