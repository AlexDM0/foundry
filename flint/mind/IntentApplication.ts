/**
 * How an intent of the fixed list changes the mind, from a director or the host's `perform`. Only a behaviour that can be interrupted takes
 * one: wander, sleep and copy. A reflex (cursor play, carried) and a visit or a landing finish first, and an intent given then is dropped.
 */
import { intentMeaningOf }                                    from '../IntentMeaning.ts';
import { copyStarted }                                        from '../behaviours/CopyBehaviour.ts';
import { sleepStarted }                                       from '../behaviours/SleepBehaviour.ts';
import { visitStarted }                                       from '../behaviours/VisitBehaviour.ts';
import type { BehaviourName, PendingIntent, SpriteMindState } from './MindState.ts';
import {
  wanderAtRest,
  withEmote,
  withGesture,
  withWokenUp
} from './MindTransitions.ts';
import type { Perception } from './Perception.ts';
import { PlaceUtil }       from './utils/PlaceUtil.ts';

const BEHAVIOURS_THAT_TAKE_INTENTS: readonly BehaviourName[] = ['wander', 'sleep', 'copy'];

export function behaviourTakesIntents(name: BehaviourName): boolean {
  return BEHAVIOURS_THAT_TAKE_INTENTS.includes(name);
}

/**
 * An intent that asks for a behaviour Flint cannot start here (no visit target, nothing to copy) changes nothing but is remembered. Only
 * `wander`, which the rule director answers when nothing is new, keeps a stored habitat that has not registered yet.
 */
export function mindStateWithIntentApplied(state: SpriteMindState, pending: PendingIntent, perception: Perception, elapsedMilliseconds: number): SpriteMindState {
  const cleared = { ...state, pendingIntent: null };
  if (!behaviourTakesIntents(state.behaviour.name)) return cleared;
  const { intent } = pending;
  if (intent === 'wave' && state.greetedOnArrival) return { ...cleared, greetedOnArrival: false };
  const isIdleIntent = intent === 'wander' || intent === 'sleep';
  const remembered: SpriteMindState = {
    ...cleared,
    lastIntent:              intent,
    greetedOnArrival:        false,
    mayRestoreStoredHabitat: intent === 'wander' && state.mayRestoreStoredHabitat,
    quietSinceMilliseconds:  isIdleIntent ? state.quietSinceMilliseconds : elapsedMilliseconds,
  };
  const meaning = intentMeaningOf(intent);
  const stillBehaviour = remembered.behaviour.name === 'wander' ? { ...remembered, behaviour: { ...remembered.behaviour, walkToX: null } } : remembered;

  if (meaning.kind === 'gesture') {
    const leftCopy = remembered.behaviour.name === 'copy' ? { ...stillBehaviour, behaviour: wanderAtRest(elapsedMilliseconds) } : stillBehaviour;
    return withGesture(leftCopy, meaning.gesture, meaning.mood, elapsedMilliseconds);
  }
  if (meaning.kind === 'emote') return withEmote(stillBehaviour, meaning.emote, elapsedMilliseconds);
  switch (meaning.behaviour) {
    case 'wander':
      // The rule director answers `wander` whenever nothing is new, so it only wakes Flint; a copy and a gesture go on.
      return withWokenUp(remembered, elapsedMilliseconds);
    case 'sleep':
      return sleepStarted(remembered, perception, elapsedMilliseconds);
    case 'visit': {
      const target = PlaceUtil.habitatById(perception, pending.visitTargetId);
      if (target === null || !target.isRoomy || target.id === remembered.livesIn) return remembered;
      return visitStarted(remembered, target, perception, elapsedMilliseconds);
    }
    case 'copy': {
      const habitat = PlaceUtil.habitatById(perception, remembered.livesIn);
      if (habitat?.copyTarget === null || habitat === null) return remembered;
      return copyStarted(remembered, habitat.id, elapsedMilliseconds);
    }
  }
}
