/**
 * Maps Gaia's `BoardCommand` out to the forge's contract command of the same kind, through one table keyed by every kind Gaia sends: the
 * table's type maps each kind only onto the contract's command of that kind, so a kind the contract does not take fails to compile here.
 * Gaia's values reach the contract through a record per union, `Record<Gaia value, forge value>`.
 */
import type {
  ChartRangeRequest,
  DecisionAnswerFormDocument,
  ForgeBoardCommand,
  ForgeTicketDocumentCommand,
  PictureReferenceDocument,
  TrackerClearScope,
} from 'forge-contracts/BoardCommand';
import type {
  AgentStepSettingsDocument,
  ConditionalReReviewDocument,
  EntityDraftEditDocument,
  InstructionEntryDocument,
  PipelineApproval,
  PipelineBillingDocument,
  PipelineDraftEditDocument,
  PipelineGateDocument,
  PipelineReviewDocument,
  PipelineSetupStep,
  PipelineStepDocument,
  PipelineStepsDraftEditDocument,
} from 'forge-contracts/BoardPipelineDocuments';
import type {
  AgentEffort,
  AgentModel,
  DocumentReadingRule,
  EntityAgentRole,
  EntityKind,
  GatePhase,
  PipelineAgentRole,
  ProposalMode,
  TicketDocumentKind,
  TicketPriority,
  TicketWritingRoute,
} from 'forge-contracts/BoardVocabulary';
import type { ForgeControlCommand, ForgeJobStopMode, ForgeResumeTarget } from 'forge-contracts/ForgeControlCommand';
import type { CommentAnchorDocument, LineRangeDocument }                 from 'forge-contracts/TicketDocumentsDocument';

import type {
  BoardAnswerForm,
  BoardChartRange,
  BoardCommand,
  BoardCommandKind,
  BoardPictureReference,
  BoardResumeTarget,
  BoardTrackerClearScope,
} from '../../../shared/@types/board/BoardCommand.ts';
import type {
  BoardAgentStepSettings,
  BoardBilling,
  BoardConditionalReReview,
  BoardDraftEdit,
  BoardEntityDraftEdit,
  BoardInstruction,
  BoardPipelineGate,
  BoardPipelineReview,
  BoardPipelineStep,
  BoardStepsDraftEdit,
} from '../../../shared/@types/board/BoardPipeline.ts';
import type * as Gaia                              from '../../../shared/@types/board/BoardVocabulary.ts';
import type { BoardCommentAnchor, BoardLineRange } from '../../../shared/@types/board/TicketDocuments.ts';
import { BoardAgentMapUtil }                       from './BoardAgentMapUtil.ts';

export type ContractCommand = ForgeControlCommand | ForgeBoardCommand | ForgeTicketDocumentCommand;

type BoardCommandOf<Kind extends BoardCommandKind> = Extract<BoardCommand, { readonly kind: Kind }>;

type ContractCommandOf<Kind extends BoardCommandKind> = Extract<ContractCommand, { readonly kind: Kind }>;

const GATE_PHASE = { build: 'build', review: 'review', merge: 'merge' } as const satisfies Record<Gaia.BoardGatePhase, GatePhase>;

const JOB_STOP_MODE = { 'stop': 'stop', 'wind-down': 'wind-down' } as const satisfies Record<Gaia.BoardJobStopMode, ForgeJobStopMode>;

const TICKET_PRIORITY = { low: 'low', normal: 'normal', high: 'high' } as const satisfies Record<Gaia.BoardTicketPriority, TicketPriority>;

const ENTITY_AGENT_ROLE = {
  builder:            'builder',
  reviewer:           'reviewer',
  reReviewer:         'reReviewer',
  conflictReReviewer: 'conflictReReviewer',
} as const satisfies Record<Gaia.BoardEntityAgentRole, EntityAgentRole>;

