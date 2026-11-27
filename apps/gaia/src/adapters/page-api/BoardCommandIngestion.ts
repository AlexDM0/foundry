/**
 * The ingestion of a board command the page posts (`POST /api/v1/forges/<trackerId>/commands`): parse, check `boardCommandVersion`, the kind
 * and its keys, then map into Gaia's `BoardCommand`; a key the kind does not name never reaches the forge. The page and server ship
 * together, so another version means a stale page, refused as a malformed body.
 */
import type { BoardAgentProgramChoiceDocument, BoardPipelineAgentDocument, BoardToolRequestDocument } from '../../../page/@types/board/BoardAgentDocuments.ts';
import type {
  BoardAnswerFormDocument,
  BoardChartRangeDocument,
  BoardCommandDocument,
  BoardCommandDocumentKind,
  BoardPictureReferenceDocument,
  BoardTrackerClearScope,
} from '../../../page/@types/board/BoardCommandDocument.ts';
import type {
  BoardAgentStepSettingsDocument,
  BoardBillingDocument,
  BoardConditionalReReviewDocument,
  BoardDraftEditDocument,
  BoardEntityDraftEditDocument,
  BoardInstructionDocument,
  BoardPipelineGateDocument,
  BoardPipelineReviewDocument,
  BoardPipelineStepDocument,
  BoardStepsDraftEditDocument,
} from '../../../page/@types/board/BoardPipelineDocuments.ts';
import {
  BOARD_AGENT_EFFORTS,
  BOARD_DOCUMENT_READING_RULES,
  BOARD_FORGE_LEVEL_AGENT_ROLES,
  BOARD_GATE_PHASES,
  BOARD_PIPELINE_AGENT_ROLES,
  BOARD_TICKET_DOCUMENT_KINDS,
  BOARD_TICKET_WRITING_ROUTES,
  type BoardAgentModel,
  type BoardCommentView,
  type BoardEntityKind,
  type BoardJobStopMode,
  type BoardPipelineApproval,
  type BoardProposalMode,
  type BoardSetupStep,
  type BoardTicketPriority,
} from '../../../page/@types/board/BoardVocabulary.ts';
import type {
  BoardColumnRangeDocument,
  BoardCommentAnchorDocument,
  BoardDiagramAnchorDocument,
  BoardLineRangeDocument,
} from '../../../page/@types/board/TicketDocumentsDocument.ts';
import {
  DocumentShapeUtil,
  type DocumentShape,
  type FieldRule,
  type ShapeOf,
} from '../../lib/json-value/DocumentShapeUtil.ts';
import { JsonValueUtil }                             from '../../lib/json-value/JsonValueUtil.ts';
import type { BoardPipelineAgent, BoardToolRequest } from '../../shared/@types/board/BoardAgent.ts';
import type {
  BoardAnswerForm,
  BoardChartRange,
  BoardCommand,
  BoardPictureReference,
  BoardResumeTarget,
} from '../../shared/@types/board/BoardCommand.ts';
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
} from '../../shared/@types/board/BoardPipeline.ts';
import type { BoardCommentAnchor }        from '../../shared/@types/board/TicketDocuments.ts';
import { BOARD_COMMAND_BODY_BOUND_BYTES } from '../../shared/constants/Limits.ts';
import { PAGE_CONTRACT_VERSIONS }         from '../../shared/constants/PageContractVersions.ts';
import { ContractVersionUtil }            from '../../shared/utils/ContractVersionUtil.ts';

/**
 * `malformed-body` names each key that is missing or holds another type; `unknown-kind` names the kind, `null` when the body names none;
 * `too-large` is a body over `BOARD_COMMAND_BODY_BOUND_BYTES` of a kind that carries no document's text.
 */
export type BoardCommandReading =
  | { readonly verdict: 'readable'; readonly command: BoardCommand }
  | { readonly verdict: 'refused'; readonly refusal: 'malformed-body'; readonly invalidKeys: readonly string[] }
  | { readonly verdict: 'refused'; readonly refusal: 'unknown-kind'; readonly kind: string | null }
  | { readonly verdict: 'refused'; readonly refusal: 'too-large' };

type CommandDocumentOf<Kind extends BoardCommandDocumentKind> = Extract<BoardCommandDocument, { readonly kind: Kind }>;

type EditDocumentOf<Edit, Target> = Extract<Edit, { readonly target: Target }>;

const VERSION_KEYS = { majorKey: 'boardCommandVersion' } as const;
const KIND_KEY = 'kind';
const RESUME_TARGET_KEY = 'target';
const RESUME_EVERYTHING_TARGET = 'all';
/** The kinds that may carry a ticket document's text: a save, a proposal applied as User edited it, and a comment quoting a selection. */
const DOCUMENT_SIZED_KINDS: ReadonlySet<BoardCommandDocumentKind> = new Set(['ticket-document-save', 'ticket-document-proposal-apply', 'ticket-document-comment']);

