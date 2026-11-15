/**
 * What a draft pipeline changes against a base one, field by field: the change list User reads before Apply, and the field names Apply's
 * log record carries. A field compares by its stored value, with the defaults the tracker model owns filled in: an absent approval or
 * instruction list equals its default, so writing a default out is no change.
 */
import { GATE_PHASES } from '../@types/GatePhase.ts';
import type {
  AgentStepSettings,
  Pipeline,
  PipelineAgentRole,
  PipelineAirlock,
  PipelineApproval,
  PipelineConstitution,
  PipelineDraftField,
  PipelineGate,
  PipelineReview,
  PipelineStep
} from '../@types/Pipeline.ts';
import { PIPELINE_AGENT_ROLES } from '../@types/Pipeline.ts';
import { PipelineUtil }         from './PipelineUtil.ts';

export type PipelineChangeKind = 'changed' | 'new' | 'removed';

export type PipelineFieldValue =
  | PipelineGate
  | PipelineStep
  | string[]
  | AgentStepSettings
  | PipelineReview
  | PipelineAirlock
  | boolean
  | PipelineConstitution;

/** `before` is null on a new field and `after` on a removed one. */
export interface PipelineChange {
  field:  PipelineDraftField;
  change: PipelineChangeKind;
  before: PipelineFieldValue | null;
  after:  PipelineFieldValue | null;
}

export interface PipelineChangedFieldNames {
  changedFields: PipelineDraftField[];
  newFields:     PipelineDraftField[];
  removedFields: PipelineDraftField[];
}

const PIPELINE_APPROVALS: readonly PipelineApproval[] = ['tickets', 'merge'];

/** An absent `tickets` approval is on; an absent `merge` approval is off. */
const APPROVAL_IS_ON_WHEN_ABSENT: Readonly<Record<PipelineApproval, boolean>> = Object.freeze({ tickets: true, merge: false });

function approvalIsOn(pipeline: Readonly<Pipeline>, approval: PipelineApproval): boolean {
  return pipeline.approvals?.[approval] ?? APPROVAL_IS_ON_WHEN_ABSENT[approval];
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
function changeOf(field: PipelineDraftField, before: PipelineFieldValue | undefined, after: PipelineFieldValue | undefined): PipelineChange[] {
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

function prepareChangesOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>): PipelineChange[] {
  const baseNames  = base.prepare.map((step) => step.name);
  const draftNames = draft.prepare.map((step) => step.name);
  const stepChanges = namesOfBoth(baseNames, draftNames).flatMap((name) => changeOf(
    `prepare:${name}`,
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

function gateChangesOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>): PipelineChange[] {
  const gateNames = namesOfBoth(base.gates.map((gate) => gate.name), draft.gates.map((gate) => gate.name));
  return gateNames.flatMap((name) => {
    const before = base.gates.find((gate) => gate.name === name);
    const after  = draft.gates.find((gate) => gate.name === name);
    if (before !== undefined && after !== undefined && sameValue(filledGateOf(before), filledGateOf(after))) return [];
    return changeOf(`gate:${name}`, before, after);
  });
}

function phaseOrderChangesOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>): PipelineChange[] {
  return GATE_PHASES.flatMap((phase) => changeOf(`phase-order:${phase}`, base.phases[phase], draft.phases[phase]));
}

/** The model and effort as stored, since their defaults are the app's; the instructions as read, since their defaults are the model's. */
function comparableSettingsOf(pipeline: Readonly<Pipeline>, role: PipelineAgentRole): object {
  const settings = pipeline.agents?.[role] ?? {};
  return { model: settings.model, effort: settings.effort, instructions: PipelineUtil.resolvedInstructionsOf(pipeline, role) };
}

/** A role's step always exists, so its settings only change. */
function roleChangesOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>): PipelineChange[] {
  return PIPELINE_AGENT_ROLES.flatMap((role) => (sameValue(comparableSettingsOf(base, role), comparableSettingsOf(draft, role))
    ? []
    : [{
      field: `role:${role}` as const, change: 'changed' as const, before: base.agents?.[role] ?? {}, after: draft.agents?.[role] ?? {}
    }]));
}

function approvalChangesOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>): PipelineChange[] {
  return PIPELINE_APPROVALS.flatMap((approval) => {
    const before = approvalIsOn(base, approval);
    const after  = approvalIsOn(draft, approval);
    return before === after ? [] : [{
      field: `approval:${approval}` as const, change: 'changed' as const, before, after
    }];
  });
}

/** The constitution text lives outside the pipeline, so the caller says whether it changed; a changed text alone is a changed row. */
function constitutionChangesOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>, constitutionTextChanged: boolean): PipelineChange[] {
  const pathChanges = changeOf('constitution', base.constitution, draft.constitution);
  if (pathChanges.length > 0 || !constitutionTextChanged) return pathChanges;
  return [{
    field: 'constitution', change: 'changed', before: base.constitution ?? null, after: draft.constitution ?? null
  }];
}

/**
 * Every field the draft changes, in the flow's order: prepare steps, gates, phase orders, review, merge train, roles, approvals, the
 * constitution. Billing is never a change row, as it is no part of the content hash.
 */
function changesBetween(base: Readonly<Pipeline>, draft: Readonly<Pipeline>, constitutionTextChanged: boolean): PipelineChange[] {
  return [
    ...prepareChangesOf(base, draft),
    ...gateChangesOf(base, draft),
    ...phaseOrderChangesOf(base, draft),
    ...changeOf('review', base.review, draft.review),
    ...changeOf('airlock', base.airlock, draft.airlock),
    ...roleChangesOf(base, draft),
    ...approvalChangesOf(base, draft),
    ...constitutionChangesOf(base, draft, constitutionTextChanged),
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
