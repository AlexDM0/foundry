/**
 * What each intent of the fixed list asks of Flint: a gesture in the form its intent names, an emote, or else a behaviour, which the mind
 * finds in the behaviour catalog. It reads the gesture and emote catalogs, so it names no gesture and no emote; it sits below the
 * behaviours, which read it too.
 */
import type { DrawnExtent }                   from './SpriteGeometry.ts';
import type { EmoteName }                     from './emotes/EmoteCatalog.ts';
import { EMOTE_CATALOG }                      from './emotes/EmoteCatalog.ts';
import type { EmoteDefinition }               from './emotes/EmoteDefinition.ts';
import type { CatalogGesture, GestureIntent } from './gestures/GestureCatalog.ts';
import { GESTURE_CATALOG, GESTURE_INTENTS }   from './gestures/GestureCatalog.ts';
import type { GestureForm }                   from './gestures/GestureDefinition.ts';
import type { IntentName }                    from './mind/MindState.ts';

export type IntentMeaning =
  | { readonly kind: 'behaviour'; readonly behaviour: IntentName }
  | { readonly kind: 'gesture'; readonly intent: GestureIntent }
  | { readonly kind: 'emote'; readonly emote: EmoteName };

/** The gesture an intent starts, and the form of it that the intent names. */
export interface IntendedGesture {
  readonly definition: CatalogGesture;
  readonly form:       GestureForm;
}

function isEmoteName(intent: IntentName): intent is EmoteName {
  return EMOTE_CATALOG.some((definition) => definition.name === intent);
}

/** The gesture intent this is, or null when it starts no gesture. */
export function gestureIntentOf(intent: IntentName): GestureIntent | null {
  return GESTURE_INTENTS.find((gestureIntent) => gestureIntent === intent) ?? null;
}

export function intentMeaningOf(intent: IntentName): IntentMeaning {
  if (isEmoteName(intent)) return { kind: 'emote', emote: intent };
  const gestureIntent = gestureIntentOf(intent);
  return gestureIntent === null ? { kind: 'behaviour', behaviour: intent } : { kind: 'gesture', intent: gestureIntent };
}

export function intendedGestureOf(intent: GestureIntent): IntendedGesture {
  const catalog: readonly CatalogGesture[] = GESTURE_CATALOG;
  for (const definition of catalog) {
    const form = Object.hasOwn(definition.intents, intent) ? definition.intents[intent] : undefined;
    if (form !== undefined) return { definition, form };
  }
  throw new RangeError(`no gesture of the catalog answers the intent ${intent}`);
}

export function emoteDefinitionOf(name: EmoteName): EmoteDefinition {
  const definition = EMOTE_CATALOG.find((candidate) => candidate.name === name);
  if (definition === undefined) throw new RangeError(`the emote catalog has no ${name}`);
  return definition;
}

/** A gesture intent that `perform(intent, element)` aims at the element's centre. */
export function intentAimsAtElement(intent: IntentName): boolean {
  const gestureIntent = gestureIntentOf(intent);
  return gestureIntent !== null && intendedGestureOf(gestureIntent).definition.aimsAtElement;
}

/** All that Flint draws while it plays the intent, its body included: a gesture's form or an emote; null for a behaviour. */
export function intentExtentOf(intent: IntentName): DrawnExtent | null {
  const meaning = intentMeaningOf(intent);
  if (meaning.kind === 'gesture') return intendedGestureOf(meaning.intent).form.extent;
  return meaning.kind === 'emote' ? emoteDefinitionOf(meaning.emote).extent : null;
}
