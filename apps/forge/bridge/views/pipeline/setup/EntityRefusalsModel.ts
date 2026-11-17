/**
 * The entities step's refusals, pure: the verdicts `EntityValidationUtil` gives the entities the step shows, the same check the stored
 * pipeline gets, each in User's words with the entity it is shown on and, where one gesture resolves it, that gesture's edits. So every
 * refusal shows before Continue, never as a refused Apply.
 */
import type { EntityKey }                           from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineDraftEdit }                   from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { PipelineEntities }                    from '../../../../src/lib/tracker-model/utils/EntityOwnershipUtil.ts';
import { EntityValidationUtil, type EntityRefusal } from '../../../../src/lib/tracker-model/utils/EntityValidationUtil.ts';
import { EntitiesStepModel }                        from './EntitiesStepModel.ts';

export interface EntityRefusalFix {
  readonly label: string;
  readonly edits: readonly PipelineDraftEdit[];
}

export interface EntityRefusalView {
  /** The refusal in User's words. */
  readonly text:      string;
  /** The entity whose row shows the refusal: Show opens it. */
  readonly entityKey: EntityKey;
  readonly fix:       EntityRefusalFix | null;
}

/** "web and admin", "web, admin and docs". */
function listTextOf(keys: readonly EntityKey[]): string {
  if (keys.length <= 1) return keys.join('');
  return `${keys.slice(0, -1).join(', ')} and ${keys.at(-1) ?? ''}`;
}

function takeOffFixOf(entities: PipelineEntities, entityKey: EntityKey, whitelistedKey: EntityKey): EntityRefusalFix {
  return { label: `Take ${whitelistedKey} off`, edits: [EntitiesStepModel.whitelistRemovedEditOf(entities, entityKey, whitelistedKey)] };
}

/** The last entity that shares the home gives it up, when it keeps another home. */
function equalHomesFixOf(entities: PipelineEntities, home: string, entityKeys: readonly EntityKey[]): EntityRefusalFix | null {
  const lastKey = entityKeys.at(-1);
  if (lastKey === undefined) return null;
  const shownHome = home.replace(/^\/+/u, '');
  const edit = EntitiesStepModel.homeRemovedEditOf(entities, lastKey, shownHome === '' ? home : shownHome);
  return edit === null ? null : { label: `Remove ${shownHome} from ${lastKey}`, edits: [edit] };
}

function viewOf(entities: PipelineEntities, refusal: EntityRefusal): EntityRefusalView {
  switch (refusal.reason) {
    case 'more-than-one-root':
      return { text: `${listTextOf(refusal.entityKeys)} are each the root. A pipeline has one root.`, entityKey: refusal.entityKeys[0] ?? '', fix: null };
    case 'equal-homes': {
      const shownHome = refusal.home.replace(/^\/+/u, '');
      return {
        text:      `${listTextOf(refusal.entityKeys)} have the same home folder ${shownHome === '' ? refusal.home : shownHome}. A folder belongs to one entity.`,
        entityKey: refusal.entityKeys.at(-1) ?? '',
        fix:       equalHomesFixOf(entities, refusal.home, refusal.entityKeys),
      };
    }
    case 'unknown-whitelist-key':
      return {
        text:      `${refusal.entityKey}'s whitelist names ${refusal.unknownKey}, which is not an entity. Take it off, or add ${refusal.unknownKey} as a package.`,
        entityKey: refusal.entityKey,
        fix:       takeOffFixOf(entities, refusal.entityKey, refusal.unknownKey),
      };
    case 'whitelisted-entity-not-package':
      return {
        text:      `${refusal.entityKey}'s whitelist names ${refusal.whitelistedKey}, which is not a package. A ticket crosses only into a package.`,
        entityKey: refusal.entityKey,
        fix:       takeOffFixOf(entities, refusal.entityKey, refusal.whitelistedKey),
      };
    case 'whitelisted-package-without-review':
      return {
        text:      `${refusal.entityKey}'s whitelist names ${refusal.whitelistedKey}, which has no review step. A package that tickets cross into needs one.`,
        entityKey: refusal.entityKey,
        fix:       { label: `Give ${refusal.whitelistedKey} a review step`, edits: [EntitiesStepModel.reviewAddedEditOf(refusal.whitelistedKey)] },
      };
    case 'unknown-dependency-key':
      return {
        text:      `${refusal.entityKey} depends on ${refusal.unknownKey}, which is not an entity.`,
        entityKey: refusal.entityKey,
        fix:       {
          label: `Remove ${refusal.unknownKey} from what ${refusal.entityKey} depends on`,
          edits: [EntitiesStepModel.dependencyRemovedEditOf(entities, refusal.entityKey, refusal.unknownKey)],
        },
      };
    case 'dependency-circle':
      return {
        text:      `${listTextOf(refusal.entityKeys)} depend on each other in a circle. A change could then never finish its gates.`,
        entityKey: refusal.entityKeys[0] ?? '',
        fix:       null,
      };
  }
}

function refusalsOf(entities: PipelineEntities): EntityRefusalView[] {
  return EntityValidationUtil.refusalsOf(entities).map((refusal) => viewOf(entities, refusal));
}

export const EntityRefusalsModel = Object.freeze({
  refusalsOf,
  listTextOf,
});
