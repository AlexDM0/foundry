/**
 * The draft pipeline edited one addressed field at a time: an edit written into a copy of the draft, the field an edit names, and Undo,
 * which writes the base pipeline's value of one field back. Nothing here judges whether the result is a valid pipeline: the stored file's
 * validator does that before an Apply.
 */
import { GATE_PHASES, type GatePhase } from '../@types/GatePhase.ts';
import {
  PIPELINE_AGENT_ROLES,
  type Pipeline,
  type PipelineAgentRole,
  type PipelineApproval
} from '../@types/Pipeline.ts';
import type { PipelineDraftEdit, PipelineDraftField } from '../@types/PipelineSetup.ts';

const PIPELINE_APPROVALS: readonly PipelineApproval[] = ['tickets', 'merge'];

const NAMED_FIELD_PREFIXES = ['gate:', 'prepare:'] as const;

function fieldOf(edit: PipelineDraftEdit): PipelineDraftField {
  switch (edit.target) {
    case 'gate':
      return `gate:${edit.name}`;
    case 'phase-order':
      return `phase-order:${edit.phase}`;
    case 'prepare':
      return `prepare:${edit.name}`;
    case 'role':
      return `role:${edit.role}`;
    case 'approval':
      return `approval:${edit.approval}`;
    case 'prepare-order':
    case 'review':
    case 'airlock':
    case 'constitution':
      return edit.target;
  }
}

function phaseIsKnown(text: string): text is GatePhase {
  return (GATE_PHASES as readonly string[]).includes(text);
}

function roleIsKnown(text: string): text is PipelineAgentRole {
  return (PIPELINE_AGENT_ROLES as readonly string[]).includes(text);
}

function approvalIsKnown(text: string): text is PipelineApproval {
  return (PIPELINE_APPROVALS as readonly string[]).includes(text);
}

/** A gate or prepare step names a non-blank name; a phase, role or approval one of its own vocabulary. */
function fieldIsWellFormed(text: string): text is PipelineDraftField {
  if (text === 'prepare-order' || text === 'review' || text === 'airlock' || text === 'constitution') return true;
  const namedPrefix = NAMED_FIELD_PREFIXES.find((prefix) => text.startsWith(prefix));
  if (namedPrefix !== undefined) return text.slice(namedPrefix.length).trim() !== '';
  const [kind, value = ''] = text.split(/:(.*)/su);
  if (kind === 'phase-order') return phaseIsKnown(value);
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

/** The draft with one field written; a removed gate also leaves every phase it ran in, so no phase names a gate that is gone. */
function pipelineWithEdit(pipeline: Readonly<Pipeline>, edit: PipelineDraftEdit): Pipeline {
  const draft = structuredClone(pipeline) as Pipeline;
  switch (edit.target) {
    case 'gate':
      if (edit.value === null) {
        draft.gates = draft.gates.filter((gate) => gate.name !== edit.name);
        for (const phase of GATE_PHASES) draft.phases[phase] = draft.phases[phase].filter((name) => name !== edit.name);
      } else {
        draft.gates = replacedOrAppended(draft.gates, edit.name, structuredClone(edit.value));
      }
      return draft;
    case 'phase-order':
      draft.phases[edit.phase] = [...edit.names];
      return draft;
    case 'prepare':
      draft.prepare = edit.value === null
        ? draft.prepare.filter((step) => step.name !== edit.name)
        : replacedOrAppended(draft.prepare, edit.name, structuredClone(edit.value));
      return draft;
    case 'prepare-order':
      draft.prepare = orderedByNames(draft.prepare, edit.names);
      return draft;
    case 'role': {
      const agents = { ...draft.agents };
      if (edit.value === null) Reflect.deleteProperty(agents, edit.role);
      else agents[edit.role] = structuredClone(edit.value);
      if (Object.keys(agents).length === 0) Reflect.deleteProperty(draft, 'agents');
      else draft.agents = agents;
      return draft;
    }
    case 'approval': {
      const approvals = { ...draft.approvals };
      if (edit.value === null) Reflect.deleteProperty(approvals, edit.approval);
      else approvals[edit.approval] = edit.value;
      if (Object.keys(approvals).length === 0) Reflect.deleteProperty(draft, 'approvals');
      else draft.approvals = approvals;
      return draft;
    }
    case 'review':
    case 'airlock':
    case 'constitution':
      if (edit.value === null) Reflect.deleteProperty(draft, edit.target);
      else Object.assign(draft, { [edit.target]: structuredClone(edit.value) });
      return draft;
  }
}

/** Back where the base has it: a gate Undo restores into no phase would leave a gate no phase runs. */
function withRestoredGatePlaces(base: Readonly<Pipeline>, draft: Pipeline, gateName: string): Pipeline {
  const runsInNoPhase = GATE_PHASES.every((phase) => !draft.phases[phase].includes(gateName));
  if (!runsInNoPhase) return draft;
  const restoredGate = draft.gates.find((gate) => gate.name === gateName);
  const baseIndex    = base.gates.findIndex((gate) => gate.name === gateName);
  if (restoredGate !== undefined) {
    draft.gates = draft.gates.filter((gate) => gate !== restoredGate);
    draft.gates.splice(Math.min(baseIndex, draft.gates.length), 0, restoredGate);
  }
  for (const phase of GATE_PHASES) {
    const baseIndex = base.phases[phase].indexOf(gateName);
    if (baseIndex !== -1) draft.phases[phase].splice(Math.min(baseIndex, draft.phases[phase].length), 0, gateName);
  }
  return draft;
}

/** The edit that writes the base's value of `field` over the draft's, which is what Undo does. */
function baseEditOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>, field: PipelineDraftField): PipelineDraftEdit {
  if (field === 'prepare-order') {
    const baseNames = base.prepare.map((step) => step.name);
    return { target: 'prepare-order', names: orderedByNames(draft.prepare, baseNames).map((step) => step.name) };
  }
  if (field === 'review' || field === 'airlock' || field === 'constitution') {
    const value = base[field] ?? null;
    return { target: field, value } as PipelineDraftEdit;
  }
  const [kind = '', name = ''] = field.split(/:(.*)/su);
  if (kind === 'gate') return { target: 'gate', name, value: base.gates.find((gate) => gate.name === name) ?? null };
  if (kind === 'prepare') return { target: 'prepare', name, value: base.prepare.find((step) => step.name === name) ?? null };
  if (kind === 'phase-order' && phaseIsKnown(name)) return { target: 'phase-order', phase: name, names: [...base.phases[name]] };
  if (kind === 'role' && roleIsKnown(name)) return { target: 'role', role: name, value: base.agents?.[name] ?? null };
  if (kind === 'approval' && approvalIsKnown(name)) return { target: 'approval', approval: name, value: base.approvals?.[name] ?? null };
  throw new Error(`${field} is not a draft field.`);
}

function pipelineWithBaseValueOf(base: Readonly<Pipeline>, draft: Readonly<Pipeline>, field: PipelineDraftField): Pipeline {
  const edit     = baseEditOf(base, draft, field);
  const restored = pipelineWithEdit(draft, edit);
  return edit.target === 'gate' && edit.value !== null ? withRestoredGatePlaces(base, restored, edit.name) : restored;
}

export const PipelineDraftEditUtil = Object.freeze({
  fieldIsWellFormed,
  fieldOf,
  pipelineWithBaseValueOf,
  pipelineWithEdit,
});