const PIPELINE_AGENT_ROLE = {
  ...ENTITY_AGENT_ROLE,
  productOwner:  'productOwner',
  specAgent:     'specAgent',
  planAgent:     'planAgent',
  pipelineAgent: 'pipelineAgent',
  assistant:     'assistant',
} as const satisfies Record<Gaia.BoardPipelineAgentRole, PipelineAgentRole>;

const AGENT_MODEL = {
  haiku:  'haiku',
  sonnet: 'sonnet',
  opus:   'opus',
  fable:  'fable',
} as const satisfies Record<Gaia.BoardAgentModel, AgentModel>;

const AGENT_EFFORT = {
  low:    'low',
  medium: 'medium',
  high:   'high',
  xhigh:  'xhigh',
  max:    'max',
} as const satisfies Record<Gaia.BoardAgentEffort, AgentEffort>;

const PIPELINE_APPROVAL = {
  tickets: 'tickets', merge: 'merge', spec: 'spec', plan: 'plan'
} as const satisfies Record<Gaia.BoardPipelineApproval, PipelineApproval>;

const TICKET_WRITING_ROUTE = { 'one-ticket': 'one-ticket', 'spec-then-plan': 'spec-then-plan' } as const satisfies Record<Gaia.BoardTicketWritingRoute, TicketWritingRoute>;

const ENTITY_KIND = { app: 'app', package: 'package', root: 'root' } as const satisfies Record<Gaia.BoardEntityKind, EntityKind>;

const SETUP_STEP = {
  agent:        'agent',
  billing:      'billing',
  research:     'research',
  entities:     'entities',
  constitution: 'constitution',
  design:       'design',
  apply:        'apply',
} as const satisfies Record<Gaia.BoardSetupStep, PipelineSetupStep>;

const TRACKER_CLEAR_SCOPE = { 'tasks-and-log': 'tasks-and-log', 'everything': 'everything' } as const satisfies Record<BoardTrackerClearScope, TrackerClearScope>;

const TICKET_DOCUMENT_KIND = { spec: 'spec', plan: 'plan' } as const satisfies Record<Gaia.BoardTicketDocumentKind, TicketDocumentKind>;

type DocumentReadingRules = Record<Gaia.BoardDocumentReadingRule, DocumentReadingRule>;

const DOCUMENT_READING_RULE = { 'always': 'always', 'if-person-approved': 'if-person-approved', 'never': 'never' } as const satisfies DocumentReadingRules;

const PROPOSAL_MODE = { 'ask-first': 'ask-first', 'auto-apply': 'auto-apply' } as const satisfies Record<Gaia.BoardProposalMode, ProposalMode>;

const COMMENT_VIEW = { preview: 'preview', code: 'code' } as const satisfies Record<Gaia.BoardCommentView, CommentAnchorDocument['view']>;

/** A contract key that is absent rather than `null`: present only when Gaia's value is. */
function presentKeyOf<Key extends string, Value>(key: Key, value: Value | null): Partial<Record<Key, Value>> {
  return value === null ? {} : { [key]: value } as Record<Key, Value>;
}

function chartRangeOut(range: BoardChartRange): ChartRangeRequest {
  if (range.kind === 'automatic') return { kind: 'automatic' };
  return {
    kind: 'window', from: range.from, to: range.to, tickMinutes: range.tickMinutes
  };
}

function answerOut(answer: BoardAnswerForm): DecisionAnswerFormDocument {
  if (answer.form === 'text') return { form: 'text', text: answer.text };
  return { form: 'letters', choices: answer.choices, ...answer.note === undefined ? {} : { note: answer.note } };
}

function picturesOut(pictures: readonly BoardPictureReference[]): Partial<Record<'pictures', readonly PictureReferenceDocument[]>> {
  return pictures.length === 0 ? {} : { pictures: pictures.map((picture) => ({ pictureId: picture.pictureId, name: picture.name })) };
}

function resumeTargetOut(target: BoardResumeTarget): ForgeResumeTarget {
  if (target === 'all') return 'all';
  return 'jobId' in target ? { jobId: target.jobId } : { ticketReference: target.ticketReference };
}

