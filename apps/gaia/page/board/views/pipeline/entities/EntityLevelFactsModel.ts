/**
 * The facts of one entity's level, pure: the board's facts as a single pipeline would carry them, so the flow, gates table and dialogs
 * draw an entity as they draw single mode. An edit goes back scoped to the entity, unless the forge sets its field for every entity.
 */
import type {
  BoardAppliedPipelineDocument,
  BoardDraftEditDocument,
  BoardEntityDraftEditDocument,
  BoardPipelineChangeDocument,
  BoardPipelineDefinitionDocument,
  BoardPipelineFlowDocument,
  BoardPipelineSetupDocument
} from '../../../../@types/board/BoardPipelineDocuments.ts';
import { BOARD_FORGE_LEVEL_AGENT_ROLES, type BoardForgeLevelAgentRole } from '../../../../@types/board/BoardVocabulary.ts';
import type { PipelineViewFacts }                                       from '../PipelineViewModel.ts';
import { PipelineLevelModel }                                           from './PipelineLevelModel.ts';

const ENTITY_FIELD_PREFIX = 'entity:';

const APPROVAL_FIELD_PREFIX = 'approval:';

const ROLE_FIELD_PREFIX = 'role:';

/** The fields only an entity has, never on a single pipeline's flow. */
const ENTITY_ONLY_FIELDS: readonly string[] = Object.freeze(['whitelist', 'reach', 'depends-on', 'concurrency']);

const NO_GATE_ROWS: BoardPipelineFlowDocument['gateRows'] = Object.freeze({ build: [], review: [], merge: [] });

function roleIsForgeLevel(role: string): role is BoardForgeLevelAgentRole {
  return BOARD_FORGE_LEVEL_AGENT_ROLES.some((forgeRole) => forgeRole === role);
}

/** The merge train, the approvals and the forge's own agents are set once at the forge, for every entity. */
function fieldIsSetAtTheForge(field: string): boolean {
  if (field === 'airlock' || field.startsWith(APPROVAL_FIELD_PREFIX)) return true;
  return field.startsWith(ROLE_FIELD_PREFIX) && roleIsForgeLevel(field.slice(ROLE_FIELD_PREFIX.length));
}

/** An edit of what the forge sets once for every entity: the merge train, an approval, or one of the forge's own agents. */
function editIsSetAtTheForge(edit: BoardDraftEditDocument): boolean {
  if (edit.target === 'airlock' || edit.target === 'approval') return true;
  return edit.target === 'role' && roleIsForgeLevel(edit.role);
}

/** A field a single pipeline and an entity both hold; an already scoped field and a forge field are not. */
function fieldIsWithinAnEntity(field: string): boolean {
  return !field.startsWith(ENTITY_FIELD_PREFIX) && !fieldIsSetAtTheForge(field);
}

function isFieldOfASinglePipeline(field: string): boolean {
  return !ENTITY_ONLY_FIELDS.some((entityOnlyField) => entityOnlyField === field);
}

/** `gate:lint` at web is `entity:web/gate:lint`; `approval:merge` and a field already scoped stay as they are. */
function scopedFieldOf(field: string, entityKey: string): string {
  return fieldIsWithinAnEntity(field) ? `${ENTITY_FIELD_PREFIX}${entityKey}/${field}` : field;
}

/** The field as a single pipeline names it, so it is worded as single mode words it: `gate:lint` for `entity:web/gate:lint`. */
function fieldAsASinglePipelineNamesIt(field: string): string {
  const fieldWithinEntity = PipelineLevelModel.fieldWithinEntityOf(field);
  return fieldWithinEntity !== null && isFieldOfASinglePipeline(fieldWithinEntity) ? fieldWithinEntity : field;
}

/** The edit as it stands inside an entity; null for one the forge sets for every entity, and for one already scoped. */
function editWithinAnEntityOf(edit: BoardDraftEditDocument): BoardEntityDraftEditDocument | null {
  switch (edit.target) {
    case 'airlock':
    case 'approval':
    case 'ticket-writing':
    case 'entity':
    case 'within-entity':
    case 'tools':
      return null;
    case 'role':
      return roleIsForgeLevel(edit.role) ? null : { target: 'role', role: edit.role, value: edit.value };
    default:
      return edit;
  }
}

/** A gate edit at web goes inside web; an approval and an edit already scoped stay as they are. */
function editsScopedTo(edits: readonly BoardDraftEditDocument[], entityKey: string): BoardDraftEditDocument[] {
  return edits.map((edit) => {
    const editWithinAnEntity = editWithinAnEntityOf(edit);
    return editWithinAnEntity === null ? edit : { target: 'within-entity', entityKey, edit: editWithinAnEntity };
  });
}

