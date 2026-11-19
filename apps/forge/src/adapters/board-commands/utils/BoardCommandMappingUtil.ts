/**
 * The contract's board command mapped into forge's own `ControlCommand` of the same kind, field by field, each readonly array copied into
 * the model's form. One branch per kind, so a kind the contract adds fails the typecheck until it is mapped here.
 */
import type {
  ChartRangeRequest,
  DecisionAnswerFormDocument,
  EntityDraftEditDocument,
  ForgeBoardCommand,
  PictureReferenceDocument,
  PipelineDraftEditDocument,
  PipelineEntityDefinitionDocument,
  PipelineStepsDraftEditDocument
} from 'forge-contracts/BoardCommand';
import type { AgentStepSettingsDocument, InstructionEntryDocument, PipelineGateDocument } from 'forge-contracts/BoardPipelineDocuments';

import type { DecisionAnswerForm }                                from '../../../lib/tracker-model/@types/Decision.ts';
import type { PictureReference }                                  from '../../../lib/tracker-model/@types/Job.ts';
import type { AgentStepSettings, InstructionEntry, PipelineGate } from '../../../lib/tracker-model/@types/Pipeline.ts';
import type {
  EntityDraftEdit,
  PipelineDraftEdit,
  PipelineEntityDefinition,
  PipelineStepsDraftEdit
} from '../../../lib/tracker-model/@types/PipelineSetup.ts';
import type { ChartRangeRequest as ForgeChartRangeRequest, ControlCommand } from '../../../shared/@types/ControlCommand.ts';

type BoardCommandOf<Kind extends ForgeBoardCommand['kind']> = Extract<ForgeBoardCommand, { kind: Kind }>;

type BoardCommandMappers = { readonly [Kind in ForgeBoardCommand['kind']]: (command: BoardCommandOf<Kind>) => ControlCommand };

function chartRangeOf(range: ChartRangeRequest): ForgeChartRangeRequest {
  return range.kind === 'automatic' ? { kind: 'automatic' } : {
    kind: 'window', from: range.from, to: range.to, tickMinutes: range.tickMinutes
  };
}

function answerOf(answer: DecisionAnswerFormDocument): DecisionAnswerForm {
  return answer.form === 'text' ? { form: 'text', text: answer.text } : { form: 'letters', choices: [...answer.choices] };
}

function picturesOf(pictures: readonly PictureReferenceDocument[] | undefined): { pictures?: PictureReference[] } {
  return pictures === undefined ? {} : { pictures: pictures.map((picture) => ({ pictureId: picture.pictureId, name: picture.name })) };
}

function gateOf(gate: PipelineGateDocument): PipelineGate {
  return {
    name: gate.name,
    run:  gate.run,
    ...(gate.fix === undefined ? {} : { fix: gate.fix }),
    ...(gate.in === undefined ? {} : { in: gate.in }),
    ...(gate.definedBy === undefined ? {} : { definedBy: [...gate.definedBy] }),
    ...(gate.network === undefined ? {} : { network: [...gate.network] }),
    ...(gate.writes === undefined ? {} : { writes: [...gate.writes] }),
    ...(gate.overseerOnly === undefined ? {} : { overseerOnly: gate.overseerOnly }),
  };
}

function instructionEntryOf(entry: InstructionEntryDocument): InstructionEntry {
  switch (entry.kind) {
    case 'constitution':
      return { kind: 'constitution' };
    case 'default-brief':
      return { kind: 'default-brief', role: entry.role };
    case 'file':
      return { kind: 'file', path: entry.path };
  }
}

function agentSettingsOf(settings: AgentStepSettingsDocument | null): AgentStepSettings | null {
  if (settings === null) return null;
  return {
    ...(settings.model === undefined ? {} : { model: settings.model }),
    ...(settings.effort === undefined ? {} : { effort: settings.effort }),
    ...(settings.instructions === undefined ? {} : { instructions: settings.instructions.map(instructionEntryOf) }),
  };
}

function entityDefinitionOf(definition: PipelineEntityDefinitionDocument | null): PipelineEntityDefinition | null {
  if (definition === null) return null;
  return { kind: definition.kind, home: [...definition.home], ...(definition.summary === undefined ? {} : { summary: definition.summary }) };
}