function billingOut(billing: BoardBilling): PipelineBillingDocument {
  if (billing.mode === 'subscription') return { mode: 'subscription' };
  return { mode: 'api', ...presentKeyOf('maxBudgetUsd', billing.maximumBudgetDollars) };
}

function reReviewOut(reReview: BoardConditionalReReview | null): { readonly reReview?: ConditionalReReviewDocument } {
  return reReview === null ? {} : { reReview: { thresholdLines: reReview.thresholdLines } };
}

function stepOut(step: BoardPipelineStep): PipelineStepDocument {
  return { name: step.name, run: step.run, ...presentKeyOf('in', step.runsIn) };
}

function gateOut(gate: BoardPipelineGate): PipelineGateDocument {
  return {
    name:    gate.name,
    run:     gate.run,
    ...presentKeyOf('fix', gate.fix),
    ...presentKeyOf('in', gate.runsIn),
    network: gate.network,
    writes:  gate.writes,
  };
}

function reviewOut(review: BoardPipelineReview | null): PipelineReviewDocument | null {
  return review === null ? null : { name: review.name, ...reReviewOut(review.reReview) };
}

function instructionOut(instruction: BoardInstruction): InstructionEntryDocument {
  switch (instruction.kind) {
    case 'constitution':
      return { kind: 'constitution' };
    case 'default-brief':
      return { kind: 'default-brief', role: PIPELINE_AGENT_ROLE[instruction.role] };
    case 'file':
      return { kind: 'file', path: instruction.path };
  }
}

function documentReadingRulesOut(rules: NonNullable<BoardAgentStepSettings['documents']>): NonNullable<AgentStepSettingsDocument['documents']> {
  return {
    ...rules.spec === undefined ? {} : { spec: DOCUMENT_READING_RULE[rules.spec] },
    ...rules.plan === undefined ? {} : { plan: DOCUMENT_READING_RULE[rules.plan] },
  };
}

function agentStepSettingsOut(settings: BoardAgentStepSettings | null): AgentStepSettingsDocument | null {
  if (settings === null) return null;
  return {
    ...presentKeyOf('model', settings.model === null ? null : AGENT_MODEL[settings.model]),
    ...presentKeyOf('effort', settings.effort === null ? null : AGENT_EFFORT[settings.effort]),
    ...presentKeyOf('instructions', settings.instructions === null ? null : settings.instructions.map(instructionOut)),
    ...presentKeyOf('documents', settings.documents === undefined ? null : documentReadingRulesOut(settings.documents)),
  };
}

function lineRangeOut(range: BoardLineRange): LineRangeDocument {
  return { from: range.from, to: range.to };
}

function commentAnchorOut(anchor: BoardCommentAnchor): CommentAnchorDocument {
  return {
    view:             COMMENT_VIEW[anchor.view],
    versionNumber:    anchor.versionNumber,
    lines:            lineRangeOut(anchor.lines),
    ...presentKeyOf('columns', anchor.columns === null ? null : { from: anchor.columns.from, to: anchor.columns.to }),
    sectionPath:      anchor.sectionPath,
    ...presentKeyOf('quote', anchor.quote),
    surroundingLines: lineRangeOut(anchor.surroundingLines),
    ...presentKeyOf('diagram', anchor.diagram === null ? null : {
      lines:       lineRangeOut(anchor.diagram.lines),
      diagramKind: anchor.diagram.diagramKind,
      nodeId:      anchor.diagram.nodeId,
      nodeLabel:   anchor.diagram.nodeLabel,
    }),
  };
}

function stepsDraftEditOut(edit: BoardStepsDraftEdit): PipelineStepsDraftEditDocument {
  switch (edit.target) {
    case 'gate':
      return { target: 'gate', name: edit.name, value: edit.value === null ? null : gateOut(edit.value) };
    case 'phase-order':
      return { target: 'phase-order', phase: GATE_PHASE[edit.phase], names: edit.names };
    case 'prepare':
      return { target: 'prepare', name: edit.name, value: edit.value === null ? null : stepOut(edit.value) };
    case 'prepare-order':
      return { target: 'prepare-order', names: edit.names };
    case 'review':
      return { target: 'review', value: reviewOut(edit.value) };
    case 'constitution':
      return { target: 'constitution', value: edit.constitutionPath === null ? null : { path: edit.constitutionPath } };
  }
}