/** The entity's changes as the fields of a single pipeline; its definition and the fields only an entity has are not on its flow. */
function changesWithinEntityOf(changes: readonly BoardPipelineChangeDocument[], entityKey: string): BoardPipelineChangeDocument[] {
  const level = PipelineLevelModel.entityLevelOf(entityKey);
  return changes.flatMap((change) => {
    if (!PipelineLevelModel.levelsAreEqual(PipelineLevelModel.levelOfField(change.field), level)) return [];
    const field = PipelineLevelModel.fieldWithinEntityOf(change.field);
    if (field === null || !isFieldOfASinglePipeline(field)) return [];
    return fieldIsWithinAnEntity(field) ? [{ ...change, field }] : [];
  });
}

function flowAtEntityOf(flow: BoardPipelineFlowDocument, entityKey: string): BoardPipelineFlowDocument {
  const entityFlows = flow.entityFlows ?? {};
  const entityFlow = Object.hasOwn(entityFlows, entityKey) ? entityFlows[entityKey] : undefined;
  return {
    nodes:             entityFlow?.nodes ?? [],
    edges:             entityFlow?.edges ?? [],
    insertSlots:       entityFlow?.insertSlots ?? [],
    gateRows:          entityFlow?.gateRows ?? NO_GATE_ROWS,
    occupants:         [],
    changeList:        changesWithinEntityOf(flow.changeList, entityKey),
    ticketIdsInFlight: flow.ticketIdsInFlight,
    toolbarStage:      flow.toolbarStage,
    entityFlows:       null,
  };
}

/** The entity's draft pipeline as it would run, as the forge serves it; `null` for an entity the draft does not hold. */
function effectiveDraftPipelineOf(setup: BoardPipelineSetupDocument, entityKey: string): BoardPipelineDefinitionDocument | null {
  return Object.hasOwn(setup.draftEntities, entityKey) ? setup.draftEntities[entityKey]?.effectivePipeline ?? null : null;
}

function setupAtEntityOf(setup: BoardPipelineSetupDocument, entityKey: string): BoardPipelineSetupDocument {
  const { record } = setup;
  const parts = record.entities ?? {};
  const part = Object.hasOwn(parts, entityKey) ? parts[entityKey] : undefined;
  const entityFacts = setup.entities ?? {};
  const facts = Object.hasOwn(entityFacts, entityKey) ? entityFacts[entityKey] : undefined;
  return {
    ...setup,
    record: {
      ...record,
      draft:      effectiveDraftPipelineOf(setup, entityKey),
      agentJobId: part?.agentJobId ?? null,
      questions:  part?.questions ?? [],
      findings:   part?.findings ?? [],
    },
    openQuestionCount: facts?.openQuestionCount ?? 0,
    agentJobState:     facts?.agentJobState ?? null,
  };
}

/** The entity's applied pipeline as it runs, as the forge serves it. */
function appliedAtEntityOf(applied: BoardAppliedPipelineDocument, entityKey: string): BoardAppliedPipelineDocument {
  if (applied.readingVerdict !== 'readable') return applied;
  const pipeline = Object.hasOwn(applied.entityPipelines, entityKey) ? applied.entityPipelines[entityKey] : undefined;
  return pipeline === undefined ? { readingVerdict: 'absent' } : { ...applied, pipeline, entityPipelines: {} };
}

function factsAtEntityOf(facts: PipelineViewFacts, entityKey: string): PipelineViewFacts {
  const {
    applied, setup, flow, profileRuns, gateCacheMarks, stepRunTimes
  } = facts.pipeline;
  return {
    ...facts,
    pipeline: {
      ...facts.pipeline,
      applied:        appliedAtEntityOf(applied, entityKey),
      setup:          setup === null ? null : setupAtEntityOf(setup, entityKey),
      flow:           flow === null ? null : flowAtEntityOf(flow, entityKey),
      profileRuns:    profileRuns.filter((run) => run.entity === entityKey),
      gateCacheMarks: gateCacheMarks.filter((mark) => mark.entity === entityKey),
      stepRunTimes:   stepRunTimes.filter((runTime) => runTime.entity === entityKey),
    },
  };
}

export const EntityLevelFactsModel = Object.freeze({
  factsAtEntityOf,
  changesWithinEntityOf,
  fieldIsSetAtTheForge,
  editIsSetAtTheForge,
  scopedFieldOf,
  editsScopedTo,
  fieldAsASinglePipelineNamesIt,
});
