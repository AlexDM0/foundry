/**
 * The contract's board command, or its ticket document command, mapped into forge's own `ControlCommand` of the same kind, field by
 * field, each readonly array copied into the model's form. One branch per kind, so a kind the contract adds fails the typecheck until it
 * is mapped here.
 */
import type { PipelineAgentDocument, PipelineToolRequestDocument }                      from 'forge-contracts/BoardAgentDocuments';
import type { ChartRangeRequest, DecisionAnswerFormDocument, PictureReferenceDocument } from 'forge-contracts/BoardCommand';
import type {
  AgentStepSettingsDocument,
  EntityDraftEditDocument,
  InstructionEntryDocument,
  PipelineDraftEditDocument,
  PipelineEntityDefinitionDocument,
  PipelineGateDocument,
  PipelineStepsDraftEditDocument
} from 'forge-contracts/BoardPipelineDocuments';
import type { CommentAnchorDocument, DiagramAnchorDocument, LineRangeDocument } from 'forge-contracts/TicketDocumentsDocument';

import type { DecisionAnswerForm } from '../../../lib/tracker-model/@types/Decision.ts';
import type { PictureReference }   from '../../../lib/tracker-model/@types/Job.ts';
import type {
  AgentStepSettings,
  InstructionEntry,
  PipelineAgent,
  PipelineGate,
  PipelineTool
} from '../../../lib/tracker-model/@types/Pipeline.ts';
import type {
  EntityDraftEdit,
  PipelineDraftEdit,
  PipelineEntityDefinition,
  PipelineStepsDraftEdit
} from '../../../lib/tracker-model/@types/PipelineSetup.ts';
import type { CommentAnchor, DiagramAnchor, LineRange }                     from '../../../lib/tracker-model/@types/TicketDocument.ts';
import type { ChartRangeRequest as ForgeChartRangeRequest, ControlCommand } from '../../../shared/@types/ControlCommand.ts';
import type { BoardContractCommand }                                        from './BoardCommandReadingUtil.ts';

type BoardCommandOf<Kind extends BoardContractCommand['kind']> = Extract<BoardContractCommand, { kind: Kind }>;

type BoardCommandMappers = { readonly [Kind in BoardContractCommand['kind']]: (command: BoardCommandOf<Kind>) => ControlCommand };

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
    ...(gate.forgeOnly === undefined ? {} : { forgeOnly: gate.forgeOnly }),
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

function documentReadingRulesOf(documents: NonNullable<AgentStepSettingsDocument['documents']>): NonNullable<AgentStepSettings['documents']> {
  return {
    ...(documents.spec === undefined ? {} : { spec: documents.spec }),
    ...(documents.plan === undefined ? {} : { plan: documents.plan }),
  };
}

function agentSettingsOf(settings: AgentStepSettingsDocument | null): AgentStepSettings | null {
  if (settings === null) return null;
  return {
    ...(settings.model === undefined ? {} : { model: settings.model }),
    ...(settings.effort === undefined ? {} : { effort: settings.effort }),
    ...(settings.instructions === undefined ? {} : { instructions: settings.instructions.map(instructionEntryOf) }),
    ...(settings.documents === undefined ? {} : { documents: documentReadingRulesOf(settings.documents) }),
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
    case 'tools':
      return { target: 'tools', value: toolsOf(edit.value) };
    case 'approval':
      return { target: 'approval', approval: edit.approval, value: edit.value };
    case 'ticket-writing':
      return { target: 'ticket-writing', value: edit.value };
    case 'entity':
      return { target: 'entity', entityKey: edit.entityKey, value: entityDefinitionOf(edit.value) };
    case 'within-entity':
      return { target: 'within-entity', entityKey: edit.entityKey, edit: entityEditOf(edit.edit) };
    default:
      return stepsEditOf(edit);
  }
}

function lineRangeOf(range: LineRangeDocument): LineRange {
  return { from: range.from, to: range.to };
}

function diagramAnchorOf(diagram: DiagramAnchorDocument): DiagramAnchor {
  return {
    lines: lineRangeOf(diagram.lines), diagramKind: diagram.diagramKind, nodeId: diagram.nodeId, nodeLabel: diagram.nodeLabel
  };
}

function commentAnchorOf(anchor: CommentAnchorDocument | null): CommentAnchor | null {
  if (anchor === null) return null;
  return {
    view:             anchor.view,
    versionNumber:    anchor.versionNumber,
    lines:            lineRangeOf(anchor.lines),
    ...(anchor.columns === undefined ? {} : { columns: lineRangeOf(anchor.columns) }),
    sectionPath:      [...anchor.sectionPath],
    ...(anchor.quote === undefined ? {} : { quote: anchor.quote }),
    surroundingLines: lineRangeOf(anchor.surroundingLines),
    ...(anchor.diagram === undefined ? {} : { diagram: diagramAnchorOf(anchor.diagram) }),
  };
}

/** A tool still named alone was not found before the command was mapped: its empty path is refused where the tools are checked. */
function toolsOf(tools: readonly PipelineToolRequestDocument[] | null): PipelineTool[] | null {
  return tools === null ? null : tools.map((tool) => ({ name: tool.name, path: tool.path ?? '' }));
}

function agentOf(agent: PipelineAgentDocument): PipelineAgent {
  return { vendor: agent.vendor, program: 'pinned' in agent.program ? { pinned: agent.program.pinned } : { follows: 'machine' } };
}

function optionalOf<Key extends string, Value>(key: Key, value: Value | undefined): { [Field in Key]?: Value } {
  return value === undefined ? {} : { [key]: value } as { [Field in Key]?: Value };
}

