/**
 * What a draft pipeline changes against a base one, field by field, for the list User reads before Apply and Apply's log record. Fields
 * compare with the tracker model's defaults filled in, so writing a default out is no change; an entity only one side holds compares with
 * an empty one.
 */
import { GATE_PHASES, type GatePhase } from '../@types/GatePhase.ts';
import type {
  AgentStepSettings,
  EntityKey,
  Pipeline,
  PipelineAgentRole,
  PipelineAirlock,
  PipelineApproval,
  PipelineConstitution,
  PipelineEntity,
  PipelineGate,
  PipelineReview,
  PipelineStep,
  TicketWritingRoute
} from '../@types/Pipeline.ts';
import { ENTITY_AGENT_ROLES, PIPELINE_AGENT_ROLES }                            from '../@types/Pipeline.ts';
import type { EntityDraftField, PipelineDraftField, PipelineEntityDefinition } from '../@types/PipelineSetup.ts';
import { TICKET_DOCUMENT_KINDS }                                               from '../@types/TicketDocument.ts';
import { DEFAULT_APPROVALS }                                                   from '../constants/PipelineDefaults.ts';
import { PipelineDraftEditUtil }                                               from './PipelineDraftEditUtil.ts';
import { PipelineUtil }                                                        from './PipelineUtil.ts';
import { TicketWritingUtil }                                                   from './TicketWritingUtil.ts';

export type PipelineChangeKind = 'changed' | 'new' | 'removed';

export type PipelineFieldValue =
  | PipelineGate
  | PipelineStep
  | string[]
  | AgentStepSettings
  | PipelineReview
  | PipelineAirlock
  | boolean
  | PipelineConstitution
  | PipelineEntityDefinition
  | TicketWritingRoute
  | number;

/** `before` is null on a new field and `after` on a removed one. */
export interface PipelineChange<Field extends string = PipelineDraftField> {
  field:  Field;
  change: PipelineChangeKind;
  before: PipelineFieldValue | null;
  after:  PipelineFieldValue | null;
}

export interface PipelineChangedFieldNames {
  changedFields: PipelineDraftField[];
  newFields:     PipelineDraftField[];
  removedFields: PipelineDraftField[];
}

const PIPELINE_APPROVALS: readonly PipelineApproval[] = ['tickets', 'merge', 'spec', 'plan'];

function approvalIsOn(pipeline: Readonly<Pipeline>, approval: PipelineApproval): boolean {
  return pipeline.approvals?.[approval] ?? DEFAULT_APPROVALS[approval];
}

/** Object keys sorted and absent keys dropped, so a hand edit that only reorders keys compares equal; array order counts. */
function comparableTextOf(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) => {
    if (nested === null || typeof nested !== 'object' || Array.isArray(nested)) return nested;
    return Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b)));
  });
}

function sameValue(base: unknown, draft: unknown): boolean {
  return comparableTextOf(base) === comparableTextOf(draft);
}

/** A field present on one side only is new or removed; on both, changed when the values differ. */
function changeOf<Field extends string>(field: Field, before: PipelineFieldValue | undefined, after: PipelineFieldValue | undefined): PipelineChange<Field>[] {
  if (before === undefined && after === undefined) return [];
  if (before === undefined) return [{
    field, change: 'new', before: null, after: after ?? null
  }];
  if (after === undefined) return [{
    field, change: 'removed', before, after: null
  }];
  return sameValue(before, after) ? [] : [{
    field, change: 'changed', before, after
  }];
}

/** Base order for what the base holds, then what only the draft holds, in draft order. */
function namesOfBoth(baseNames: readonly string[], draftNames: readonly string[]): string[] {
  return [...baseNames, ...draftNames.filter((name) => !baseNames.includes(name))];
}

function prepareChangesOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>): PipelineChange<`prepare:${string}` | 'prepare-order'>[] {
  const baseNames  = base.prepare.map((step) => step.name);
  const draftNames = draft.prepare.map((step) => step.name);
  const stepChanges = namesOfBoth(baseNames, draftNames).flatMap((name) => changeOf(
    `prepare:${name}` as const,
    base.prepare.find((step) => step.name === name),
    draft.prepare.find((step) => step.name === name),
  ));
  // An added or removed step is its own row; the order row is only a reorder of the steps both sides hold.
  const baseOrderOfShared  = baseNames.filter((name) => draftNames.includes(name));
  const draftOrderOfShared = draftNames.filter((name) => baseNames.includes(name));
  const orderChange = sameValue(baseOrderOfShared, draftOrderOfShared)
    ? []
    : [{
      field: 'prepare-order' as const, change: 'changed' as const, before: baseNames, after: draftNames
    }];
  return [...stepChanges, ...orderChange];
}

