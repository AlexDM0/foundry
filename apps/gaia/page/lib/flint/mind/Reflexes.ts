/**
 * The reflexes that run on each frame before any intent: Flint finds its first floor or
 * its stored habitat, hears cues, leaves a habitat that is gone or too small, and answers the pointer. A reflex never waits for a director
 * and wins over it.
 */
import { behaviourDefinitionOf, behaviourOfRole, restingBehaviourAt } from '../behaviours/BehaviourCatalog.ts';
import { DIRECTOR }                                                   from '../constants/Mind.ts';
import type { SpriteMindState }                                       from './MindState.ts';
import { withPlacedAtHome, withWokenUp }                              from './MindTransitions.ts';
import type { Perception }                                            from './Perception.ts';
import { PlaceUtil }                                                  from './utils/PlaceUtil.ts';

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

/**
 * A habitat that left the page or became smaller than the minimum sends Flint home to rest; a behaviour that stands elsewhere (a visit,
 * a landing, in the air) keeps Flint where it is, since it is not standing there.
 */
export function mindStateKeepingItsPlace(state: SpriteMindState, perception: Perception, elapsedMilliseconds: number): SpriteMindState {
  const { behaviour } = state;
  if (state.livesIn === null || behaviourDefinitionOf(behaviour.name).standingPlaceOf(behaviour) !== null) return state;
  const habitat = PlaceUtil.habitatById(perception, state.livesIn);
  if (habitat !== null && habitat.isRoomy) return state;
  return {
    ...withPlacedAtHome(state, perception.home), behaviour: restingBehaviourAt(elapsedMilliseconds), gesture: null, directorInbox: [], recentCues: [],
  };
}

/** Starts the behaviour of a role; the drag and the click behaviours always start, so a missing `started` is a defect of the catalog. */
function startedByRole(state: SpriteMindState, role: 'drag' | 'click', perception: Perception, elapsedMilliseconds: number): SpriteMindState {
  const { started } = behaviourOfRole(role);
  if (started === null) throw new RangeError(`the ${role} behaviour of the catalog gives no start`);
  return { ...started(state, { perception, elapsedMilliseconds, visitTargetId: null }), quietSinceMilliseconds: elapsedMilliseconds };
}

/** A drag starts the drag behaviour wherever Flint is, and its drop is that behaviour's; a click starts the click behaviour where it may. */
export function mindStateAfterHappenings(state: SpriteMindState, perception: Perception, elapsedMilliseconds: number): SpriteMindState {
  return perception.happenings.reduce((current: SpriteMindState, happening): SpriteMindState => {
    const { behaviour } = current;
    const running = behaviourDefinitionOf(behaviour.name);
    if (happening.kind === 'drag-started') return running.role === 'drag' ? current : startedByRole(current, 'drag', perception, elapsedMilliseconds);
    if (happening.kind === 'dropped') return running.droppedOn?.(current, behaviour, happening.habitatId, perception, elapsedMilliseconds) ?? current;
    return running.takesClicks ? startedByRole(current, 'click', perception, elapsedMilliseconds) : current;
  }, state);
}