/** Each union a command carries as a record of its values, so a value the union gains is a compile error here until the shapes take it. */
const AGENT_MODELS = {
  haiku: true, sonnet: true, opus: true, fable: true
} as const satisfies Record<BoardAgentModel, true>;
const PIPELINE_APPROVALS = {
  tickets: true, merge: true, spec: true, plan: true
} as const satisfies Record<BoardPipelineApproval, true>;
const ENTITY_KINDS = { app: true, package: true, root: true } as const satisfies Record<BoardEntityKind, true>;
const JOB_STOP_MODES = { 'stop': true, 'wind-down': true } as const satisfies Record<BoardJobStopMode, true>;
const TICKET_PRIORITIES = { low: true, normal: true, high: true } as const satisfies Record<BoardTicketPriority, true>;
const TRACKER_CLEAR_SCOPES = { 'tasks-and-log': true, 'everything': true } as const satisfies Record<BoardTrackerClearScope, true>;
const PROPOSAL_MODES = { 'ask-first': true, 'auto-apply': true } as const satisfies Record<BoardProposalMode, true>;
const COMMENT_VIEWS = { preview: true, code: true } as const satisfies Record<BoardCommentView, true>;
const SETUP_STEPS = {
  agent:        true,
  billing:      true,
  research:     true,
  entities:     true,
  constitution: true,
  design:       true,
  apply:        true,
} as const satisfies Record<BoardSetupStep, true>;

const FORGE_LEVEL_ROLES: readonly string[] = BOARD_FORGE_LEVEL_AGENT_ROLES;
const ENTITY_AGENT_ROLES = BOARD_PIPELINE_AGENT_ROLES.filter((role) => !FORGE_LEVEL_ROLES.includes(role));

function oneOfRecord(record: Readonly<Record<string, true>>): FieldRule {
  return { oneOf: Object.keys(record) };
}

const NULLABLE_TEXT = { nullable: 'text' } as const;
const PASSED_OVER_HEAD = { boardCommandVersion: 'passed-over', kind: 'passed-over' } as const;

const RE_REVIEW_RULE: FieldRule = { nullable: { object: { thresholdLines: 'whole-number' } as const satisfies ShapeOf<BoardConditionalReReviewDocument> } };

const STEP_SHAPE = { name: 'text', run: 'text', runsIn: NULLABLE_TEXT } as const satisfies ShapeOf<BoardPipelineStepDocument>;

const GATE_SHAPE = {
  name:    'text',
  run:     'text',
  fix:     NULLABLE_TEXT,
  runsIn:  NULLABLE_TEXT,
  network: 'text-list',
  writes:  'text-list',
} as const satisfies ShapeOf<BoardPipelineGateDocument>;

const REVIEW_SHAPE = { name: 'text', reReview: RE_REVIEW_RULE } as const satisfies ShapeOf<BoardPipelineReviewDocument>;

const INSTRUCTION_RULE: FieldRule = {
  anyShapeOf: [
    { kind: { oneOf: ['constitution'] } } as const satisfies ShapeOf<Extract<BoardInstructionDocument, { kind: 'constitution' }>>,
    { kind: { oneOf: ['default-brief'] }, role: { oneOf: BOARD_PIPELINE_AGENT_ROLES } } as const satisfies ShapeOf<Extract<BoardInstructionDocument, { kind: 'default-brief' }>>,
    { kind: { oneOf: ['file'] }, path: 'text' } as const satisfies ShapeOf<Extract<BoardInstructionDocument, { kind: 'file' }>>,
  ],
};

const DOCUMENT_READING_RULE: FieldRule = { optional: { oneOf: BOARD_DOCUMENT_READING_RULES } };

const AGENT_STEP_SETTINGS_SHAPE = {
  model:        { nullable: oneOfRecord(AGENT_MODELS) },
  effort:       { nullable: { oneOf: BOARD_AGENT_EFFORTS } },
  instructions: { nullable: { eachOf: INSTRUCTION_RULE } },
  documents:    { optional: { object: { spec: DOCUMENT_READING_RULE, plan: DOCUMENT_READING_RULE } } },
} as const satisfies ShapeOf<BoardAgentStepSettingsDocument>;

const PIPELINE_AGENT_RULE: FieldRule = {
  object: {
    vendor:  'text',
    program: {
      anyShapeOf: [
        { follows: { oneOf: ['machine'] } } as const satisfies ShapeOf<Extract<BoardAgentProgramChoiceDocument, { follows: 'machine' }>>,
        { pinned: 'text' } as const satisfies ShapeOf<Extract<BoardAgentProgramChoiceDocument, { pinned: string }>>,
      ],
    },
  } as const satisfies ShapeOf<BoardPipelineAgentDocument>,
};

const TOOL_REQUESTS_RULE: FieldRule = { nullable: { listOf: { name: 'text', path: NULLABLE_TEXT } as const satisfies ShapeOf<BoardToolRequestDocument> } };