function listOrNullOf(list: readonly string[] | null): string[] | null {
  return list === null ? null : [...list];
}

function stepsEditOf(edit: PipelineStepsDraftEditDocument): PipelineStepsDraftEdit {
  switch (edit.target) {
    case 'gate':
      return { target: 'gate', name: edit.name, value: edit.value === null ? null : gateOf(edit.value) };
    case 'phase-order':
      return { target: 'phase-order', phase: edit.phase, names: [...edit.names] };
    case 'prepare':
      return { target: 'prepare', name: edit.name, value: edit.value === null ? null : { ...edit.value } };
    case 'prepare-order':
      return { target: 'prepare-order', names: [...edit.names] };
    case 'review':
      return { target: 'review', value: edit.value === null ? null : { ...edit.value, ...(edit.value.reReview === undefined ? {} : { reReview: { ...edit.value.reReview } }) } };
    case 'constitution':
      return { target: 'constitution', value: edit.value === null ? null : { path: edit.value.path } };
  }
}

function entityEditOf(edit: EntityDraftEditDocument): EntityDraftEdit {
  switch (edit.target) {
    case 'role':
      return { target: 'role', role: edit.role, value: agentSettingsOf(edit.value) };
    case 'whitelist':
      return { target: 'whitelist', value: listOrNullOf(edit.value) };
    case 'reach':
      return { target: 'reach', value: listOrNullOf(edit.value) };
    case 'depends-on':
      return { target: 'depends-on', value: listOrNullOf(edit.value) };
    case 'concurrency':
      return { target: 'concurrency', value: edit.value };
    default:
      return stepsEditOf(edit);
  }
}

/** The contract's typed draft edit as the model's, target for target. */
function draftEditOf(edit: PipelineDraftEditDocument): PipelineDraftEdit {
  switch (edit.target) {
    case 'role':
      return { target: 'role', role: edit.role, value: agentSettingsOf(edit.value) };
    case 'airlock':
      return { target: 'airlock', value: edit.value === null ? null : { ...(edit.value.reReview === undefined ? {} : { reReview: { ...edit.value.reReview } }) } };
    case 'approval':
      return { target: 'approval', approval: edit.approval, value: edit.value };
    case 'entity':
      return { target: 'entity', entityKey: edit.entityKey, value: entityDefinitionOf(edit.value) };
    case 'within-entity':
      return { target: 'within-entity', entityKey: edit.entityKey, edit: entityEditOf(edit.edit) };
    default:
      return stepsEditOf(edit);
  }
}

function optionalOf<Key extends string, Value>(key: Key, value: Value | undefined): { [Field in Key]?: Value } {
  return value === undefined ? {} : { [key]: value } as { [Field in Key]?: Value };
}