function entityDraftEditOut(edit: BoardEntityDraftEdit): EntityDraftEditDocument {
  switch (edit.target) {
    case 'role':
      return { target: 'role', role: ENTITY_AGENT_ROLE[edit.role], value: agentStepSettingsOut(edit.value) };
    case 'whitelist':
      return { target: 'whitelist', value: edit.value };
    case 'reach':
      return { target: 'reach', value: edit.value };
    case 'depends-on':
      return { target: 'depends-on', value: edit.value };
    case 'concurrency':
      return { target: 'concurrency', value: edit.value };
    default:
      return stepsDraftEditOut(edit);
  }
}

function draftEditOut(edit: BoardDraftEdit): PipelineDraftEditDocument {
  switch (edit.target) {
    case 'role':
      return { target: 'role', role: PIPELINE_AGENT_ROLE[edit.role], value: agentStepSettingsOut(edit.value) };
    case 'airlock':
      return { target: 'airlock', value: edit.value === null ? null : reReviewOut(edit.value.reReview) };
    case 'tools':
      return { target: 'tools', value: edit.value === null ? null : edit.value.map(BoardAgentMapUtil.toolRequestOut) };
    case 'approval':
      return { target: 'approval', approval: PIPELINE_APPROVAL[edit.approval], value: edit.value };
    case 'ticket-writing':
      return { target: 'ticket-writing', value: edit.value === null ? null : TICKET_WRITING_ROUTE[edit.value] };
    case 'entity':
      return {
        target:    'entity',
        entityKey: edit.entityKey,
        value:     edit.value === null ? null : { kind: ENTITY_KIND[edit.value.kind], home: edit.value.home, ...presentKeyOf('summary', edit.value.summary) },
      };
    case 'within-entity':
      return { target: 'within-entity', entityKey: edit.entityKey, edit: entityDraftEditOut(edit.edit) };
    default:
      return stepsDraftEditOut(edit);
  }
}