const STEPS_DRAFT_EDIT_SHAPES: readonly DocumentShape[] = [
  {
    target: { oneOf: ['gate'] },
    name:   'text',
    value:  { nullable: { object: GATE_SHAPE } },
  } as const satisfies ShapeOf<EditDocumentOf<BoardStepsDraftEditDocument, 'gate'>>,
  {
    target: { oneOf: ['phase-order'] },
    phase:  { oneOf: BOARD_GATE_PHASES },
    names:  'text-list',
  } as const satisfies ShapeOf<EditDocumentOf<BoardStepsDraftEditDocument, 'phase-order'>>,
  {
    target: { oneOf: ['prepare'] },
    name:   'text',
    value:  { nullable: { object: STEP_SHAPE } },
  } as const satisfies ShapeOf<EditDocumentOf<BoardStepsDraftEditDocument, 'prepare'>>,
  { target: { oneOf: ['prepare-order'] }, names: 'text-list' } as const satisfies ShapeOf<EditDocumentOf<BoardStepsDraftEditDocument, 'prepare-order'>>,
  { target: { oneOf: ['review'] }, value: { nullable: { object: REVIEW_SHAPE } } } as const satisfies ShapeOf<EditDocumentOf<BoardStepsDraftEditDocument, 'review'>>,
  { target: { oneOf: ['constitution'] }, constitutionPath: NULLABLE_TEXT } as const satisfies ShapeOf<EditDocumentOf<BoardStepsDraftEditDocument, 'constitution'>>,
];

type EntityKeyListTarget = 'whitelist' | 'reach' | 'depends-on';

const ENTITY_KEY_LIST_TARGETS: readonly EntityKeyListTarget[] = ['whitelist', 'reach', 'depends-on'];

const ENTITY_DRAFT_EDIT_RULE: FieldRule = {
  anyShapeOf: [
    ...STEPS_DRAFT_EDIT_SHAPES,
    {
      target: { oneOf: ['role'] },
      role:   { oneOf: ENTITY_AGENT_ROLES },
      value:  { nullable: { object: AGENT_STEP_SETTINGS_SHAPE } },
    } as const satisfies ShapeOf<EditDocumentOf<BoardEntityDraftEditDocument, 'role'>>,
    { target: { oneOf: ENTITY_KEY_LIST_TARGETS }, value: { nullable: 'text-list' } } as const satisfies ShapeOf<EditDocumentOf<BoardEntityDraftEditDocument, EntityKeyListTarget>>,
    { target: { oneOf: ['concurrency'] }, value: { nullable: 'whole-number' } } as const satisfies ShapeOf<EditDocumentOf<BoardEntityDraftEditDocument, 'concurrency'>>,
  ],
};

const DRAFT_EDIT_RULE: FieldRule = {
  anyShapeOf: [
    ...STEPS_DRAFT_EDIT_SHAPES,
    {
      target: { oneOf: ['role'] },
      role:   { oneOf: BOARD_PIPELINE_AGENT_ROLES },
      value:  { nullable: { object: AGENT_STEP_SETTINGS_SHAPE } },
    } as const satisfies ShapeOf<EditDocumentOf<BoardDraftEditDocument, 'role'>>,
    { target: { oneOf: ['airlock'] }, value: { nullable: { object: { reReview: RE_REVIEW_RULE } } } } as const satisfies ShapeOf<EditDocumentOf<BoardDraftEditDocument, 'airlock'>>,
    { target: { oneOf: ['tools'] }, value: TOOL_REQUESTS_RULE } as const satisfies ShapeOf<EditDocumentOf<BoardDraftEditDocument, 'tools'>>,
    {
      target:   { oneOf: ['approval'] },
      approval: oneOfRecord(PIPELINE_APPROVALS),
      value:    { nullable: 'boolean' },
    } as const satisfies ShapeOf<EditDocumentOf<BoardDraftEditDocument, 'approval'>>,
    {
      target: { oneOf: ['ticket-writing'] },
      value:  { nullable: { oneOf: BOARD_TICKET_WRITING_ROUTES } },
    } as const satisfies ShapeOf<EditDocumentOf<BoardDraftEditDocument, 'ticket-writing'>>,
    {
      target:    { oneOf: ['entity'] },
      entityKey: 'text',
      value:     { nullable: { object: { kind: oneOfRecord(ENTITY_KINDS), home: 'text-list', summary: NULLABLE_TEXT } } },
    } as const satisfies ShapeOf<EditDocumentOf<BoardDraftEditDocument, 'entity'>>,
    {
      target:    { oneOf: ['within-entity'] },
      entityKey: 'text',
      edit:      ENTITY_DRAFT_EDIT_RULE,
    } as const satisfies ShapeOf<EditDocumentOf<BoardDraftEditDocument, 'within-entity'>>,
  ],
};

const ANSWER_RULE: FieldRule = {
  anyShapeOf: [
    { form: { oneOf: ['letters'] }, choices: 'text-list', note: { optional: 'text' } } as const satisfies ShapeOf<Extract<BoardAnswerFormDocument, { form: 'letters' }>>,
    { form: { oneOf: ['text'] }, text: 'text' } as const satisfies ShapeOf<Extract<BoardAnswerFormDocument, { form: 'text' }>>,
  ],
};

const BILLING_RULE: FieldRule = {
  anyShapeOf: [
    { mode: { oneOf: ['subscription'] } } as const satisfies ShapeOf<Extract<BoardBillingDocument, { mode: 'subscription' }>>,
    { mode: { oneOf: ['api'] }, maximumBudgetDollars: { nullable: 'number' } } as const satisfies ShapeOf<Extract<BoardBillingDocument, { mode: 'api' }>>,
  ],
};

