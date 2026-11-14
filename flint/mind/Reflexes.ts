/**
 * The reflexes that run on each frame before any intent (`03-behaviour-and-architecture.md`, "The mind"): Flint finds its first floor or
 * its stored habitat, hears cues, leaves a habitat that is gone or too small, and answers the pointer. A reflex never waits for a director
 * and wins over it.
 */
import { carriedDropped, carriedStarted }              from '../behaviours/CarriedBehaviour.ts';
import { cursorPlayStarted }                           from '../behaviours/CursorPlayBehaviour.ts';
import { DIRECTOR }                                    from '../constants/Behaviours.ts';
import type { BehaviourName, SpriteMindState }         from './MindState.ts';
import { wanderAtRest, withPlacedAtHome, withWokenUp } from './MindTransitions.ts';
import type { Perception }                             from './Perception.ts';
import { PlaceUtil }                                   from './utils/PlaceUtil.ts';

/** Where a click starts cursor play; elsewhere (a visit, a landing, a drag) the click is ignored. */
const BEHAVIOURS_A_CLICK_INTERRUPTS: readonly BehaviourName[] = ['wander', 'sleep', 'copy', 'cursor-play'];

/** The behaviours that keep Flint where it is although the habitat it lives in is gone: it is not standing there. */
const BEHAVIOURS_AWAY_FROM_HOME_FLOOR: readonly BehaviourName[] = ['visit', 'carried', 'dropped', 'stranded'];

function lastOf<Item>(items: readonly Item[], count: number): readonly Item[] {
  return items.length <= count ? items : items.slice(items.length - count);
}

/** On its first floor Flint stands in the middle; a stored habitat that is on the page takes Flint in before it moves on its own. */
export function mindStatePlaced(state: SpriteMindState, perception: Perception): SpriteMindState {
  const stored = PlaceUtil.habitatById(perception, perception.storedHabitatId);
  if (state.mayRestoreStoredHabitat && stored !== null && state.livesIn === null) {
    return {
      ...state,
      livesIn:                 stored.id,
      isPlaced:                true,
      mayRestoreStoredHabitat: false,
      motion:                  { ...state.motion, positionX: PlaceUtil.middleOf(stored.box), floorY: stored.box.floorY },
    };
  }
  if (state.isPlaced) return state;
  const box = PlaceUtil.boxWhereFlintLives(state, perception);
  if (box === null) return state;
  return { ...state, isPlaced: true, motion: { ...state.motion, positionX: PlaceUtil.middleOf(box), floorY: box.floorY } };
}

/** Any cue wakes Flint and ends the quiet; the cues of the habitat it lives in wait for the director. */
export function mindStateAfterCues(state: SpriteMindState, perception: Perception, elapsedMilliseconds: number): SpriteMindState {
  if (perception.cues.length === 0) return state;
  const heard = perception.cues.filter((cue) => cue.habitatId === state.livesIn).map((cue) => cue.cue);
  return {
    ...withWokenUp(state, elapsedMilliseconds),
    quietSinceMilliseconds: elapsedMilliseconds,
    directorInbox:          [...state.directorInbox, ...heard],
    recentCues:             lastOf([...state.recentCues, ...heard], DIRECTOR.RECENT_CUE_LIMIT),
  };
}

/** A habitat that left the page or became smaller than the minimum sends Flint home. */
export function mindStateKeepingItsPlace(state: SpriteMindState, perception: Perception, elapsedMilliseconds: number): SpriteMindState {
  if (state.livesIn === null || BEHAVIOURS_AWAY_FROM_HOME_FLOOR.includes(state.behaviour.name)) return state;
  const habitat = PlaceUtil.habitatById(perception, state.livesIn);
  if (habitat !== null && habitat.isRoomy) return state;
  const behaviour = state.behaviour.name === 'sleep' ? state.behaviour : wanderAtRest(elapsedMilliseconds);
  return {
    ...withPlacedAtHome(state, perception.home), behaviour, gesture: null, directorInbox: [], recentCues: [],
  };
}

export function mindStateAfterHappenings(state: SpriteMindState, perception: Perception, elapsedMilliseconds: number): SpriteMindState {
  return perception.happenings.reduce((current: SpriteMindState, happening): SpriteMindState => {
    const { behaviour } = current;
    if (happening.kind === 'drag-started') {
      return behaviour.name === 'carried' ? current : { ...carriedStarted(current, elapsedMilliseconds), quietSinceMilliseconds: elapsedMilliseconds };
    }
    if (happening.kind === 'dropped') {
      return behaviour.name === 'carried' ? carriedDropped(current, behaviour, happening.habitatId, perception, elapsedMilliseconds) : current;
    }
    if (!BEHAVIOURS_A_CLICK_INTERRUPTS.includes(behaviour.name)) return current;
    return { ...cursorPlayStarted(current, elapsedMilliseconds), quietSinceMilliseconds: elapsedMilliseconds };
  }, state);
}
