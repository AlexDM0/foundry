/**
 * The draft pipeline edited one addressed field at a time: an edit written into a copy of the draft, the field an edit names, and Undo,
 * which writes the base pipeline's value of one field back. A field inside an entity is the same edit on that entity's own steps and
 * settings. Nothing here judges whether the result is a valid pipeline: the stored file's validator does that before an Apply.
 */
import { GATE_PHASES, type GatePhase } from '../@types/GatePhase.ts';
import {
  type AgentStepSettings,
  ENTITY_AGENT_ROLES,
  type EntityAgentRole,
  type EntityKey,
  PIPELINE_AGENT_ROLES,
  type Pipeline,
  type PipelineAgentRole,
  type PipelineApproval,
  type PipelineEntity
} from '../@types/Pipeline.ts';
import type {
  EntityDraftEdit,
  EntityDraftField,
  PipelineDraftEdit,
  PipelineDraftField,
  PipelineEntityDefinition,
  PipelineStepsDraftEdit,
  PipelineStepsDraftField
} from '../@types/PipelineSetup.ts';

/** The entity a field names, and the field inside it; a null `field` is the entity's definition. */
export interface EntityFieldScope {
  entityKey: EntityKey;
  field:     EntityDraftField | null;
}

/** What a pipeline and an entity both hold: the steps a ticket runs, the review and the constitution. */
type PipelineSteps = Pick<PipelineEntity, 'prepare' | 'gates' | 'phases' | 'review' | 'constitution'>;

type AgentSettingsHolder<Role extends PipelineAgentRole> = { agents?: Partial<Record<Role, AgentStepSettings>> };

const PIPELINE_APPROVALS: readonly PipelineApproval[] = ['tickets', 'merge'];

const NAMED_FIELD_PREFIXES = ['gate:', 'prepare:'] as const;

const ENTITY_FIELD_PREFIX = 'entity:';

const ENTITY_SCOPE_SEPARATOR = '/';

const ENTITY_LIST_FIELDS = ['whitelist', 'reach', 'depends-on'] as const;

function phaseIsKnown(text: string): text is GatePhase {
  return (GATE_PHASES as readonly string[]).includes(text);
}

function roleIsKnown(text: string): text is PipelineAgentRole {
  return (PIPELINE_AGENT_ROLES as readonly string[]).includes(text);
}

function entityRoleIsKnown(text: string): text is EntityAgentRole {
  return (ENTITY_AGENT_ROLES as readonly string[]).includes(text);
}

function approvalIsKnown(text: string): text is PipelineApproval {
  return (PIPELINE_APPROVALS as readonly string[]).includes(text);
}

function stepsFieldOf(edit: PipelineStepsDraftEdit): PipelineStepsDraftField {
  switch (edit.target) {
    case 'gate':
      return `gate:${edit.name}`;
    case 'phase-order':
      return `phase-order:${edit.phase}`;
    case 'prepare':
      return `prepare:${edit.name}`;
    case 'prepare-order':
    case 'review':
    case 'constitution':
      return edit.target;
  }
}

function entityFieldOf(edit: EntityDraftEdit): EntityDraftField {
  switch (edit.target) {
    case 'role':
      return `role:${edit.role}`;
    case 'whitelist':
    case 'reach':
    case 'depends-on':
    case 'concurrency':
      return edit.target;
    default:
      return stepsFieldOf(edit);
  }
}

function fieldOf(edit: PipelineDraftEdit): PipelineDraftField {
  switch (edit.target) {
    case 'role':
      return `role:${edit.role}`;
    case 'approval':
      return `approval:${edit.approval}`;
    case 'airlock':
    case 'tools':
      return edit.target;
    case 'entity':
      return `${ENTITY_FIELD_PREFIX}${edit.entityKey}`;
    case 'within-entity':
      return `${ENTITY_FIELD_PREFIX}${edit.entityKey}${ENTITY_SCOPE_SEPARATOR}${entityFieldOf(edit.edit)}`;
    default:
      return stepsFieldOf(edit);
  }
}