const CHART_RANGE_RULE: FieldRule = {
  anyShapeOf: [
    { kind: { oneOf: ['automatic'] } } as const satisfies ShapeOf<Extract<BoardChartRangeDocument, { kind: 'automatic' }>>,
    {
      kind:        { oneOf: ['window'] },
      from:        'text',
      to:          'text',
      tickMinutes: { nullable: 'whole-number' },
    } as const satisfies ShapeOf<Extract<BoardChartRangeDocument, { kind: 'window' }>>,
  ],
};

const PICTURES_RULE: FieldRule = { listOf: { pictureId: 'text', name: 'text' } as const satisfies ShapeOf<BoardPictureReferenceDocument> };

const LINE_RANGE_RULE: FieldRule = { object: { from: 'whole-number', to: 'whole-number' } as const satisfies ShapeOf<BoardLineRangeDocument> };
const COLUMN_RANGE_RULE: FieldRule = { object: { from: 'whole-number', to: 'whole-number' } as const satisfies ShapeOf<BoardColumnRangeDocument> };

const DIAGRAM_ANCHOR_SHAPE = {
  lines:       LINE_RANGE_RULE,
  diagramKind: 'text',
  nodeId:      'text',
  nodeLabel:   'text',
} as const satisfies ShapeOf<BoardDiagramAnchorDocument>;

const COMMENT_ANCHOR_SHAPE = {
  view:             oneOfRecord(COMMENT_VIEWS),
  versionNumber:    'whole-number',
  lines:            LINE_RANGE_RULE,
  columns:          { nullable: COLUMN_RANGE_RULE },
  sectionPath:      'text-list',
  quote:            NULLABLE_TEXT,
  surroundingLines: LINE_RANGE_RULE,
  diagram:          { nullable: { object: DIAGRAM_ANCHOR_SHAPE } },
} as const satisfies ShapeOf<BoardCommentAnchorDocument>;

const TICKET_DOCUMENT_HEAD = { ...PASSED_OVER_HEAD, ticketId: 'text', document: { oneOf: BOARD_TICKET_DOCUMENT_KINDS } } as const;

