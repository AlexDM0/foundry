/**
 * The default director: it follows the suggestions of the habitat Flint lives in. The newest new cue with a suggestion wins; with nothing
 * new, the first catalog behaviour whose `chosenWhenNothingIsNew` answers yes is chosen, and otherwise Flint rests.
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