/** A gate or prepare step names a non-blank name, a phase one of its own vocabulary. */
function stepsFieldIsWellFormed(text: string): text is PipelineStepsDraftField {
  if (text === 'prepare-order' || text === 'review' || text === 'constitution') return true;
  const namedPrefix = NAMED_FIELD_PREFIXES.find((prefix) => text.startsWith(prefix));
  if (namedPrefix !== undefined) return text.slice(namedPrefix.length).trim() !== '';
  const [kind, value = ''] = text.split(/:(.*)/su);
  return kind === 'phase-order' && phaseIsKnown(value);
}

/** A field inside an entity, whose roles are only the ones an entity sets; the forge's own fields never sit inside one. */
function entityFieldIsWellFormed(text: string): text is EntityDraftField {
  if (stepsFieldIsWellFormed(text)) return true;
  if ((ENTITY_LIST_FIELDS as readonly string[]).includes(text) || text === 'concurrency') return true;
  const [kind, value = ''] = text.split(/:(.*)/su);
  return kind === 'role' && entityRoleIsKnown(value);
}

/** The entity a field names, split at the first separator after the prefix; null for a field outside every entity. */
function entityScopeOf(field: string): EntityFieldScope | null {
  if (!field.startsWith(ENTITY_FIELD_PREFIX)) return null;
  const scopedText     = field.slice(ENTITY_FIELD_PREFIX.length);
  const separatorIndex = scopedText.indexOf(ENTITY_SCOPE_SEPARATOR);
  if (separatorIndex === -1) return { entityKey: scopedText, field: null };
  const innerField = scopedText.slice(separatorIndex + ENTITY_SCOPE_SEPARATOR.length);
  return entityFieldIsWellFormed(innerField) ? { entityKey: scopedText.slice(0, separatorIndex), field: innerField } : null;
}

/** A phase, role or approval names one of its own vocabulary; an entity's field names a non-blank key and a field an entity holds. */
function fieldIsWellFormed(text: string): text is PipelineDraftField {
  if (text.startsWith(ENTITY_FIELD_PREFIX)) {
    const scope = entityScopeOf(text);
    return scope !== null && scope.entityKey.trim() !== '';
  }
  if (stepsFieldIsWellFormed(text) || text === 'airlock' || text === 'tools') return true;
  const [kind, value = ''] = text.split(/:(.*)/su);
  if (kind === 'role') return roleIsKnown(value);
  if (kind === 'approval') return approvalIsKnown(value);
  return false;
}

function replacedOrAppended<Item extends { name: string }>(items: readonly Item[], name: string, replacement: Item): Item[] {
  return items.some((item) => item.name === name)
    ? items.map((item) => (item.name === name ? replacement : item))
    : [...items, replacement];
}

/** The steps the names list first, in that order, then every step the list leaves out, in its own order. */
function orderedByNames<Item extends { name: string }>(items: readonly Item[], names: readonly string[]): Item[] {
  const named = names.flatMap((name) => items.filter((item) => item.name === name));
  return [...named, ...items.filter((item) => !names.includes(item.name))];
}

/** Writes the edit into `steps`; a removed gate also leaves every phase it ran in, so no phase names a gate that is gone. */
function writeStepsEdit(steps: PipelineSteps, edit: PipelineStepsDraftEdit): void {
  switch (edit.target) {
    case 'gate':
      if (edit.value === null) {
        steps.gates = steps.gates.filter((gate) => gate.name !== edit.name);
        for (const phase of GATE_PHASES) steps.phases[phase] = steps.phases[phase].filter((name) => name !== edit.name);
      } else {
        steps.gates = replacedOrAppended(steps.gates, edit.name, structuredClone(edit.value));
      }
      return;
    case 'phase-order':
      steps.phases[edit.phase] = [...edit.names];
      return;
    case 'prepare':
      steps.prepare = edit.value === null
        ? steps.prepare.filter((step) => step.name !== edit.name)
        : replacedOrAppended(steps.prepare, edit.name, structuredClone(edit.value));
      return;
    case 'prepare-order':
      steps.prepare = orderedByNames(steps.prepare, edit.names);
      return;
    case 'review':
    case 'constitution':
      if (edit.value === null) Reflect.deleteProperty(steps, edit.target);
      else Object.assign(steps, { [edit.target]: structuredClone(edit.value) });
  }
}