/** An absent list option reads as empty, as the hashes read it, so writing it out as `[]` is no change. */
function filledGateOf(gate: Readonly<PipelineGate>): object {
  return {
    ...gate, definedBy: gate.definedBy ?? [], network: gate.network ?? [], writes: gate.writes ?? []
  };
}

function gateChangesOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>): PipelineChange<`gate:${string}`>[] {
  const gateNames = namesOfBoth(base.gates.map((gate) => gate.name), draft.gates.map((gate) => gate.name));
  return gateNames.flatMap((name) => {
    const before = base.gates.find((gate) => gate.name === name);
    const after  = draft.gates.find((gate) => gate.name === name);
    if (before !== undefined && after !== undefined && sameValue(filledGateOf(before), filledGateOf(after))) return [];
    return changeOf(`gate:${name}` as const, before, after);
  });
}

function phaseOrderChangesOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>): PipelineChange<`phase-order:${GatePhase}`>[] {
  return GATE_PHASES.flatMap((phase) => changeOf(`phase-order:${phase}` as const, base.phases[phase], draft.phases[phase]));
}

/** The documents the builder or the reviewer reads as read, each default filled in; no other role reads one. */
function comparableDocumentsOf(pipeline: Readonly<Pipeline>, role: PipelineAgentRole): object | undefined {
  if (role !== 'builder' && role !== 'reviewer') return undefined;
  return Object.fromEntries(TICKET_DOCUMENT_KINDS.map((document) => [document, TicketWritingUtil.documentReadingRuleOf(pipeline, role, document)]));
}

/**
 * The model and effort as stored, since their defaults are the app's; the instructions and the documents as read, since their defaults
 * are the model's.
 */
function comparableSettingsOf(pipeline: Readonly<Pipeline>, role: PipelineAgentRole): object {
  const settings = pipeline.agents?.[role] ?? {};
  return {
    model:        settings.model,
    effort:       settings.effort,
    instructions: PipelineUtil.resolvedInstructionsOf(pipeline, role),
    documents:    comparableDocumentsOf(pipeline, role),
  };
}

/** A role's step always exists, so its settings only change. */
function roleChangesOf<Role extends PipelineAgentRole>(base: Readonly<Pipeline>, draft: Readonly<Pipeline>, roles: readonly Role[]): PipelineChange<`role:${Role}`>[] {
  return roles.flatMap((role) => (sameValue(comparableSettingsOf(base, role), comparableSettingsOf(draft, role))
    ? []
    : [{
      field: `role:${role}` as const, change: 'changed' as const, before: base.agents?.[role] ?? {}, after: draft.agents?.[role] ?? {}
    }]));
}

function approvalChangesOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>): PipelineChange<`approval:${PipelineApproval}`>[] {
  return PIPELINE_APPROVALS.flatMap((approval) => {
    const before = approvalIsOn(base, approval);
    const after  = approvalIsOn(draft, approval);
    return before === after ? [] : [{
      field: `approval:${approval}` as const, change: 'changed' as const, before, after
    }];
  });
}

/** The route always exists, `one-ticket` where the file names none, so it only changes, and writing out the default is no change. */
function ticketWritingChangesOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>): PipelineChange<'ticket-writing'>[] {
  const before = TicketWritingUtil.routeOf(base);
  const after  = TicketWritingUtil.routeOf(draft);
  return before === after ? [] : [{
    field: 'ticket-writing', change: 'changed', before, after
  }];
}

/** The constitution text lives outside the pipeline, so the caller says whether it changed; a changed text alone is a changed row. */
function constitutionChangesOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>, constitutionTextChanged: boolean): PipelineChange<'constitution'>[] {
  const pathChanges = changeOf('constitution', base.constitution, draft.constitution);
  if (pathChanges.length > 0 || !constitutionTextChanged) return pathChanges;
  return [{
    field: 'constitution', change: 'changed', before: base.constitution ?? null, after: draft.constitution ?? null
  }];
}

function entityOf(pipeline: Readonly<Pipeline>, entityKey: EntityKey): PipelineEntity | undefined {
  const { entities } = pipeline;
  return entities !== undefined && Object.hasOwn(entities, entityKey) ? entities[entityKey] : undefined;
}