const COMMAND_SHAPES = {
  'agent-look-again':          { ...PASSED_OVER_HEAD },
  'machine-agent-program-set': { ...PASSED_OVER_HEAD, vendor: 'text', programPath: 'text' },
  'pipeline-agent-set':        { ...PASSED_OVER_HEAD, agent: PIPELINE_AGENT_RULE, billing: { optional: BILLING_RULE } },
  'pipeline-setup-agent':      { ...PASSED_OVER_HEAD, setupId: 'text', agent: PIPELINE_AGENT_RULE },
  'pipeline-tools-set':        { ...PASSED_OVER_HEAD, tools: TOOL_REQUESTS_RULE },
  'hephaestus-pause':          { ...PASSED_OVER_HEAD },
  'hephaestus-unpause':        { ...PASSED_OVER_HEAD },
  'hephaestus-stop':           { ...PASSED_OVER_HEAD, now: 'boolean' },
  'hephaestus-restart':        { ...PASSED_OVER_HEAD, now: 'boolean' },
  'concurrency-set':           { ...PASSED_OVER_HEAD, limit: 'whole-number' },
  'interrupted-work-resume':   { ...PASSED_OVER_HEAD, target: 'json' },
  'chart-range-set':           { ...PASSED_OVER_HEAD, range: CHART_RANGE_RULE },
  'decision-answer':           { ...PASSED_OVER_HEAD, decisionId: 'text', answer: ANSWER_RULE },
  'gate-profile-start':        {
    ...PASSED_OVER_HEAD,
    setupId:  NULLABLE_TEXT,
    gateName: 'text',
    phase:    { oneOf: BOARD_GATE_PHASES },
    entity:   NULLABLE_TEXT,
  },
  'gate-profile-stop': { ...PASSED_OVER_HEAD, profileRunId: 'text' },
  'intake-close':      { ...PASSED_OVER_HEAD, jobId: NULLABLE_TEXT, proposedDraftSets: { eachOf: 'text-list' } },
  'intake-start':      { ...PASSED_OVER_HEAD, text: 'text', pictures: PICTURES_RULE },
  'job-fresh':         { ...PASSED_OVER_HEAD, jobId: 'text', incidentId: NULLABLE_TEXT },
  'job-message':       {
    ...PASSED_OVER_HEAD,
    jobId:      'text',
    text:       'text',
    pictures:   PICTURES_RULE,
    incidentId: NULLABLE_TEXT,
  },
  'job-stop':              { ...PASSED_OVER_HEAD, jobId: 'text', mode: oneOfRecord(JOB_STOP_MODES) },
  'merge-accept':          { ...PASSED_OVER_HEAD, ticketId: 'text' },
  'merge-update':          { ...PASSED_OVER_HEAD, ticketId: 'text' },
  'pipeline-agent-advise': { ...PASSED_OVER_HEAD, entity: NULLABLE_TEXT },
  'pipeline-apply':        {
    ...PASSED_OVER_HEAD,
    setupId:       'text',
    draftRevision: 'whole-number',
    resumesBoard:  'boolean',
  },
  'pipeline-apply-cancel':      { ...PASSED_OVER_HEAD, setupId: 'text' },
  'pipeline-assistant-set':     { ...PASSED_OVER_HEAD, on: 'boolean' },
  'pipeline-check':             { ...PASSED_OVER_HEAD, setupId: 'text' },
  'pipeline-constitution-edit': {
    ...PASSED_OVER_HEAD,
    setupId:     'text',
    revision:    'whole-number',
    markdown:    NULLABLE_TEXT,
    draftedFrom: { nullable: { object: { contributing: 'boolean', research: 'boolean', installedDefault: 'boolean' } } },
    entity:      NULLABLE_TEXT,
  },
  'pipeline-draft-discard': { ...PASSED_OVER_HEAD, setupId: 'text' },
  'pipeline-draft-edit':    {
    ...PASSED_OVER_HEAD,
    setupId:       'text',
    draftRevision: 'whole-number',
    edits:         { eachOf: DRAFT_EDIT_RULE },
    isACopy:       'boolean',
  },
  'pipeline-draft-undo': {
    ...PASSED_OVER_HEAD,
    setupId:    'text',
    editId:     'text',
    wholeBatch: 'boolean',
  },
  'pipeline-setup-answer': {
    ...PASSED_OVER_HEAD,
    setupId:    'text',
    questionId: 'text',
    answer:     ANSWER_RULE,
  },
  'pipeline-setup-billing':    { ...PASSED_OVER_HEAD, setupId: 'text', billing: BILLING_RULE },
  'pipeline-setup-resume':     { ...PASSED_OVER_HEAD, setupId: 'text' },
  'pipeline-setup-start':      { ...PASSED_OVER_HEAD, agent: PIPELINE_AGENT_RULE, replacesUnreadablePipeline: 'boolean' },
  'pipeline-setup-start-over': { ...PASSED_OVER_HEAD, setupId: 'text' },
  'pipeline-setup-step':       {
    ...PASSED_OVER_HEAD,
    setupId: 'text',
    step:    oneOfRecord(SETUP_STEPS),
    move:    { oneOf: ['continue'] },
  },
  'pipeline-update-start':  { ...PASSED_OVER_HEAD, entity: NULLABLE_TEXT },
  'ticket-deliver-by-hand': {
    ...PASSED_OVER_HEAD,
    ticketId: 'text',
    branch:   NULLABLE_TEXT,
    commit:   NULLABLE_TEXT,
  },
  'ticket-hold':    { ...PASSED_OVER_HEAD, ticketId: 'text', reason: 'text' },
  'ticket-network': { ...PASSED_OVER_HEAD, ticketId: 'text', domains: 'text-list' },
  'ticket-park':    {
    ...PASSED_OVER_HEAD,
    ticketId:   'text',
    reason:     'text',
    incidentId: NULLABLE_TEXT,
  },
  'ticket-priority':      { ...PASSED_OVER_HEAD, ticketId: 'text', priority: oneOfRecord(TICKET_PRIORITIES) },
  'ticket-ready':         { ...PASSED_OVER_HEAD, ticketIds: 'text-list' },
  'ticket-unhold':        { ...PASSED_OVER_HEAD, ticketId: 'text' },
  'tracker-clear':        { ...PASSED_OVER_HEAD, scope: oneOfRecord(TRACKER_CLEAR_SCOPES) },
  'ticket-document-save': {
    ...TICKET_DOCUMENT_HEAD,
    baseVersion: { nullable: 'whole-number' },
    markdown:    'text',
  },
  'ticket-document-comment':          { ...TICKET_DOCUMENT_HEAD, anchor: { nullable: { object: COMMENT_ANCHOR_SHAPE } }, text: 'text' },
  'ticket-document-comment-withdraw': { ...TICKET_DOCUMENT_HEAD, messageId: 'text' },
  'ticket-document-proposal-apply':   { ...TICKET_DOCUMENT_HEAD, proposalId: 'text', replacementLines: { nullable: { eachOf: 'text-list' } } },
  'ticket-document-proposal-discard': { ...TICKET_DOCUMENT_HEAD, proposalId: 'text' },
  'ticket-document-mode-set':         { ...TICKET_DOCUMENT_HEAD, mode: oneOfRecord(PROPOSAL_MODES) },
  'ticket-document-approve':          { ...TICKET_DOCUMENT_HEAD, version: 'whole-number' },
  'ticket-document-effect-read':      { ...TICKET_DOCUMENT_HEAD, version: 'whole-number' },
  'ticket-document-turn-stop':        { ...TICKET_DOCUMENT_HEAD },
} as const satisfies { readonly [Kind in BoardCommandDocumentKind]: ShapeOf<CommandDocumentOf<Kind>> };

function isCommandKind(kind: string): kind is BoardCommandDocumentKind {
  return Object.hasOwn(COMMAND_SHAPES, kind);
}

/** `'all'`, or an object naming one job or one ticket; the shape only requires the key present, since `'all'` is no object. */
function resumeTargetIn(target: unknown): BoardResumeTarget | null {
  if (target === RESUME_EVERYTHING_TARGET) return RESUME_EVERYTHING_TARGET;
  const record = JsonValueUtil.jsonObjectOf(target);
  if (record === null) return null;
  const jobId = JsonValueUtil.ownValueOf(record, 'jobId');
  if (typeof jobId === 'string') return { jobId };
  const ticketReference = JsonValueUtil.ownValueOf(record, 'ticketReference');
  return typeof ticketReference === 'string' ? { ticketReference } : null;
}

