/**
 * The facts of one entity's level, pure: the board's facts as a single pipeline would carry them, so the flow, the gates table and the
 * dialogs draw an entity as they draw single mode. The entity's flow replaces the forge's, its single pipeline is the draft and the
 * applied pipeline, its own session's questions mark its steps, and only its profile runs, cache marks and changes stay, each change as
 * the field inside the entity. An edit made there goes back scoped to the entity, unless its field is one the forge sets for every entity.
 */
import { FORGE_LEVEL_AGENT_ROLES, type EntityKey, type ForgeLevelAgentRole } from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type {
  AppliedPipelineFacts,
  PipelineChange,
  PipelineFlowFacts,
  PipelineSetupFacts
} from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { EntityDraftField, PipelineDraftField } from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { PipelineUtil }                              from '../../../../src/lib/tracker-model/utils/PipelineUtil.ts';
import type { PipelineViewFacts }                    from '../PipelineViewModel.ts';
import type { FlowDraftEdit }                        from '../flow/PipelineFlowModel.ts';
import { PipelineLevelModel }                        from './PipelineLevelModel.ts';

const ENTITY_FIELD_PREFIX = 'entity:';

const APPROVAL_FIELD_PREFIX = 'approval:';

const ROLE_FIELD_PREFIX = 'role:';

/** The fields only an entity has, never on a single pipeline's flow. */
const ENTITY_ONLY_FIELDS: readonly Exclude<EntityDraftField, PipelineDraftField>[] = Object.freeze(['whitelist', 'reach', 'depends-on', 'concurrency']);

const NO_GATE_ROWS: PipelineFlowFacts['gateRows'] = Object.freeze({ build: [], review: [], merge: [] });

function roleIsForgeLevel(role: string): role is ForgeLevelAgentRole {
  return FORGE_LEVEL_AGENT_ROLES.some((forgeRole) => forgeRole === role);
}

/** The merge train, the approvals and the forge's own agents are set once at the forge, for every entity. */
function fieldIsSetAtTheForge(field: PipelineDraftField): boolean {
  if (field === 'airlock' || field.startsWith(APPROVAL_FIELD_PREFIX)) return true;
  return field.startsWith(ROLE_FIELD_PREFIX) && roleIsForgeLevel(field.slice(ROLE_FIELD_PREFIX.length));
}

/** A field a single pipeline and an entity both hold; an already scoped field and a forge field are not. */
function fieldIsWithinAnEntity(field: PipelineDraftField): field is Extract<PipelineDraftField, EntityDraftField> {
  return !field.startsWith(ENTITY_FIELD_PREFIX) && !fieldIsSetAtTheForge(field);
}

function isFieldOfASinglePipeline(field: PipelineDraftField | EntityDraftField): field is PipelineDraftField {
  return !ENTITY_ONLY_FIELDS.some((entityOnlyField) => entityOnlyField === field);
}

/** `gate:lint` at web is `entity:web/gate:lint`; `approval:merge` and a field already scoped stay as they are. */
function scopedFieldOf(field: PipelineDraftField, entityKey: EntityKey): PipelineDraftField {
  return fieldIsWithinAnEntity(field) ? `${ENTITY_FIELD_PREFIX}${entityKey}/${field}` : field;
}

/** The field as a single pipeline names it, so it is worded as single mode words it: `gate:lint` for `entity:web/gate:lint`. */
function fieldAsASinglePipelineNamesIt(field: PipelineDraftField): PipelineDraftField {
  const fieldWithinEntity = PipelineLevelModel.fieldWithinEntityOf(field);
  return fieldWithinEntity !== null && isFieldOfASinglePipeline(fieldWithinEntity) ? fieldWithinEntity : field;
}

function editsScopedTo(edits: readonly FlowDraftEdit[], entityKey: EntityKey): FlowDraftEdit[] {
  return edits.map((edit) => ({ field: scopedFieldOf(edit.field, entityKey), value: edit.value }));
}

/** The entity's changes as the fields of a single pipeline; its definition and the fields only an entity has are not on its flow. */
function changesWithinEntityOf(changes: readonly PipelineChange[], entityKey: EntityKey): PipelineChange[] {
  const level = PipelineLevelModel.entityLevelOf(entityKey);
  return changes.flatMap((change) => {
    if (!PipelineLevelModel.levelsAreEqual(PipelineLevelModel.levelOfField(change.field), level)) return [];
    const field = PipelineLevelModel.fieldWithinEntityOf(change.field);
    if (field === null || !isFieldOfASinglePipeline(field)) return [];
    return fieldIsWithinAnEntity(field) ? [{ ...change, field }] : [];
  });
}

function flowAtEntityOf(flow: PipelineFlowFacts, entityKey: EntityKey): PipelineFlowFacts {
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
  };
}

function setupAtEntityOf(setup: PipelineSetupFacts, entityKey: EntityKey): PipelineSetupFacts {
  const { record } = setup;
  const parts = record.entities ?? {};
  const part = Object.hasOwn(parts, entityKey) ? parts[entityKey] : undefined;
  const entityFacts = setup.entities ?? {};
  const facts = Object.hasOwn(entityFacts, entityKey) ? entityFacts[entityKey] : undefined;
  return {
    ...setup,
    record: {
      ...record,
      draft:      record.draft === null ? null : PipelineUtil.pipelineOfEntity(record.draft, entityKey),
      agentJobId: part?.agentJobId ?? null,
      questions:  part?.questions ?? [],
      findings:   part?.findings ?? [],
    },
    openQuestionCount: facts?.openQuestionCount ?? 0,
    agentJobState:     facts?.agentJobState ?? null,
  };
}

function appliedAtEntityOf(applied: AppliedPipelineFacts, entityKey: EntityKey): AppliedPipelineFacts {
  if (applied.readingVerdict !== 'readable') return applied;
  const pipeline = PipelineUtil.pipelineOfEntity(applied.pipeline, entityKey);
  return pipeline === null ? { readingVerdict: 'absent' } : { ...applied, pipeline };
}

function factsAtEntityOf(facts: PipelineViewFacts, entityKey: EntityKey): PipelineViewFacts {
  const {
    pipeline, pipelineSetup, pipelineFlow, profileRuns, gateCacheMarks
  } = facts;
  return {
    ...facts,
    ...(pipeline === undefined ? {} : { pipeline: appliedAtEntityOf(pipeline, entityKey) }),
    ...(pipelineSetup === undefined ? {} : { pipelineSetup: pipelineSetup === null ? null : setupAtEntityOf(pipelineSetup, entityKey) }),
    ...(pipelineFlow === undefined ? {} : { pipelineFlow: pipelineFlow === null ? null : flowAtEntityOf(pipelineFlow, entityKey) }),
    ...(profileRuns === undefined ? {} : { profileRuns: profileRuns.filter((run) => run.entity === entityKey) }),
    ...(gateCacheMarks === undefined ? {} : { gateCacheMarks: gateCacheMarks.filter((mark) => mark.entity === entityKey) }),
  };
}

export const EntityLevelFactsModel = Object.freeze({
  factsAtEntityOf,
  changesWithinEntityOf,
  fieldIsSetAtTheForge,
  scopedFieldOf,
  editsScopedTo,
  fieldAsASinglePipelineNamesIt,
});