/** The last role removed removes the whole map. */
function writeRoleEdit<Role extends PipelineAgentRole>(holder: AgentSettingsHolder<Role>, role: Role, value: AgentStepSettings | null): void {
  const agents: Partial<Record<Role, AgentStepSettings>> = { ...holder.agents };
  if (value === null) Reflect.deleteProperty(agents, role);
  else agents[role] = structuredClone(value);
  if (Object.keys(agents).length === 0) Reflect.deleteProperty(holder, 'agents');
  else holder.agents = agents;
}

function writeEntityEdit(entity: PipelineEntity, edit: EntityDraftEdit): void {
  switch (edit.target) {
    case 'role':
      writeRoleEdit(entity, edit.role, edit.value);
      return;
    case 'whitelist':
    case 'reach':
    case 'depends-on':
    case 'concurrency': {
      const key = edit.target === 'depends-on' ? 'dependsOn' : edit.target;
      if (edit.value === null) Reflect.deleteProperty(entity, key);
      else Object.assign(entity, { [key]: structuredClone(edit.value) });
      return;
    }
    default:
      writeStepsEdit(entity, edit);
  }
}

function entityOf(pipeline: Readonly<Pipeline>, entityKey: EntityKey): PipelineEntity | undefined {
  const { entities } = pipeline;
  return entities !== undefined && Object.hasOwn(entities, entityKey) ? entities[entityKey] : undefined;
}

/** The kind, home folders and summary of an entity, which its definition field sets. */
function definitionOf(entity: Readonly<PipelineEntity>): PipelineEntityDefinition {
  return { kind: entity.kind, home: [...entity.home], ...(entity.summary === undefined ? {} : { summary: entity.summary }) };
}

/** An entity with the definition and no steps, gates, review or settings of its own yet. */
function newEntityOf(definition: Readonly<PipelineEntityDefinition>): PipelineEntity {
  const summary = definition.summary === undefined ? {} : { summary: definition.summary };
  return {
    kind: definition.kind, home: [...definition.home], ...summary, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
  };
}

/** `fromEntries` keeps an outside key such as `__proto__` as data instead of setting the prototype. */
function withEntityAppended(pipeline: Pipeline, entityKey: EntityKey, entity: PipelineEntity): void {
  pipeline.entities = Object.fromEntries([...Object.entries(pipeline.entities ?? {}), [entityKey, entity]]);
}

/** A definition replaces the kind, home and summary and keeps the entity's pipeline; `null` removes the entity, the last one `entities`. */
function writeEntityDefinition(pipeline: Pipeline, entityKey: EntityKey, value: PipelineEntityDefinition | null): void {
  const entity = entityOf(pipeline, entityKey);
  if (value === null) {
    if (entity === undefined || pipeline.entities === undefined) return;
    const remaining = Object.entries(pipeline.entities).filter(([key]) => key !== entityKey);
    if (remaining.length === 0) Reflect.deleteProperty(pipeline, 'entities');
    else pipeline.entities = Object.fromEntries(remaining);
    return;
  }
  if (entity === undefined) {
    withEntityAppended(pipeline, entityKey, newEntityOf(value));
    return;
  }
  entity.kind = value.kind;
  entity.home = [...value.home];
  if (value.summary === undefined) Reflect.deleteProperty(entity, 'summary');
  else entity.summary = value.summary;
}

