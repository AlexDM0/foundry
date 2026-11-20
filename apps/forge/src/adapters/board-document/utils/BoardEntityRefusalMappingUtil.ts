/**
 * The refusals a setup draft's entities hold, mapped into the contract's entity refusal documents: each verdict of the entity validator
 * with the entity whose row shows it, the command line's sentence of its `pipeline-draft-invalid` refusal and, where one gesture resolves
 * it, that gesture as typed draft edits. Which gesture resolves a refusal is forge's rule, so a view shows the fix and sends its edits.
 */
import type {
  BoardEntityRefusalDocument,
  BoardEntityRefusalFixDocument,
  EntityDraftEditDocument,
  PipelineDraftEditDocument
} from 'forge-contracts/BoardPipelineDocuments';

import type { EntityKey, Pipeline, PipelineEntity }   from '../../../lib/tracker-model/@types/Pipeline.ts';
import { EntityOwnershipUtil, type PipelineEntities } from '../../../lib/tracker-model/utils/EntityOwnershipUtil.ts';
import { EntityValidationUtil, type EntityRefusal }   from '../../../lib/tracker-model/utils/EntityValidationUtil.ts';
import { OperationRefusal }                           from '../../../shared/OperationRefusal.ts';
import { OperationRefusalWordingUtil }                from '../../utils/OperationRefusalWordingUtil.ts';

/** The review step a whitelisted package gets when a fix gives it one. */
const FIXED_REVIEW_NAME = 'review';

const REPOSITORY_ROOT_HOME = '/';

function entityOf(entities: PipelineEntities, entityKey: EntityKey): Readonly<PipelineEntity> | undefined {
  return Object.hasOwn(entities, entityKey) ? entities[entityKey] : undefined;
}

/** A home as a view shows it: without its leading `/`, but the repository's root. */
function shownHomeOf(home: string): string {
  return home === REPOSITORY_ROOT_HOME ? home : home.replace(/^\/+/u, '');
}

function withinEntityEditOf(entityKey: EntityKey, edit: EntityDraftEditDocument): PipelineDraftEditDocument {
  return { target: 'within-entity', entityKey, edit };
}

/** A list edit that removes the key once the list is empty, so the entity stores no empty list. */
function keyListRemovalEditOf(
  entityKey: EntityKey, target: 'whitelist' | 'depends-on' | 'reach', list: readonly string[], removedEntry: string
): PipelineDraftEditDocument {
  const remaining = list.filter((entry) => entry !== removedEntry);
  return withinEntityEditOf(entityKey, { target, value: remaining.length === 0 ? null : remaining });
}

function whitelistRemovalFixOf(entities: PipelineEntities, entityKey: EntityKey, whitelistedKey: EntityKey): BoardEntityRefusalFixDocument {
  const whitelist = entityOf(entities, entityKey)?.whitelist ?? [];
  return { label: `Take ${whitelistedKey} off`, edits: [keyListRemovalEditOf(entityKey, 'whitelist', whitelist, whitelistedKey)] };
}

/** The last entity that shares the home gives it up, when it keeps another home. */
function equalHomesFixOf(entities: PipelineEntities, home: string, entityKeys: readonly EntityKey[]): BoardEntityRefusalFixDocument | null {
  const lastKey = entityKeys.at(-1);
  const entity  = lastKey === undefined ? undefined : entityOf(entities, lastKey);
  if (lastKey === undefined || entity === undefined) return null;
  const keptHomes = entity.home.filter((folder) => EntityOwnershipUtil.homeFolderOf(folder) !== home);
  if (keptHomes.length === 0 || keptHomes.length === entity.home.length) return null;
  const definition = { kind: entity.kind, home: keptHomes, ...(entity.summary === undefined ? {} : { summary: entity.summary }) };
  return { label: `Remove ${shownHomeOf(home)} from ${lastKey}`, edits: [{ target: 'entity', entityKey: lastKey, value: definition }] };
}