const CONTRACT_COMMAND_OF_KIND: { readonly [Kind in BoardCommandKind]: (command: BoardCommandOf<Kind>) => ContractCommandOf<Kind> } = {
  'hephaestus-pause':          (command) => ({ kind: command.kind }),
  'hephaestus-unpause':        (command) => ({ kind: command.kind }),
  'hephaestus-stop':           (command) => ({ kind: command.kind, now: command.now }),
  'hephaestus-restart':        (command) => ({ kind: command.kind, now: command.now }),
  'concurrency-set':           (command) => ({ kind: command.kind, limit: command.limit }),
  'machine-agent-program-set': (command) => ({ kind: command.kind, vendor: command.vendor, programPath: command.programPath }),
  'agent-look-again':          (command) => ({ kind: command.kind }),
  'interrupted-work-resume':   (command) => ({ kind: command.kind, target: resumeTargetOut(command.target) }),
  'chart-range-set':           (command) => ({ kind: command.kind, range: chartRangeOut(command.range) }),
  'decision-answer':           (command) => ({ kind: command.kind, decisionId: command.decisionId, answer: answerOut(command.answer) }),
  'gate-profile-start':        (command) => ({
    kind:     command.kind,
    setupId:  command.setupId,
    gateName: command.gateName,
    phase:    GATE_PHASE[command.phase],
    ...presentKeyOf('entity', command.entity),
  }),
  'gate-profile-stop': (command) => ({ kind: command.kind, profileRunId: command.profileRunId }),
  'intake-close':      (command) => ({ kind: command.kind, ...presentKeyOf('jobId', command.jobId), proposedDraftSets: command.proposedDraftSets }),
  'intake-start':      (command) => ({ kind: command.kind, text: command.text, ...picturesOut(command.pictures) }),
  'job-fresh':         (command) => ({ kind: command.kind, jobId: command.jobId, ...presentKeyOf('incidentId', command.incidentId) }),
  'job-message':       (command) => ({
    kind:  command.kind,
    jobId: command.jobId,
    text:  command.text,
    ...picturesOut(command.pictures),
    ...presentKeyOf('incidentId', command.incidentId),
  }),
  'job-stop':              (command) => ({ kind: command.kind, jobId: command.jobId, mode: JOB_STOP_MODE[command.mode] }),
  'merge-accept':          (command) => ({ kind: command.kind, ticketReference: command.ticketId }),
  'merge-update':          (command) => ({ kind: command.kind, ticketReference: command.ticketId }),
  'pipeline-agent-advise': (command) => ({ kind: command.kind, ...presentKeyOf('entity', command.entity) }),
  'pipeline-apply':        (command) => ({
    kind:          command.kind,
    setupId:       command.setupId,
    draftRevision: command.draftRevision,
    resumesBoard:  command.resumesBoard,
  }),
  'pipeline-apply-cancel':      (command) => ({ kind: command.kind, setupId: command.setupId }),
  'pipeline-assistant-set':     (command) => ({ kind: command.kind, on: command.on }),
  'pipeline-check':             (command) => ({ kind: command.kind, setupId: command.setupId }),
  'pipeline-constitution-edit': (command) => ({
    kind:     command.kind,
    setupId:  command.setupId,
    revision: command.revision,
    ...presentKeyOf('markdown', command.markdown),
    ...presentKeyOf('draftedFrom', command.draftedFrom === null ? null : {
      contributing:     command.draftedFrom.contributing,
      research:         command.draftedFrom.research,
      installedDefault: command.draftedFrom.installedDefault,
    }),
    ...presentKeyOf('entity', command.entity),
  }),
  'pipeline-draft-discard': (command) => ({ kind: command.kind, setupId: command.setupId }),
  'pipeline-draft-edit':    (command) => ({
    kind:          command.kind,
    setupId:       command.setupId,
    draftRevision: command.draftRevision,
    edits:         command.edits.map(draftEditOut),
    ...(command.isACopy ? { isACopy: true } : {}),
  }),
  'pipeline-draft-undo': (command) => ({
    kind:    command.kind,
    setupId: command.setupId,
    editId:  command.editId,
    ...(command.wholeBatch ? { wholeBatch: true } : {}),
  }),
  'pipeline-setup-answer': (command) => ({
    kind:       command.kind,
    setupId:    command.setupId,
    questionId: command.questionId,
    answer:     answerOut(command.answer),
  }),
  'pipeline-agent-set': (command) => ({
    kind:  command.kind,
    agent: BoardAgentMapUtil.pipelineAgentOut(command.agent),
    ...(command.billing === undefined ? {} : { billing: billingOut(command.billing) }),
  }),
  'pipeline-setup-agent':   (command) => ({ kind: command.kind, setupId: command.setupId, agent: BoardAgentMapUtil.pipelineAgentOut(command.agent) }),
  'pipeline-tools-set':     (command) => ({ kind: command.kind, tools: command.tools === null ? null : command.tools.map(BoardAgentMapUtil.toolRequestOut) }),
  'pipeline-setup-billing': (command) => ({ kind: command.kind, setupId: command.setupId, billing: billingOut(command.billing) }),
  'pipeline-setup-resume':  (command) => ({ kind: command.kind, setupId: command.setupId }),
  'pipeline-setup-start':   (command) => ({
    kind:                       command.kind,
    agent:                      BoardAgentMapUtil.pipelineAgentOut(command.agent),
    replacesUnreadablePipeline: command.replacesUnreadablePipeline,
  }),
  'pipeline-setup-start-over': (command) => ({ kind: command.kind, setupId: command.setupId }),
  'pipeline-setup-step':       (command) => ({
    kind:    command.kind,
    setupId: command.setupId,
    step:    SETUP_STEP[command.step],
    move:    command.move,
  }),
  'pipeline-update-start':  (command) => ({ kind: command.kind, ...presentKeyOf('entity', command.entity) }),
  'ticket-deliver-by-hand': (command) => ({
    kind:            command.kind,
    ticketReference: command.ticketId,
    ...presentKeyOf('branch', command.branch),
    ...presentKeyOf('commit', command.commit),
  }),
  'ticket-hold':    (command) => ({ kind: command.kind, ticketReference: command.ticketId, reason: command.reason }),
  'ticket-network': (command) => ({ kind: command.kind, ticketReference: command.ticketId, domains: command.domains }),
  'ticket-park':    (command) => ({
    kind:            command.kind,
    ticketReference: command.ticketId,
    reason:          command.reason,
    ...presentKeyOf('incidentId', command.incidentId),
  }),
  'ticket-priority':      (command) => ({ kind: command.kind, ticketReference: command.ticketId, priority: TICKET_PRIORITY[command.priority] }),
  'ticket-ready':         (command) => ({ kind: command.kind, ticketReferences: command.ticketIds }),
  'ticket-unhold':        (command) => ({ kind: command.kind, ticketReference: command.ticketId }),
  'tracker-clear':        (command) => ({ kind: command.kind, scope: TRACKER_CLEAR_SCOPE[command.scope] }),
  'ticket-document-save': (command) => ({
    kind:            command.kind,
    ticketReference: command.ticketId,
    document:        TICKET_DOCUMENT_KIND[command.document],
    baseVersion:     command.baseVersion,
    markdown:        command.markdown,
  }),
  'ticket-document-comment': (command) => ({
    kind:            command.kind,
    ticketReference: command.ticketId,
    document:        TICKET_DOCUMENT_KIND[command.document],
    anchor:          command.anchor === null ? null : commentAnchorOut(command.anchor),
    text:            command.text,
  }),
  'ticket-document-comment-withdraw': (command) => ({
    kind: command.kind, ticketReference: command.ticketId, document: TICKET_DOCUMENT_KIND[command.document], messageId: command.messageId
  }),
  'ticket-document-proposal-apply': (command) => ({
    kind:            command.kind,
    ticketReference: command.ticketId,
    document:        TICKET_DOCUMENT_KIND[command.document],
    proposalId:      command.proposalId,
    ...presentKeyOf('replacementLines', command.replacementLines),
  }),
  'ticket-document-proposal-discard': (command) => ({
    kind: command.kind, ticketReference: command.ticketId, document: TICKET_DOCUMENT_KIND[command.document], proposalId: command.proposalId
  }),
  'ticket-document-mode-set': (command) => ({
    kind: command.kind, ticketReference: command.ticketId, document: TICKET_DOCUMENT_KIND[command.document], mode: PROPOSAL_MODE[command.mode]
  }),
  'ticket-document-approve': (command) => ({
    kind: command.kind, ticketReference: command.ticketId, document: TICKET_DOCUMENT_KIND[command.document], version: command.version
  }),
  'ticket-document-effect-read': (command) => ({
    kind: command.kind, ticketReference: command.ticketId, document: TICKET_DOCUMENT_KIND[command.document], version: command.version
  }),
  'ticket-document-turn-stop': (command) => ({ kind: command.kind, ticketReference: command.ticketId, document: TICKET_DOCUMENT_KIND[command.document] }),
};

function contractCommandOf(command: BoardCommand): ContractCommand {
  // The table's type pairs each kind with its own mapper; indexing it by a union kind loses that pairing, which the cast restores.
  const contractCommandOfThisKind = CONTRACT_COMMAND_OF_KIND[command.kind] as (command: BoardCommand) => ContractCommand;
  return contractCommandOfThisKind(command);
}

export const BoardCommandMapUtil = { contractCommandOf, kinds: Object.keys(CONTRACT_COMMAND_OF_KIND) as readonly BoardCommandKind[] } as const;