/** The draft with one field written. An edit inside an entity the draft does not hold changes nothing: the entity's definition adds it. */
function pipelineWithEdit(pipeline: Readonly<Pipeline>, edit: PipelineDraftEdit): Pipeline {
  const draft = structuredClone(pipeline) as Pipeline;
  switch (edit.target) {
    case 'role':
      writeRoleEdit(draft, edit.role, edit.value);
      return draft;
    case 'approval': {
      const approvals = { ...draft.approvals };
      if (edit.value === null) Reflect.deleteProperty(approvals, edit.approval);
      else approvals[edit.approval] = edit.value;
      if (Object.keys(approvals).length === 0) Reflect.deleteProperty(draft, 'approvals');
      else draft.approvals = approvals;
      return draft;
    }
    case 'airlock':
      if (edit.value === null) Reflect.deleteProperty(draft, 'airlock');
      else draft.airlock = structuredClone(edit.value);
      return draft;
    case 'tools':
      if (edit.value === null) Reflect.deleteProperty(draft, 'tools');
      else draft.tools = edit.value.map((tool) => ({ name: tool.name, path: tool.path }));
      return draft;
    case 'entity':
      writeEntityDefinition(draft, edit.entityKey, edit.value);
      return draft;
    case 'within-entity': {
      const entity = entityOf(draft, edit.entityKey);
      if (entity !== undefined) writeEntityEdit(entity, edit.edit);
      return draft;
    }
    default:
      writeStepsEdit(draft, edit);
      return draft;
  }
}

/** Back where the base has it: a gate Undo restores into no phase would leave a gate no phase runs. */
function restoreGatePlaces(base: Readonly<PipelineSteps>, draft: PipelineSteps, gateName: string): void {
  const runsInNoPhase = GATE_PHASES.every((phase) => !draft.phases[phase].includes(gateName));
  if (!runsInNoPhase) return;
  const restoredGate = draft.gates.find((gate) => gate.name === gateName);
  const baseIndex    = base.gates.findIndex((gate) => gate.name === gateName);
  if (restoredGate !== undefined) {
    draft.gates = draft.gates.filter((gate) => gate !== restoredGate);
    draft.gates.splice(Math.min(baseIndex, draft.gates.length), 0, restoredGate);
  }
  for (const phase of GATE_PHASES) {
    const phaseIndex = base.phases[phase].indexOf(gateName);
    if (phaseIndex !== -1) draft.phases[phase].splice(Math.min(phaseIndex, draft.phases[phase].length), 0, gateName);
  }
}

/** The edit that writes the base's value of a steps field over the draft's; null for a field that is not one. */
function stepsBaseEditOf(base: Readonly<PipelineSteps>, draft: Readonly<PipelineSteps>, field: string): PipelineStepsDraftEdit | null {
  if (field === 'prepare-order') {
    const baseNames = base.prepare.map((step) => step.name);
    return { target: 'prepare-order', names: orderedByNames(draft.prepare, baseNames).map((step) => step.name) };
  }
  if (field === 'review') return { target: 'review', value: base.review ?? null };
  if (field === 'constitution') return { target: 'constitution', value: base.constitution ?? null };
  const [kind = '', name = ''] = field.split(/:(.*)/su);
  if (kind === 'gate') return { target: 'gate', name, value: base.gates.find((gate) => gate.name === name) ?? null };
  if (kind === 'prepare') return { target: 'prepare', name, value: base.prepare.find((step) => step.name === name) ?? null };
  if (kind === 'phase-order' && phaseIsKnown(name)) return { target: 'phase-order', phase: name, names: [...base.phases[name]] };
  return null;
}

/** The edit that writes the base's value of `field` over the draft's, which is what Undo does. */
function baseEditOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>, field: PipelineDraftField): PipelineDraftEdit {
  const stepsEdit = stepsBaseEditOf(base, draft, field);
  if (stepsEdit !== null) return stepsEdit;
  if (field === 'airlock') return { target: 'airlock', value: base.airlock ?? null };
  if (field === 'tools') return { target: 'tools', value: base.tools ?? null };
  const [kind = '', name = ''] = field.split(/:(.*)/su);
  if (kind === 'role' && roleIsKnown(name)) return { target: 'role', role: name, value: base.agents?.[name] ?? null };
  if (kind === 'approval' && approvalIsKnown(name)) return { target: 'approval', approval: name, value: base.approvals?.[name] ?? null };
  throw new Error(`${field} is not a draft field.`);
}