function chartRangeIn(range: BoardChartRangeDocument): BoardChartRange {
  if (range.kind === 'automatic') return { kind: 'automatic' };
  return {
    kind: 'window', from: range.from, to: range.to, tickMinutes: range.tickMinutes
  };
}

function answerIn(answer: BoardAnswerFormDocument): BoardAnswerForm {
  if (answer.form === 'text') return { form: 'text', text: answer.text };
  const note = answer.note?.trim() ?? '';
  return { form: 'letters', choices: answer.choices, ...note === '' ? {} : { note } };
}

function picturesIn(pictures: readonly BoardPictureReferenceDocument[]): readonly BoardPictureReference[] {
  return pictures.map((picture) => ({ pictureId: picture.pictureId, name: picture.name }));
}

function billingIn(billing: BoardBillingDocument): BoardBilling {
  return billing.mode === 'subscription' ? { mode: 'subscription' } : { mode: 'api', maximumBudgetDollars: billing.maximumBudgetDollars };
}

function reReviewIn(reReview: BoardConditionalReReviewDocument | null): BoardConditionalReReview | null {
  return reReview === null ? null : { thresholdLines: reReview.thresholdLines };
}

function stepIn(step: BoardPipelineStepDocument): BoardPipelineStep {
  return { name: step.name, run: step.run, runsIn: step.runsIn };
}

function gateIn(gate: BoardPipelineGateDocument): BoardPipelineGate {
  return {
    name:    gate.name,
    run:     gate.run,
    fix:     gate.fix,
    runsIn:  gate.runsIn,
    network: gate.network,
    writes:  gate.writes,
  };
}

function reviewIn(review: BoardPipelineReviewDocument | null): BoardPipelineReview | null {
  return review === null ? null : { name: review.name, reReview: reReviewIn(review.reReview) };
}

function instructionIn(instruction: BoardInstructionDocument): BoardInstruction {
  switch (instruction.kind) {
    case 'constitution':
      return { kind: 'constitution' };
    case 'default-brief':
      return { kind: 'default-brief', role: instruction.role };
    case 'file':
      return { kind: 'file', path: instruction.path };
  }
}

type DocumentReadingRules = NonNullable<BoardAgentStepSettings['documents']>;

function documentReadingRulesIn(rules: NonNullable<BoardAgentStepSettingsDocument['documents']>): DocumentReadingRules {
  return {
    ...rules.spec === undefined ? {} : { spec: rules.spec },
    ...rules.plan === undefined ? {} : { plan: rules.plan },
  };
}

function agentStepSettingsIn(settings: BoardAgentStepSettingsDocument | null): BoardAgentStepSettings | null {
  if (settings === null) return null;
  return {
    model:        settings.model,
    effort:       settings.effort,
    instructions: settings.instructions === null ? null : settings.instructions.map(instructionIn),
    ...settings.documents === undefined ? {} : { documents: documentReadingRulesIn(settings.documents) },
  };
}

function lineRangeIn(range: BoardLineRangeDocument): BoardCommentAnchor['lines'] {
  return { from: range.from, to: range.to };
}

function commentAnchorIn(anchor: BoardCommentAnchorDocument): BoardCommentAnchor {
  return {
    view:             anchor.view,
    versionNumber:    anchor.versionNumber,
    lines:            lineRangeIn(anchor.lines),
    columns:          anchor.columns === null ? null : { from: anchor.columns.from, to: anchor.columns.to },
    sectionPath:      anchor.sectionPath,
    quote:            anchor.quote,
    surroundingLines: lineRangeIn(anchor.surroundingLines),
    diagram:          anchor.diagram === null ? null : {
      lines:       lineRangeIn(anchor.diagram.lines),
      diagramKind: anchor.diagram.diagramKind,
      nodeId:      anchor.diagram.nodeId,
      nodeLabel:   anchor.diagram.nodeLabel,
    },
  };
}

function stepsDraftEditIn(edit: BoardStepsDraftEditDocument): BoardStepsDraftEdit {
  switch (edit.target) {
    case 'gate':
      return { target: 'gate', name: edit.name, value: edit.value === null ? null : gateIn(edit.value) };
    case 'phase-order':
      return { target: 'phase-order', phase: edit.phase, names: edit.names };
    case 'prepare':
      return { target: 'prepare', name: edit.name, value: edit.value === null ? null : stepIn(edit.value) };
    case 'prepare-order':
      return { target: 'prepare-order', names: edit.names };
    case 'review':
      return { target: 'review', value: reviewIn(edit.value) };
    case 'constitution':
      return { target: 'constitution', constitutionPath: edit.constitutionPath };
  }
}

function entityDraftEditIn(edit: BoardEntityDraftEditDocument): BoardEntityDraftEdit {
  switch (edit.target) {
    case 'role':
      return { target: 'role', role: edit.role, value: agentStepSettingsIn(edit.value) };
    case 'whitelist':
    case 'reach':
    case 'depends-on':
      return { target: edit.target, value: edit.value };
    case 'concurrency':
      return { target: 'concurrency', value: edit.value };
    default:
      return stepsDraftEditIn(edit);
  }
}

