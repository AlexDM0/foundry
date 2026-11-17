/**
 * The entities step's refusals, pure: the verdicts `EntityValidationUtil` gives the entities the step shows, the same check the stored
 * pipeline gets, each in the sentence the Overseer's API would carry for the edit, with the entity it is shown on and, where one gesture
 * resolves it, that gesture's edits. So every refusal shows before Continue, never as a refused Apply.
 */
import { OperationRefusalWordingUtil }              from '../../../../src/adapters/utils/OperationRefusalWordingUtil.ts';
import type { EntityKey }                           from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineDraftEdit }                   from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { PipelineEntities }                    from '../../../../src/lib/tracker-model/utils/EntityOwnershipUtil.ts';
import { EntityValidationUtil, type EntityRefusal } from '../../../../src/lib/tracker-model/utils/EntityValidationUtil.ts';
import { OperationRefusal }                         from '../../../../src/shared/OperationRefusal.ts';
import { EntitiesStepModel }                        from './EntitiesStepModel.ts';

export interface EntityRefusalFix {
  readonly label: string;
  readonly edits: readonly PipelineDraftEdit[];
}

export interface EntityRefusalView {
  /** The refusal as the Overseer's API words it. */
  readonly text:      string;
  /** The entity whose row shows the refusal: Show opens it. */
  readonly entityKey: EntityKey;
  readonly fix:       EntityRefusalFix | null;
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

/** The sentence the Overseer's API carries when it refuses an edit that would leave these entities: `pipeline-draft-invalid`. */
function textOf(setupId: string, refusal: EntityRefusal): string {
  const reason = OperationRefusalWordingUtil.entityRefusalReasonOf(refusal);
  return OperationRefusalWordingUtil.apiMessageOf(new OperationRefusal('refused', { kind: 'pipeline-draft-invalid', setupId, reason }));
}

function viewOf(setupId: string, entities: PipelineEntities, refusal: EntityRefusal): EntityRefusalView {
  const text = textOf(setupId, refusal);
  switch (refusal.reason) {
    case 'more-than-one-root':
      return { text, entityKey: refusal.entityKeys[0] ?? '', fix: null };
    case 'equal-homes':
      return { text, entityKey: refusal.entityKeys.at(-1) ?? '', fix: equalHomesFixOf(entities, refusal.home, refusal.entityKeys) };
    case 'reach-inside-another-home':
      return {
        text,
        entityKey: refusal.entityKey,
        fix:       {
          label: `Take ${refusal.reachPath} off ${refusal.entityKey}'s reach`,
          edits: [EntitiesStepModel.reachRemovedEditOf(entities, refusal.entityKey, refusal.reachPath)],
        },
      };
    case 'unknown-whitelist-key':
      return { text, entityKey: refusal.entityKey, fix: takeOffFixOf(entities, refusal.entityKey, refusal.unknownKey) };
    case 'whitelisted-entity-not-package':
      return { text, entityKey: refusal.entityKey, fix: takeOffFixOf(entities, refusal.entityKey, refusal.whitelistedKey) };
    case 'whitelisted-package-without-review':
      return {
        text,
        entityKey: refusal.entityKey,
        fix:       { label: `Give ${refusal.whitelistedKey} a review step`, edits: [EntitiesStepModel.reviewAddedEditOf(refusal.whitelistedKey)] },
      };
    case 'unknown-dependency-key':
      return {
        text,
        entityKey: refusal.entityKey,
        fix:       {
          label: `Remove ${refusal.unknownKey} from what ${refusal.entityKey} depends on`,
          edits: [EntitiesStepModel.dependencyRemovedEditOf(entities, refusal.entityKey, refusal.unknownKey)],
        },
      };
    case 'dependency-circle':
      return { text, entityKey: refusal.entityKeys[0] ?? '', fix: null };
  }
}

function refusalsOf(setupId: string, entities: PipelineEntities): EntityRefusalView[] {
  return EntityValidationUtil.refusalsOf(entities).map((refusal) => viewOf(setupId, entities, refusal));
}

export const EntityRefusalsModel = Object.freeze({ refusalsOf, });