const MAPPER_OF_KIND: BoardCommandMappers = {
  'agent-look-again':   () => ({ kind: 'agent-look-again' }),
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
  'pipeline-agent-set':    (command) => ({ kind: 'pipeline-agent-set', agent: agentOf(command.agent) }),
  'pipeline-apply':        (command) => ({
    kind: 'pipeline-apply', setupId: command.setupId, draftRevision: command.draftRevision, resumesBoard: command.resumesBoard
  }),
  'pipeline-apply-cancel':      (command) => ({ kind: 'pipeline-apply-cancel', setupId: command.setupId }),
  'pipeline-assistant-set':     (command) => ({ kind: 'pipeline-assistant-set', on: command.on }),
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
  'pipeline-setup-agent':   (command) => ({ kind: 'pipeline-setup-agent', setupId: command.setupId, agent: agentOf(command.agent) }),
  'pipeline-setup-billing': (command) => ({ kind: 'pipeline-setup-billing', setupId: command.setupId, billing: { ...command.billing } }),
  'pipeline-setup-resume':  (command) => ({ kind: 'pipeline-setup-resume', setupId: command.setupId }),
  'pipeline-setup-start':   (command) => ({
    kind:                       'pipeline-setup-start',
    agent:                      agentOf(command.agent),
    replacesUnreadablePipeline: command.replacesUnreadablePipeline,
    ...optionalOf('billing', command.billing === undefined ? undefined : { ...command.billing }),
  }),
  'pipeline-setup-start-over': (command) => ({ kind: 'pipeline-setup-start-over', setupId: command.setupId }),
  'pipeline-setup-step':       (command) => ({
    kind: 'pipeline-setup-step', setupId: command.setupId, step: command.step, move: command.move
  }),
  'pipeline-tools-set':     (command) => ({ kind: 'pipeline-tools-set', tools: toolsOf(command.tools) }),
  'pipeline-update-start':  (command) => ({ kind: 'pipeline-update-start', ...optionalOf('entity', command.entity) }),
  'ticket-deliver-by-hand': (command) => ({
    kind: 'ticket-deliver-by-hand', ticketReference: command.ticketReference, ...optionalOf('branch', command.branch), ...optionalOf('commit', command.commit)
  }),
  'ticket-hold':    (command) => ({ kind: 'ticket-hold', ticketReference: command.ticketReference, reason: command.reason }),
  'ticket-network': (command) => ({ kind: 'ticket-network', ticketReference: command.ticketReference, domains: [...command.domains] }),
  'ticket-park':    (command) => ({
    kind: 'ticket-park', ticketReference: command.ticketReference, reason: command.reason, ...optionalOf('incidentId', command.incidentId)
  }),
  'ticket-priority':      (command) => ({ kind: 'ticket-priority', ticketReference: command.ticketReference, priority: command.priority }),
  'ticket-ready':         (command) => ({ kind: 'ticket-ready', ticketReferences: [...command.ticketReferences] }),
  'ticket-unhold':        (command) => ({ kind: 'ticket-unhold', ticketReference: command.ticketReference }),
  'tracker-clear':        (command) => ({ kind: 'tracker-clear', scope: command.scope }),
  'ticket-document-save': (command) => ({
    kind: 'ticket-document-save', ticketReference: command.ticketReference, document: command.document, baseVersion: command.baseVersion, markdown: command.markdown
  }),
  'ticket-document-comment': (command) => ({
    kind: 'ticket-document-comment', ticketReference: command.ticketReference, document: command.document, anchor: commentAnchorOf(command.anchor), text: command.text
  }),
  'ticket-document-comment-withdraw': (command) => ({
    kind: 'ticket-document-comment-withdraw', ticketReference: command.ticketReference, document: command.document, messageId: command.messageId
  }),
  'ticket-document-proposal-apply': (command) => ({
    kind:            'ticket-document-proposal-apply',
    ticketReference: command.ticketReference,
    document:        command.document,
    proposalId:      command.proposalId,
    ...optionalOf('replacementLines', command.replacementLines?.map((lines) => [...lines])),
  }),
  'ticket-document-proposal-discard': (command) => ({
    kind: 'ticket-document-proposal-discard', ticketReference: command.ticketReference, document: command.document, proposalId: command.proposalId
  }),
  'ticket-document-mode-set': (command) => ({
    kind: 'ticket-document-mode-set', ticketReference: command.ticketReference, document: command.document, mode: command.mode
  }),
  'ticket-document-approve': (command) => ({
    kind: 'ticket-document-approve', ticketReference: command.ticketReference, document: command.document, version: command.version
  }),
  'ticket-document-effect-read': (command) => ({
    kind: 'ticket-document-effect-read', ticketReference: command.ticketReference, document: command.document, version: command.version
  }),
  'ticket-document-turn-stop': (command) => ({ kind: 'ticket-document-turn-stop', ticketReference: command.ticketReference, document: command.document }),
};

function mapperOf<Kind extends BoardContractCommand['kind']>(kind: Kind): (command: BoardCommandOf<Kind>) => ControlCommand {
  return MAPPER_OF_KIND[kind];
}

function controlCommandOf(command: BoardContractCommand): ControlCommand {
  return mapperOf(command.kind)(command);
}

export const BoardCommandMappingUtil = Object.freeze({
  controlCommandOf,
  draftEditOf,
  /** The mapper of each board kind, keyed by kind, so a spec can hold that every kind a client sends is ingested. */
  mapperOfKind: MAPPER_OF_KIND,
});