function pipelineAgentIn(agent: BoardPipelineAgentDocument): BoardPipelineAgent {
  return { vendor: agent.vendor, program: 'pinned' in agent.program ? { pinned: agent.program.pinned } : { follows: 'machine' } };
}

function toolRequestsIn(tools: readonly BoardToolRequestDocument[] | null): readonly BoardToolRequest[] | null {
  return tools === null ? null : tools.map((tool) => ({ name: tool.name, path: tool.path }));
}

function draftEditIn(edit: BoardDraftEditDocument): BoardDraftEdit {
  switch (edit.target) {
    case 'role':
      return { target: 'role', role: edit.role, value: agentStepSettingsIn(edit.value) };
    case 'airlock':
      return { target: 'airlock', value: edit.value === null ? null : { reReview: reReviewIn(edit.value.reReview) } };
    case 'tools':
      return { target: 'tools', value: toolRequestsIn(edit.value) };
    case 'approval':
      return { target: 'approval', approval: edit.approval, value: edit.value };
    case 'ticket-writing':
      return { target: 'ticket-writing', value: edit.value };
    case 'entity':
      return {
        target:    'entity',
        entityKey: edit.entityKey,
        value:     edit.value === null ? null : { kind: edit.value.kind, home: edit.value.home, summary: edit.value.summary },
      };
    case 'within-entity':
      return { target: 'within-entity', entityKey: edit.entityKey, edit: entityDraftEditIn(edit.edit) };
    default:
      return stepsDraftEditIn(edit);
  }
}

/** The body, already checked against its kind's shape, mapped key by key. */
function commandIn(document: Exclude<BoardCommandDocument, { readonly kind: 'interrupted-work-resume' }>): BoardCommand {
  switch (document.kind) {
    case 'hephaestus-pause':
    case 'hephaestus-unpause':
    case 'agent-look-again':
      return { kind: document.kind };
    case 'machine-agent-program-set':
      return { kind: document.kind, vendor: document.vendor, programPath: document.programPath };
    case 'pipeline-agent-set':
      return { kind: document.kind, agent: pipelineAgentIn(document.agent), ...(document.billing === undefined ? {} : { billing: billingIn(document.billing) }) };
    case 'pipeline-setup-agent':
      return { kind: document.kind, setupId: document.setupId, agent: pipelineAgentIn(document.agent) };
    case 'pipeline-tools-set':
      return { kind: document.kind, tools: toolRequestsIn(document.tools) };
    case 'hephaestus-stop':
    case 'hephaestus-restart':
      return { kind: document.kind, now: document.now };
    case 'concurrency-set':
      return { kind: document.kind, limit: document.limit };
    case 'pipeline-assistant-set':
      return { kind: document.kind, on: document.on };
    case 'chart-range-set':
      return { kind: document.kind, range: chartRangeIn(document.range) };
    case 'decision-answer':
      return { kind: document.kind, decisionId: document.decisionId, answer: answerIn(document.answer) };
    case 'gate-profile-start':
      return {
        kind:     document.kind,
        setupId:  document.setupId,
        gateName: document.gateName,
        phase:    document.phase,
        entity:   document.entity,
      };
    case 'gate-profile-stop':
      return { kind: document.kind, profileRunId: document.profileRunId };
    case 'intake-close':
      return { kind: document.kind, jobId: document.jobId, proposedDraftSets: document.proposedDraftSets };
    case 'intake-start':
      return { kind: document.kind, text: document.text, pictures: picturesIn(document.pictures) };
    case 'job-fresh':
      return { kind: document.kind, jobId: document.jobId, incidentId: document.incidentId };
    case 'job-message':
      return {
        kind:       document.kind,
        jobId:      document.jobId,
        text:       document.text,
        pictures:   picturesIn(document.pictures),
        incidentId: document.incidentId,
      };
    case 'job-stop':
      return { kind: document.kind, jobId: document.jobId, mode: document.mode };
    case 'merge-accept':
    case 'merge-update':
    case 'ticket-unhold':
      return { kind: document.kind, ticketId: document.ticketId };
    case 'pipeline-agent-advise':
    case 'pipeline-update-start':
      return { kind: document.kind, entity: document.entity };
    case 'pipeline-apply':
      return {
        kind:          document.kind,
        setupId:       document.setupId,
        draftRevision: document.draftRevision,
        resumesBoard:  document.resumesBoard,
      };
    case 'pipeline-apply-cancel':
    case 'pipeline-check':
    case 'pipeline-draft-discard':
    case 'pipeline-setup-resume':
    case 'pipeline-setup-start-over':
      return { kind: document.kind, setupId: document.setupId };
    case 'pipeline-constitution-edit':
      return {
        kind:        document.kind,
        setupId:     document.setupId,
        revision:    document.revision,
        markdown:    document.markdown,
        draftedFrom: document.draftedFrom === null ? null : {
          contributing:     document.draftedFrom.contributing,
          research:         document.draftedFrom.research,
          installedDefault: document.draftedFrom.installedDefault,
        },
        entity: document.entity,
      };
    case 'pipeline-draft-edit':
      return {
        kind:          document.kind,
        setupId:       document.setupId,
        draftRevision: document.draftRevision,
        edits:         document.edits.map(draftEditIn),
        isACopy:       document.isACopy,
      };
    case 'pipeline-draft-undo':
      return {
        kind:       document.kind,
        setupId:    document.setupId,
        editId:     document.editId,
        wholeBatch: document.wholeBatch,
      };
    case 'pipeline-setup-answer':
      return {
        kind:       document.kind,
        setupId:    document.setupId,
        questionId: document.questionId,
        answer:     answerIn(document.answer),
      };
    case 'pipeline-setup-billing':
      return { kind: document.kind, setupId: document.setupId, billing: billingIn(document.billing) };
    case 'pipeline-setup-start':
      return { kind: document.kind, agent: pipelineAgentIn(document.agent), replacesUnreadablePipeline: document.replacesUnreadablePipeline };
    case 'pipeline-setup-step':
      return {
        kind:    document.kind,
        setupId: document.setupId,
        step:    document.step,
        move:    document.move,
      };
    case 'ticket-deliver-by-hand':
      return {
        kind:     document.kind,
        ticketId: document.ticketId,
        branch:   document.branch,
        commit:   document.commit,
      };
    case 'ticket-hold':
      return { kind: document.kind, ticketId: document.ticketId, reason: document.reason };
    case 'ticket-network':
      return { kind: document.kind, ticketId: document.ticketId, domains: document.domains };
    case 'ticket-park':
      return {
        kind:       document.kind,
        ticketId:   document.ticketId,
        reason:     document.reason,
        incidentId: document.incidentId,
      };
    case 'ticket-priority':
      return { kind: document.kind, ticketId: document.ticketId, priority: document.priority };
    case 'ticket-ready':
      return { kind: document.kind, ticketIds: document.ticketIds };
    case 'tracker-clear':
      return { kind: document.kind, scope: document.scope };
    case 'ticket-document-save':
      return {
        kind:        document.kind,
        ticketId:    document.ticketId,
        document:    document.document,
        baseVersion: document.baseVersion,
        markdown:    document.markdown,
      };
    case 'ticket-document-comment':
      return {
        kind:     document.kind,
        ticketId: document.ticketId,
        document: document.document,
        anchor:   document.anchor === null ? null : commentAnchorIn(document.anchor),
        text:     document.text,
      };
    case 'ticket-document-comment-withdraw':
      return {
        kind: document.kind, ticketId: document.ticketId, document: document.document, messageId: document.messageId
      };
    case 'ticket-document-proposal-apply':
      return {
        kind:             document.kind,
        ticketId:         document.ticketId,
        document:         document.document,
        proposalId:       document.proposalId,
        replacementLines: document.replacementLines,
      };
    case 'ticket-document-proposal-discard':
      return {
        kind: document.kind, ticketId: document.ticketId, document: document.document, proposalId: document.proposalId
      };
    case 'ticket-document-mode-set':
      return {
        kind: document.kind, ticketId: document.ticketId, document: document.document, mode: document.mode
      };
    case 'ticket-document-approve':
    case 'ticket-document-effect-read':
      return {
        kind: document.kind, ticketId: document.ticketId, document: document.document, version: document.version
      };
    case 'ticket-document-turn-stop':
      return { kind: document.kind, ticketId: document.ticketId, document: document.document };
  }
}

