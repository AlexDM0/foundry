/**
 * How an intent of the fixed list changes the mind, from a director or the host's `perform`. The running behaviour's `intentWhileRunning`
 * decides what an intent does meanwhile; an intent that ends it starts from the rest, and a gesture that behaviour aimed itself ends with
 * it.
 */
import { intentAimsAtElement, intentMeaningOf }                         from '../IntentMeaning.ts';
import type { CatalogBehaviour }                                        from '../behaviours/BehaviourCatalog.ts';
import { behaviourDefinitionOf, behaviourOfIntent, restingBehaviourAt } from '../behaviours/BehaviourCatalog.ts';
import type { ElementUse }                                              from '../behaviours/BehaviourDefinition.ts';
import type { IntentName, PendingIntent, SpriteMindState }              from './MindState.ts';
import { withEmote, withGesture, withoutGesture }                       from './MindTransitions.ts';
import type { Perception }                                              from './Perception.ts';

export function behaviourTakesIntents(name: string): boolean {
  return behaviourDefinitionOf(name).intentWhileRunning !== 'dropped';
}

/** A behaviour that runs one at a time refuses its own intent while it runs, or while its intent already waits. */
export function intentIsRefused(state: SpriteMindState, intent: IntentName): boolean {
  const running = behaviourDefinitionOf(state.behaviour.name);
  const isRunning = running.refusesItsOwnIntent && running.intents.includes(intent);
  const intended = behaviourOfIntent(intent);
  const isWaiting = intended !== null && intended.refusesItsOwnIntent && state.pendingIntent?.intent === intent;
  return isRunning || isWaiting;
}

/** Whether `perform(intent, element)` gives the intent its element: a gesture that aims may take one, a behaviour as its definition says. */
export function elementUseOf(intent: IntentName): ElementUse {
  if (intentAimsAtElement(intent)) return 'optional';
  return behaviourOfIntent(intent)?.element ?? 'none';
}

function endsTheRunningBehaviour(running: CatalogBehaviour, intentStartsAGesture: boolean): boolean {
  return running.intentWhileRunning === 'ends-it' || (running.intentWhileRunning === 'gesture-ends-it' && intentStartsAGesture);
}

/**
 * An intent that asks for a behaviour Flint cannot start here (no visit target, nothing to copy) changes nothing but is remembered. Only
 * the rest's intent, which the rule director answers when nothing is new, keeps a stored habitat that has not registered yet.
 */
export function mindStateWithIntentApplied(state: SpriteMindState, pending: PendingIntent, perception: Perception, elapsedMilliseconds: number): SpriteMindState {
  const cleared = { ...state, pendingIntent: null };
  const running = behaviourDefinitionOf(state.behaviour.name);
  const { intent } = pending;
  if (running.intentWhileRunning === 'dropped' || intentIsRefused(cleared, intent)) return cleared;
  if (state.arrivalGreeting === intent) return { ...cleared, arrivalGreeting: null };
  const meaning = intentMeaningOf(intent);
  const intended = meaning.kind === 'behaviour' ? behaviourOfIntent(intent) : null;
  if (meaning.kind === 'behaviour' && intended === null) return cleared;
  const keepsTheQuiet = intended?.intentKeepsTheQuiet ?? false;
  const remembered: SpriteMindState = {
    ...cleared,
    lastIntent:              intent,
    arrivalGreeting:         null,
    mayRestoreStoredHabitat: intended?.role === 'rest' && state.mayRestoreStoredHabitat,
    quietSinceMilliseconds:  keepsTheQuiet ? state.quietSinceMilliseconds : elapsedMilliseconds,
  };
  const rested = { ...remembered, behaviour: restingBehaviourAt(elapsedMilliseconds) };
  const base = endsTheRunningBehaviour(running, meaning.kind === 'gesture') ? (running.aimsItsOwnGestures ? withoutGesture(rested) : rested) : remembered;

  if (meaning.kind === 'gesture') return withGesture(base, meaning.intent, elapsedMilliseconds);
  if (meaning.kind === 'emote') return withEmote(base, meaning.emote, elapsedMilliseconds);
  if (intended?.started === null || intended === null) return base;
  return intended.started(base, { perception, elapsedMilliseconds, visitTargetId: pending.visitTargetId });
}
