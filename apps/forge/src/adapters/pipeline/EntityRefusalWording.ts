import type { EntityRefusal } from '../../lib/tracker-model/utils/EntityValidationUtil.ts';

/**
 * Why a pipeline's entities cannot be stored, as the pipeline file reports the first refusal and a `pipeline-draft-invalid` refusal
 * carries it as its reason; a client shows each refusal of the entities step with it.
 */
function reasonOf(refusal: EntityRefusal): string {
  switch (refusal.reason) {
    case 'more-than-one-root':
      return `the entities ${refusal.entityKeys.join(', ')} are each of kind root, and one at most is`;
    case 'equal-homes':
      return `the entities ${refusal.entityKeys.join(', ')} share the home ${JSON.stringify(refusal.home)}`;
    case 'reach-inside-another-home':
      return `entities.${refusal.entityKey}.reach names ${JSON.stringify(refusal.reachPath)}, which reaches into the home of the entity ${refusal.ownerKey}; `
        + 'reach names only paths the root entity owns';
    case 'unknown-whitelist-key':
      return `entities.${refusal.entityKey}.whitelist names ${JSON.stringify(refusal.unknownKey)}, which is not an entity`;
    case 'unknown-dependency-key':
      return `entities.${refusal.entityKey}.dependsOn names ${JSON.stringify(refusal.unknownKey)}, which is not an entity`;
    case 'whitelisted-entity-not-package':
      return `entities.${refusal.entityKey}.whitelist names ${JSON.stringify(refusal.whitelistedKey)}, which is not a package`;
    case 'whitelisted-package-without-review':
      return `entities.${refusal.entityKey}.whitelist names ${JSON.stringify(refusal.whitelistedKey)}, a package without a review`;
    case 'dependency-circle':
      return `the entities ${[...refusal.entityKeys, refusal.entityKeys[0]].join(' -> ')} depend on each other in a circle`;
  }
}

export const EntityRefusalWording = Object.freeze({ reasonOf });