const MAPPER_OF_KIND: BoardCommandMappers = {
  'chart-range-set':    (command) => ({ kind: 'chart-range-set', range: chartRangeOf(command.range) }),
  'decision-answer':    (command) => ({ kind: 'decision-answer', decisionId: command.decisionId, answer: answerOf(command.answer) }),
  'gate-profile-start': (command) => ({
    kind: 'gate-profile-start', setupId: command.setupId, gateName: command.gateName, phase: command.phase, ...optionalOf('entity', command.entity)
  }),
  'gate-profile-stop': (command) => ({ kind: 'gate-profile-stop', profileRunId: command.profileRunId }),
  'intake-close':      (command) => ({
    kind:              'intake-close',
    ...optionalOf('jobId', command.jobId),
    proposedDraftSets: command.proposedDraftSets.map((draftSet) => [...draftSet]),
  }),
  'intake-start': (command) => ({ kind: 'intake-start', text: command.text, ...picturesOf(command.pictures) }),
  'job-fresh':    (command) => ({ kind: 'job-fresh', jobId: command.jobId, ...optionalOf('incidentId', command.incidentId) }),
  'job-message':  (command) => ({
    kind: 'job-message', jobId: command.jobId, text: command.text, ...picturesOf(command.pictures), ...optionalOf('incidentId', command.incidentId)
  }),
  'job-stop':              (command) => ({ kind: 'job-stop', jobId: command.jobId, mode: command.mode }),
  'merge-accept':          (command) => ({ kind: 'merge-accept', ticketReference: command.ticketReference }),
  'merge-update':          (command) => ({ kind: 'merge-update', ticketReference: command.ticketReference }),
  'pipeline-agent-advise': (command) => ({ kind: 'pipeline-agent-advise', ...optionalOf('entity', command.entity) }),
  'pipeline-apply':        (command) => ({
    kind: 'pipeline-apply', setupId: command.setupId, draftRevision: command.draftRevision, resumesBoard: command.resumesBoard
  }),
  'pipeline-apply-cancel':      (command) => ({ kind: 'pipeline-apply-cancel', setupId: command.setupId }),
  'pipeline-check':             (command) => ({ kind: 'pipeline-check', setupId: command.setupId }),
  'pipeline-constitution-edit': (command) => ({
    kind:     'pipeline-constitution-edit',
    setupId:  command.setupId,
    revision: command.revision,
    ...optionalOf('markdown', command.markdown),
    ...optionalOf('draftedFrom', command.draftedFrom === undefined ? undefined : { ...command.draftedFrom }),
    ...optionalOf('entity', command.entity),
  }),
  'pipeline-draft-discard': (command) => ({ kind: 'pipeline-draft-discard', setupId: command.setupId }),
  'pipeline-draft-edit':    (command) => ({
    kind:          'pipeline-draft-edit',
    setupId:       command.setupId,
    draftRevision: command.draftRevision,
    edits:         command.edits.map(draftEditOf),
    ...optionalOf('isACopy', command.isACopy),
  }),
  'pipeline-draft-undo': (command) => ({
    kind: 'pipeline-draft-undo', setupId: command.setupId, editId: command.editId, ...optionalOf('wholeBatch', command.wholeBatch)
  }),
  'pipeline-setup-answer': (command) => ({
    kind: 'pipeline-setup-answer', setupId: command.setupId, questionId: command.questionId, answer: answerOf(command.answer)
  }),
  'pipeline-setup-billing':    (command) => ({ kind: 'pipeline-setup-billing', setupId: command.setupId, billing: { ...command.billing } }),
  'pipeline-setup-resume':     (command) => ({ kind: 'pipeline-setup-resume', setupId: command.setupId }),
  'pipeline-setup-start':      (command) => ({ kind: 'pipeline-setup-start', billing: { ...command.billing }, replacesUnreadablePipeline: command.replacesUnreadablePipeline }),
  'pipeline-setup-start-over': (command) => ({ kind: 'pipeline-setup-start-over', setupId: command.setupId }),
  'pipeline-setup-step':       (command) => ({
    kind: 'pipeline-setup-step', setupId: command.setupId, step: command.step, move: command.move
  }),
  'pipeline-update-start':  (command) => ({ kind: 'pipeline-update-start', ...optionalOf('entity', command.entity) }),
  'ticket-deliver-by-hand': (command) => ({
    kind: 'ticket-deliver-by-hand', ticketReference: command.ticketReference, ...optionalOf('branch', command.branch), ...optionalOf('commit', command.commit)
  }),
  'ticket-hold':    (command) => ({ kind: 'ticket-hold', ticketReference: command.ticketReference, reason: command.reason }),
  'ticket-network': (command) => ({ kind: 'ticket-network', ticketReference: command.ticketReference, domains: [...command.domains] }),
  'ticket-park':    (command) => ({
    kind: 'ticket-park', ticketReference: command.ticketReference, reason: command.reason, ...optionalOf('incidentId', command.incidentId)
  }),
  'ticket-priority': (command) => ({ kind: 'ticket-priority', ticketReference: command.ticketReference, priority: command.priority }),
  'ticket-ready':    (command) => ({ kind: 'ticket-ready', ticketReferences: [...command.ticketReferences] }),
  'ticket-unhold':   (command) => ({ kind: 'ticket-unhold', ticketReference: command.ticketReference }),
  'tracker-clear':   (command) => ({ kind: 'tracker-clear', scope: command.scope }),
};

function mapperOf<Kind extends ForgeBoardCommand['kind']>(kind: Kind): (command: BoardCommandOf<Kind>) => ControlCommand {
  return MAPPER_OF_KIND[kind];
}

function controlCommandOf(command: ForgeBoardCommand): ControlCommand {
  return mapperOf(command.kind)(command);
}

export const BoardCommandMappingUtil = Object.freeze({
  controlCommandOf,
  draftEditOf,
});