function fixOf(entities: PipelineEntities, refusal: EntityRefusal): BoardEntityRefusalFixDocument | null {
  switch (refusal.reason) {
    case 'more-than-one-root':
    case 'dependency-circle':
      return null;
    case 'equal-homes':
      return equalHomesFixOf(entities, refusal.home, refusal.entityKeys);
    case 'reach-inside-another-home':
      return {
        label: `Take ${refusal.reachPath} off ${refusal.entityKey}'s reach`,
        edits: [keyListRemovalEditOf(refusal.entityKey, 'reach', entityOf(entities, refusal.entityKey)?.reach ?? [], refusal.reachPath)],
      };
    case 'unknown-whitelist-key':
      return whitelistRemovalFixOf(entities, refusal.entityKey, refusal.unknownKey);
    case 'whitelisted-entity-not-package':
      return whitelistRemovalFixOf(entities, refusal.entityKey, refusal.whitelistedKey);
    case 'whitelisted-package-without-review':
      return {
        label: `Give ${refusal.whitelistedKey} a review step`,
        edits: [withinEntityEditOf(refusal.whitelistedKey, { target: 'review', value: { name: FIXED_REVIEW_NAME } })],
      };
    case 'unknown-dependency-key':
      return {
        label: `Remove ${refusal.unknownKey} from what ${refusal.entityKey} depends on`,
        edits: [keyListRemovalEditOf(refusal.entityKey, 'depends-on', entityOf(entities, refusal.entityKey)?.dependsOn ?? [], refusal.unknownKey)],
      };
  }
}

function entityKeysOf(refusal: EntityRefusal): EntityKey[] {
  switch (refusal.reason) {
    case 'more-than-one-root':
    case 'equal-homes':
    case 'dependency-circle':
      return [...refusal.entityKeys];
    case 'reach-inside-another-home':
      return [refusal.entityKey, refusal.ownerKey];
    case 'unknown-whitelist-key':
    case 'unknown-dependency-key':
      return [refusal.entityKey];
    case 'whitelisted-entity-not-package':
    case 'whitelisted-package-without-review':
      return [refusal.entityKey, refusal.whitelistedKey];
  }
}

/** The row a refusal shows on: the entity that names what is wrong, the last one sharing a home, or the first one of a set. */
function shownOnOf(refusal: EntityRefusal): EntityKey {
  switch (refusal.reason) {
    case 'more-than-one-root':
    case 'dependency-circle':
      return refusal.entityKeys[0] ?? '';
    case 'equal-homes':
      return refusal.entityKeys.at(-1) ?? '';
    case 'reach-inside-another-home':
    case 'unknown-whitelist-key':
    case 'unknown-dependency-key':
    case 'whitelisted-entity-not-package':
    case 'whitelisted-package-without-review':
      return refusal.entityKey;
  }
}

function sentenceOf(setupId: string, refusal: EntityRefusal): string {
  const reason = OperationRefusalWordingUtil.entityRefusalReasonOf(refusal);
  return OperationRefusalWordingUtil.messageOf(new OperationRefusal('refused', { kind: 'pipeline-draft-invalid', setupId, reason }));
}

function entityRefusalOf(setupId: string, entities: PipelineEntities, refusal: EntityRefusal): BoardEntityRefusalDocument {
  return {
    reason:     refusal.reason,
    entityKeys: entityKeysOf(refusal),
    shownOn:    shownOnOf(refusal),
    sentence:   sentenceOf(setupId, refusal),
    fix:        fixOf(entities, refusal),
  };
}

/** Every refusal the validator gives the draft's entities, in its order; none for a draft without entities. */
function entityRefusalsOf(setupId: string, draft: Readonly<Pipeline> | null): BoardEntityRefusalDocument[] {
  const entities = draft?.entities ?? {};
  return EntityValidationUtil.refusalsOf(entities).map((refusal) => entityRefusalOf(setupId, entities, refusal));
}

export const BoardEntityRefusalMappingUtil = Object.freeze({ entityRefusalOf, entityRefusalsOf });