function byteLengthOf(text: string): number {
  return new TextEncoder().encode(text).length;
}

function malformedBody(invalidKeys: readonly string[]): BoardCommandReading {
  return { verdict: 'refused', refusal: 'malformed-body', invalidKeys };
}

export class BoardCommandIngestion {
  public commandOf(bodyText: string): BoardCommandReading {
    const parsing = JsonValueUtil.parsedValueOf(bodyText);
    const body = parsing === null ? null : JsonValueUtil.jsonObjectOf(parsing.parsed);
    if (body === null) return malformedBody([]);
    if (ContractVersionUtil.readMajorOf(body, VERSION_KEYS, PAGE_CONTRACT_VERSIONS.gaiaBoardCommand) === null) return malformedBody([VERSION_KEYS.majorKey]);
    const kind = JsonValueUtil.ownValueOf(body, KIND_KEY);
    if (typeof kind !== 'string') return { verdict: 'refused', refusal: 'unknown-kind', kind: null };
    if (!isCommandKind(kind)) return { verdict: 'refused', refusal: 'unknown-kind', kind };
    if (!DOCUMENT_SIZED_KINDS.has(kind) && byteLengthOf(bodyText) > BOARD_COMMAND_BODY_BOUND_BYTES) return { verdict: 'refused', refusal: 'too-large' };
    const invalidKeys = DocumentShapeUtil.invalidKeysOf(body, COMMAND_SHAPES[kind]);
    if (invalidKeys.length > 0) return malformedBody(invalidKeys);
    if (kind !== 'interrupted-work-resume') return { verdict: 'readable', command: commandIn(body as Parameters<typeof commandIn>[0]) };
    const target = resumeTargetIn(JsonValueUtil.ownValueOf(body, RESUME_TARGET_KEY));
    return target === null ? malformedBody([RESUME_TARGET_KEY]) : { verdict: 'readable', command: { kind, target } };
  }
}
