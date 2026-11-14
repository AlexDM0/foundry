/**
 * The default director (`03-behaviour-and-architecture.md`, "The mind"): it follows the suggestions of the habitat Flint lives in. The
 * newest new cue that has a suggestion wins. With nothing new, the first behaviour of the catalog whose `chosenWhenNothingIsNew` answers
 * yes is chosen (a sleeping Flint sleeps on, an awake one visits the visit target, copies what its habitat offers, and after the quiet time
 * goes home to sleep); otherwise Flint rests. The copy follows the habitat's state, so a Flint that arrives while an agent already works
 * copies it too.
 */
import type { Director, PerceptionDigest, SpriteIntent } from '../SpriteHabitat.ts';
import { isSpriteIntent }                                from '../SpriteHabitat.ts';
import { BEHAVIOUR_CATALOG, behaviourOfRole }            from '../behaviours/BehaviourCatalog.ts';
import type { CatalogBehaviour }                         from '../behaviours/BehaviourCatalog.ts';

function firstIntentOf(definition: CatalogBehaviour): SpriteIntent | null {
  const [intent] = definition.intents;
  return intent !== undefined && isSpriteIntent(intent) ? intent : null;
}

export function ruleDirectorIntentOf(digest: PerceptionDigest): SpriteIntent {
  for (const cue of [...digest.newCues].reverse()) {
    const suggestion = digest.suggestions.find((candidate) => candidate.when === cue);
    if (suggestion !== undefined) return suggestion.respond;
  }
  const catalog: readonly CatalogBehaviour[] = BEHAVIOUR_CATALOG;
  const chosen = catalog.find((definition) => definition.chosenWhenNothingIsNew?.(digest) === true);
  const intent = firstIntentOf(chosen ?? behaviourOfRole('rest'));
  if (intent === null) throw new RangeError('the chosen behaviour of the catalog has no intent');
  return intent;
}

export const RULE_DIRECTOR: Director = Object.freeze({ nextIntent: ruleDirectorIntentOf });