function entityBaseEditOf(base: Readonly<PipelineEntity>, draft: Readonly<PipelineEntity>, field: EntityDraftField): EntityDraftEdit {
  const stepsEdit = stepsBaseEditOf(base, draft, field);
  if (stepsEdit !== null) return stepsEdit;
  switch (field) {
    case 'whitelist':
      return { target: 'whitelist', value: base.whitelist ?? null };
    case 'reach':
      return { target: 'reach', value: base.reach ?? null };
    case 'depends-on':
      return { target: 'depends-on', value: base.dependsOn ?? null };
    case 'concurrency':
      return { target: 'concurrency', value: base.concurrency ?? null };
    default: {
      const role = field.slice('role:'.length);
      if (entityRoleIsKnown(role)) return { target: 'role', role, value: base.agents?.[role] ?? null };
      throw new Error(`${field} is not a field of an entity.`);
    }
  }
}

/** The base entity back in its base place among the draft's entities, its whole pipeline with it, as before the draft removed it. */
function withBaseEntityRestored(base: Readonly<Pipeline>, draft: Pipeline, entityKey: EntityKey, baseEntity: Readonly<PipelineEntity>): Pipeline {
  const baseKeys     = Object.keys(base.entities ?? {});
  const draftEntries = Object.entries(draft.entities ?? {});
  const insertIndex  = draftEntries.findIndex(([key]) => baseKeys.indexOf(key) > baseKeys.indexOf(entityKey) || !baseKeys.includes(key));
  const restored: [EntityKey, PipelineEntity] = [entityKey, structuredClone(baseEntity) as PipelineEntity];
  if (insertIndex === -1) draftEntries.push(restored);
  else draftEntries.splice(insertIndex, 0, restored);
  draft.entities = Object.fromEntries(draftEntries);
  return draft;
}

/**
 * Undo of an entity's field. Its definition: the base's kind, home and summary, a removed entity back whole, an added one removed. A field
 * inside it: the base entity's value, or the default when the base has no such entity; nothing when the draft holds no such entity.
 */
function pipelineWithBaseEntityValueOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>, scope: EntityFieldScope): Pipeline {
  const { entityKey, field } = scope;
  const baseEntity  = entityOf(base, entityKey);
  const draftEntity = entityOf(draft, entityKey);
  if (field === null) {
    if (baseEntity !== undefined && draftEntity === undefined) {
      return withBaseEntityRestored(base, structuredClone(draft) as Pipeline, entityKey, baseEntity);
    }
    return pipelineWithEdit(draft, { target: 'entity', entityKey, value: baseEntity === undefined ? null : definitionOf(baseEntity) });
  }
  if (draftEntity === undefined) return structuredClone(draft) as Pipeline;
  const baseValueEntity = baseEntity ?? newEntityOf(definitionOf(draftEntity));
  const edit     = entityBaseEditOf(baseValueEntity, draftEntity, field);
  const restored = pipelineWithEdit(draft, { target: 'within-entity', entityKey, edit });
  const restoredEntity = entityOf(restored, entityKey);
  if (edit.target === 'gate' && edit.value !== null && restoredEntity !== undefined) restoreGatePlaces(baseValueEntity, restoredEntity, edit.name);
  return restored;
}

function pipelineWithBaseValueOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>, field: PipelineDraftField): Pipeline {
  const scope = entityScopeOf(field);
  if (scope !== null) return pipelineWithBaseEntityValueOf(base, draft, scope);
  const edit     = baseEditOf(base, draft, field);
  const restored = pipelineWithEdit(draft, edit);
  if (edit.target === 'gate' && edit.value !== null) restoreGatePlaces(base, restored, edit.name);
  return restored;
}

export const PipelineDraftEditUtil = Object.freeze({
  definitionOf,
  entityScopeOf,
  fieldIsWellFormed,
  fieldOf,
  pipelineWithBaseValueOf,
  pipelineWithEdit,
});