/** An empty list reads as absent, as an absent whitelist crosses into none and an absent reach reaches none. */
function listOrAbsentOf(list: readonly string[] | undefined): string[] | undefined {
  return list === undefined || list.length === 0 ? undefined : [...list];
}

/**
 * The fields inside one entity, in the flow's order and then its whitelist, reach, dependencies and cap. The constitution compares by its
 * path only: whether an entity's text changed is the caller's, per entity.
 */
function withinEntityChangesOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>, entityKey: EntityKey): PipelineChange[] {
  const before         = entityOf(base, entityKey);
  const after          = entityOf(draft, entityKey);
  const basePipeline   = PipelineUtil.pipelineOfEntity(base, entityKey) ?? PipelineUtil.minimalPipelineOf();
  const draftPipeline  = PipelineUtil.pipelineOfEntity(draft, entityKey) ?? PipelineUtil.minimalPipelineOf();
  const changes: PipelineChange<EntityDraftField>[] = [
    ...prepareChangesOf(basePipeline, draftPipeline),
    ...gateChangesOf(basePipeline, draftPipeline),
    ...phaseOrderChangesOf(basePipeline, draftPipeline),
    ...changeOf('review', basePipeline.review, draftPipeline.review),
    ...roleChangesOf(basePipeline, draftPipeline, ENTITY_AGENT_ROLES),
    ...changeOf('constitution', basePipeline.constitution, draftPipeline.constitution),
    ...changeOf('whitelist', listOrAbsentOf(before?.whitelist), listOrAbsentOf(after?.whitelist)),
    ...changeOf('reach', listOrAbsentOf(before?.reach), listOrAbsentOf(after?.reach)),
    ...changeOf('depends-on', listOrAbsentOf(before?.dependsOn), listOrAbsentOf(after?.dependsOn)),
    ...changeOf('concurrency', before?.concurrency, after?.concurrency),
  ];
  return changes.map((change) => ({ ...change, field: `entity:${entityKey}/${change.field}` as const }));
}

/** Each entity of either side, in base order and then the draft's new ones: its definition's row, then the rows inside it. */
function entityChangesOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>): PipelineChange[] {
  const entityKeys = namesOfBoth(Object.keys(base.entities ?? {}), Object.keys(draft.entities ?? {}));
  return entityKeys.flatMap((entityKey) => {
    const before = entityOf(base, entityKey);
    const after  = entityOf(draft, entityKey);
    return [
      ...changeOf(
        `entity:${entityKey}` as const,
        before === undefined ? undefined : PipelineDraftEditUtil.definitionOf(before),
        after === undefined ? undefined : PipelineDraftEditUtil.definitionOf(after),
      ),
      ...withinEntityChangesOf(base, draft, entityKey),
    ];
  });
}

/**
 * Every field the draft changes, in the flow's order: prepare steps, gates, phase orders, review, merge train, roles, approvals, the
 * ticket writing route, the constitution, then each entity. Billing is never a change row, as it is no part of the content hash.
 */
function changesBetween(base: Readonly<Pipeline>, draft: Readonly<Pipeline>, constitutionTextChanged: boolean): PipelineChange[] {
  return [
    ...prepareChangesOf(base, draft),
    ...gateChangesOf(base, draft),
    ...phaseOrderChangesOf(base, draft),
    ...changeOf('review', base.review, draft.review),
    ...changeOf('airlock', base.airlock, draft.airlock),
    ...roleChangesOf(base, draft, PIPELINE_AGENT_ROLES),
    ...approvalChangesOf(base, draft),
    ...ticketWritingChangesOf(base, draft),
    ...constitutionChangesOf(base, draft, constitutionTextChanged),
    ...entityChangesOf(base, draft),
  ];
}

function changedFieldNamesOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>, constitutionTextChanged: boolean): PipelineChangedFieldNames {
  const changes = changesBetween(base, draft, constitutionTextChanged);
  const fieldsOf = (kind: PipelineChangeKind): PipelineDraftField[] => changes.filter((change) => change.change === kind).map((change) => change.field);
  return { changedFields: fieldsOf('changed'), newFields: fieldsOf('new'), removedFields: fieldsOf('removed') };
}

export const PipelineChangeUtil = Object.freeze({
  approvalIsOn,
  changedFieldNamesOf,
  changesBetween,
});
