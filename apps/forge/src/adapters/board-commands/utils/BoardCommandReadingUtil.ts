/**
 * An untrusted body of a board kind read into the contract's `ForgeBoardCommand` or `ForgeTicketDocumentCommand`, field by field, or `null`
 * when a field is missing or of the wrong shape. A key the kind does not name is left behind; inside a comment's anchor, an unknown key
 * does not read. Whether a value fits the board (a ticket that exists, a revision still current) is the applier's.
 */
import type { PipelineAgentDocument, PipelineToolRequestDocument } from 'forge-contracts/BoardAgentDocuments';
import type {
  ChartRangeRequest,
  DecisionAnswerFormDocument,
  ForgeBoardCommand,
  ForgeTicketDocumentCommand,
  PictureReferenceDocument
} from 'forge-contracts/BoardCommand';
import type { ConstitutionSourcesDocument, PipelineBillingDocument, PipelineDraftEditDocument } from 'forge-contracts/BoardPipelineDocuments';
import { PROPOSAL_MODES, TICKET_DOCUMENT_KINDS }                                                from 'forge-contracts/BoardVocabulary';
import type {
  ColumnRangeDocument,
  CommentAnchorDocument,
  CommentView,
  DiagramAnchorDocument,
  LineRangeDocument
} from 'forge-contracts/TicketDocumentsDocument';

import { JsonRecordUtil }               from '../../../lib/json-record/JsonRecordUtil.ts';
import { GATE_PHASES }                  from '../../../lib/tracker-model/@types/GatePhase.ts';
import { PIPELINE_SETUP_STEPS }         from '../../../lib/tracker-model/constants/PipelineSetupVocabulary.ts';
import { TICKET_PRIORITIES }            from '../../../lib/tracker-model/constants/TicketFields.ts';
import { BOARD_COMMAND_CONTRACT_KINDS } from '../../../shared/constants/HephaestusApiContracts.ts';
import { SetupPayloadSchemas }          from '../../pipeline-setup/SetupPayloadSchemas.ts';

/** Every command a view sends of the contract's board kinds: the board's own, and from forge 4.2 the user's moves on a ticket's documents. */
export type BoardContractCommand = ForgeBoardCommand | ForgeTicketDocumentCommand;

type BoardCommandKind = BoardContractCommand['kind'];

type BodyRecord = Record<string, unknown>;

type BoardCommandReader = (body: BodyRecord) => BoardContractCommand;

const JOB_STOP_MODES = ['stop', 'wind-down'] as const;

const TRACKER_CLEAR_SCOPES = ['tasks-and-log', 'everything'] as const;

const BILLING_KEYS: readonly string[] = ['mode', 'maxBudgetUsd'];

const CONSTITUTION_SOURCE_KEYS = ['contributing', 'research', 'installedDefault'] as const;

const COMMENT_VIEWS = ['preview', 'code'] as const satisfies readonly CommentView[];

const RANGE_KEYS: readonly string[] = ['from', 'to'];

const ANCHOR_KEYS: readonly string[] = ['view', 'versionNumber', 'lines', 'columns', 'sectionPath', 'quote', 'surroundingLines', 'diagram'];

const DIAGRAM_KEYS: readonly string[] = ['lines', 'diagramKind', 'nodeId', 'nodeLabel'];

/** Thrown inside a reading and caught at its edge, so each check is one line. */
class MalformedBoardCommand extends Error {}

function malformed(): never {
  throw new MalformedBoardCommand();
}

function valueAt(record: BodyRecord, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function textAt(record: BodyRecord, key: string): string {
  const value = valueAt(record, key);
  if (typeof value !== 'string') malformed();
  return value;
}

function wholeNumberAt(record: BodyRecord, key: string): number {
  const value = valueAt(record, key);
  if (typeof value !== 'number' || !Number.isInteger(value)) malformed();
  return value;
}

function booleanAt(record: BodyRecord, key: string): boolean {
  const value = valueAt(record, key);
  if (typeof value !== 'boolean') malformed();
  return value;
}

function textListOf(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) malformed();
  return value;
}

function oneOf<Word extends string>(words: readonly Word[], record: BodyRecord, key: string): Word {
  const value = valueAt(record, key);
  const word  = words.find((candidate) => candidate === value);
  if (word === undefined) malformed();
  return word;
}

function recordOf(value: unknown): BodyRecord {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) malformed();
  return value;
}

/** The key with its text when the body carries one; an absent key stays absent. */
function optionalTextAt<Key extends string>(record: BodyRecord, key: Key): { [Field in Key]?: string } {
  return Object.hasOwn(record, key) ? { [key]: textAt(record, key) } as { [Field in Key]?: string } : {};
}

function optionalTrueAt<Key extends string>(record: BodyRecord, key: Key): { [Field in Key]?: true } {
  if (!Object.hasOwn(record, key)) return {};
  if (record[key] !== true) malformed();
  return { [key]: true } as { [Field in Key]?: true };
}

function chartRangeOf(value: unknown): ChartRangeRequest {
  const range = recordOf(value);
  if (range['kind'] === 'automatic') return { kind: 'automatic' };
  if (range['kind'] !== 'window') malformed();
  const tickMinutes = valueAt(range, 'tickMinutes');
  if (tickMinutes !== null && typeof tickMinutes !== 'number') malformed();
  return {
    kind: 'window', from: textAt(range, 'from'), to: textAt(range, 'to'), tickMinutes
  };
}

function answerOf(value: unknown): DecisionAnswerFormDocument {
  const answer = recordOf(value);
  if (answer['form'] === 'text') return { form: 'text', text: textAt(answer, 'text') };
  if (answer['form'] !== 'letters') malformed();
  return { form: 'letters', choices: textListOf(valueAt(answer, 'choices')), ...optionalTextAt(answer, 'note') };
}

function picturesOf(record: BodyRecord): { pictures?: PictureReferenceDocument[] } {
  if (!Object.hasOwn(record, 'pictures')) return {};
  const pictures = valueAt(record, 'pictures');
  if (!Array.isArray(pictures)) malformed();
  return {
    pictures: pictures.map((value: unknown) => {
      const picture = recordOf(value);
      return { pictureId: textAt(picture, 'pictureId'), name: textAt(picture, 'name') };
    }),
  };
}

/** Only a mode and a budget, as the pipeline stores them. */
function billingOf(value: unknown): PipelineBillingDocument {
  const billing = recordOf(value);
  if (Object.keys(billing).some((key) => !BILLING_KEYS.includes(key))) malformed();
  if (billing['mode'] === 'subscription' && !Object.hasOwn(billing, 'maxBudgetUsd')) return { mode: 'subscription' };
  if (billing['mode'] !== 'api') malformed();
  if (!Object.hasOwn(billing, 'maxBudgetUsd')) return { mode: 'api' };
  const { maxBudgetUsd } = billing;
  if (typeof maxBudgetUsd !== 'number' || !Number.isFinite(maxBudgetUsd)) malformed();
  return { mode: 'api', maxBudgetUsd };
}

const AGENT_KEYS: readonly string[] = ['vendor', 'program'];

const TOOL_REQUEST_KEYS: readonly string[] = ['name', 'path'];

/** A vendor and its program, `{follows: "machine"}` or `{pinned: <path>}`, and nothing else. */
function agentOf(value: unknown): PipelineAgentDocument {
  const agent = recordOf(value);
  if (Object.keys(agent).some((key) => !AGENT_KEYS.includes(key))) malformed();
  const program = recordOf(valueAt(agent, 'program'));
  if (Object.keys(program).length !== 1) malformed();
  const vendor = textAt(agent, 'vendor');
  if (Object.hasOwn(program, 'pinned')) return { vendor, program: { pinned: textAt(program, 'pinned') } };
  if (valueAt(program, 'follows') !== 'machine') malformed();
  return { vendor, program: { follows: 'machine' } };
}

/** The key with its agent when the body carries one; an absent key stays absent. */
function optionalBillingAt(record: BodyRecord): { billing?: PipelineBillingDocument } {
  return Object.hasOwn(record, 'billing') ? { billing: billingOf(record['billing']) } : {};
}

/** Each tool by its name, with its path or without, and `null` for the list removed. */
function toolRequestsOf(value: unknown): PipelineToolRequestDocument[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) malformed();
  return value.map((item: unknown) => {
    const tool = recordOf(item);
    if (Object.keys(tool).some((key) => !TOOL_REQUEST_KEYS.includes(key))) malformed();
    return { name: textAt(tool, 'name'), ...optionalTextAt(tool, 'path') };
  });
}

/** The three ticks, each a boolean, and nothing else. */
function constitutionSourcesOf(record: BodyRecord): { draftedFrom?: ConstitutionSourcesDocument } {
  if (!Object.hasOwn(record, 'draftedFrom')) return {};
  const sources = recordOf(record['draftedFrom']);
  if (Object.keys(sources).length !== CONSTITUTION_SOURCE_KEYS.length) malformed();
  return { draftedFrom: { contributing: booleanAt(sources, 'contributing'), research: booleanAt(sources, 'research'), installedDefault: booleanAt(sources, 'installedDefault') }, };
}

/** Each edit read by its target, as forge reads a typed edit; a field string is no typed edit. */
function draftEditsOf(value: unknown): PipelineDraftEditDocument[] {
  if (!Array.isArray(value) || value.length === 0) malformed();
  return value.map((edit: unknown, index) => {
    const reading = SetupPayloadSchemas.typedDraftEditReadingOf(edit, index);
    if (reading.verdict === 'malformed') malformed();
    return reading.value;
  });
}

function draftSetsOf(value: unknown): string[][] {
  if (!Array.isArray(value)) malformed();
  return value.map(textListOf);
}

/** A record that holds no key outside `keys`. */
function recordOfKeys(value: unknown, keys: readonly string[]): BodyRecord {
  const record = recordOf(value);
  if (Object.keys(record).some((key) => !keys.includes(key))) malformed();
  return record;
}

function versionNumberOrNullAt(record: BodyRecord, key: string): number | null {
  return valueAt(record, key) === null ? null : wholeNumberAt(record, key);
}

/** Line or column numbers from 1, `from` not after `to`. */
function rangeOf(value: unknown): LineRangeDocument & ColumnRangeDocument {
  const range = recordOfKeys(value, RANGE_KEYS);
  const from  = wholeNumberAt(range, 'from');
  const to    = wholeNumberAt(range, 'to');
  if (from < 1 || to < from) malformed();
  return { from, to };
}

function diagramOf(value: unknown): DiagramAnchorDocument {
  const diagram = recordOfKeys(value, DIAGRAM_KEYS);
  return {
    lines:       rangeOf(valueAt(diagram, 'lines')),
    diagramKind: textAt(diagram, 'diagramKind'),
    nodeId:      textAt(diagram, 'nodeId'),
    nodeLabel:   textAt(diagram, 'nodeLabel'),
  };
}

/** `null` for a message on no lines; otherwise the anchor whole, each optional key only when the body carries it. */
function anchorOrNullOf(value: unknown): CommentAnchorDocument | null {
  if (value === null) return null;
  const anchor = recordOfKeys(value, ANCHOR_KEYS);
  return {
    view:             oneOf(COMMENT_VIEWS, anchor, 'view'),
    versionNumber:    wholeNumberAt(anchor, 'versionNumber'),
    lines:            rangeOf(valueAt(anchor, 'lines')),
    ...(Object.hasOwn(anchor, 'columns') ? { columns: rangeOf(anchor['columns']) } : {}),
    sectionPath:      textListOf(valueAt(anchor, 'sectionPath')),
    ...optionalTextAt(anchor, 'quote'),
    surroundingLines: rangeOf(valueAt(anchor, 'surroundingLines')),
    ...(Object.hasOwn(anchor, 'diagram') ? { diagram: diagramOf(anchor['diagram']) } : {}),
  };
}

/** One list of lines for each edit of the proposal, when the user changed them before applying. */
function replacementLinesOf(record: BodyRecord): { replacementLines?: string[][] } {
  if (!Object.hasOwn(record, 'replacementLines')) return {};
  const lists = valueAt(record, 'replacementLines');
  if (!Array.isArray(lists)) malformed();
  return { replacementLines: lists.map(textListOf) };
}

/** The ticket and the document every ticket document kind names. */
function documentAddressOf(body: BodyRecord): Pick<ForgeTicketDocumentCommand, 'ticketReference' | 'document'> {
  return { ticketReference: textAt(body, 'ticketReference'), document: oneOf(TICKET_DOCUMENT_KINDS, body, 'document') };
}

const READER_OF_KIND: Readonly<Record<BoardCommandKind, BoardCommandReader>> = {
  'agent-look-again':   () => ({ kind: 'agent-look-again' }),
  'chart-range-set':    (body) => ({ kind: 'chart-range-set', range: chartRangeOf(valueAt(body, 'range')) }),
  'decision-answer':    (body) => ({ kind: 'decision-answer', decisionId: textAt(body, 'decisionId'), answer: answerOf(valueAt(body, 'answer')) }),
  'gate-profile-start': (body) => {
    const setupId = valueAt(body, 'setupId');
    if (setupId !== null && typeof setupId !== 'string') malformed();
    return {
      kind: 'gate-profile-start', setupId, gateName: textAt(body, 'gateName'), phase: oneOf(GATE_PHASES, body, 'phase'), ...optionalTextAt(body, 'entity')
    };
  },
  'gate-profile-stop': (body) => ({ kind: 'gate-profile-stop', profileRunId: textAt(body, 'profileRunId') }),
  'intake-close':      (body) => ({ kind: 'intake-close', ...optionalTextAt(body, 'jobId'), proposedDraftSets: draftSetsOf(valueAt(body, 'proposedDraftSets')) }),
  'intake-start':      (body) => ({ kind: 'intake-start', text: textAt(body, 'text'), ...picturesOf(body) }),
  'job-fresh':         (body) => ({ kind: 'job-fresh', jobId: textAt(body, 'jobId'), ...optionalTextAt(body, 'incidentId') }),
  'job-message':       (body) => ({
    kind: 'job-message', jobId: textAt(body, 'jobId'), text: textAt(body, 'text'), ...picturesOf(body), ...optionalTextAt(body, 'incidentId')
  }),
  'job-stop':              (body) => ({ kind: 'job-stop', jobId: textAt(body, 'jobId'), mode: oneOf(JOB_STOP_MODES, body, 'mode') }),
  'merge-accept':          (body) => ({ kind: 'merge-accept', ticketReference: textAt(body, 'ticketReference') }),
  'merge-update':          (body) => ({ kind: 'merge-update', ticketReference: textAt(body, 'ticketReference') }),
  'pipeline-agent-advise': (body) => ({ kind: 'pipeline-agent-advise', ...optionalTextAt(body, 'entity') }),
  'pipeline-apply':        (body) => ({
    kind: 'pipeline-apply', setupId: textAt(body, 'setupId'), draftRevision: wholeNumberAt(body, 'draftRevision'), resumesBoard: booleanAt(body, 'resumesBoard')
  }),
  'pipeline-apply-cancel':      (body) => ({ kind: 'pipeline-apply-cancel', setupId: textAt(body, 'setupId') }),
  'pipeline-assistant-set':     (body) => ({ kind: 'pipeline-assistant-set', on: booleanAt(body, 'on') }),
  'pipeline-agent-set':         (body) => ({ kind: 'pipeline-agent-set', agent: agentOf(valueAt(body, 'agent')), ...optionalBillingAt(body) }),
  'pipeline-check':             (body) => ({ kind: 'pipeline-check', setupId: textAt(body, 'setupId') }),
  'pipeline-constitution-edit': (body) => ({
    kind:     'pipeline-constitution-edit',
    setupId:  textAt(body, 'setupId'),
    revision: wholeNumberAt(body, 'revision'),
    ...optionalTextAt(body, 'markdown'),
    ...constitutionSourcesOf(body),
    ...optionalTextAt(body, 'entity'),
  }),
  'pipeline-draft-discard': (body) => ({ kind: 'pipeline-draft-discard', setupId: textAt(body, 'setupId') }),
  'pipeline-draft-edit':    (body) => ({
    kind:          'pipeline-draft-edit',
    setupId:       textAt(body, 'setupId'),
    draftRevision: wholeNumberAt(body, 'draftRevision'),
    edits:         draftEditsOf(valueAt(body, 'edits')),
    ...optionalTrueAt(body, 'isACopy'),
  }),
  'pipeline-draft-undo': (body) => ({
    kind: 'pipeline-draft-undo', setupId: textAt(body, 'setupId'), editId: textAt(body, 'editId'), ...optionalTrueAt(body, 'wholeBatch')
  }),
  'pipeline-setup-answer': (body) => ({
    kind: 'pipeline-setup-answer', setupId: textAt(body, 'setupId'), questionId: textAt(body, 'questionId'), answer: answerOf(valueAt(body, 'answer'))
  }),
  'pipeline-setup-agent':   (body) => ({ kind: 'pipeline-setup-agent', setupId: textAt(body, 'setupId'), agent: agentOf(valueAt(body, 'agent')) }),
  'pipeline-setup-billing': (body) => ({ kind: 'pipeline-setup-billing', setupId: textAt(body, 'setupId'), billing: billingOf(valueAt(body, 'billing')) }),
  'pipeline-setup-resume':  (body) => ({ kind: 'pipeline-setup-resume', setupId: textAt(body, 'setupId') }),
  'pipeline-setup-start':   (body) => ({
    kind:                       'pipeline-setup-start',
    agent:                      agentOf(valueAt(body, 'agent')),
    replacesUnreadablePipeline: booleanAt(body, 'replacesUnreadablePipeline'),
    ...optionalBillingAt(body),
  }),
  'pipeline-setup-start-over': (body) => ({ kind: 'pipeline-setup-start-over', setupId: textAt(body, 'setupId') }),
  'pipeline-setup-step':       (body) => {
    if (valueAt(body, 'move') !== 'continue') malformed();
    return {
      kind: 'pipeline-setup-step', setupId: textAt(body, 'setupId'), step: oneOf(PIPELINE_SETUP_STEPS, body, 'step'), move: 'continue'
    };
  },
  'pipeline-tools-set':     (body) => ({ kind: 'pipeline-tools-set', tools: toolRequestsOf(valueAt(body, 'tools')) }),
  'pipeline-update-start':  (body) => ({ kind: 'pipeline-update-start', ...optionalTextAt(body, 'entity') }),
  'ticket-deliver-by-hand': (body) => ({
    kind: 'ticket-deliver-by-hand', ticketReference: textAt(body, 'ticketReference'), ...optionalTextAt(body, 'branch'), ...optionalTextAt(body, 'commit')
  }),
  'ticket-hold':    (body) => ({ kind: 'ticket-hold', ticketReference: textAt(body, 'ticketReference'), reason: textAt(body, 'reason') }),
  'ticket-network': (body) => ({ kind: 'ticket-network', ticketReference: textAt(body, 'ticketReference'), domains: textListOf(valueAt(body, 'domains')) }),
  'ticket-park':    (body) => ({
    kind: 'ticket-park', ticketReference: textAt(body, 'ticketReference'), reason: textAt(body, 'reason'), ...optionalTextAt(body, 'incidentId')
  }),
  'ticket-priority':      (body) => ({ kind: 'ticket-priority', ticketReference: textAt(body, 'ticketReference'), priority: oneOf(TICKET_PRIORITIES, body, 'priority') }),
  'ticket-ready':         (body) => ({ kind: 'ticket-ready', ticketReferences: textListOf(valueAt(body, 'ticketReferences')) }),
  'ticket-unhold':        (body) => ({ kind: 'ticket-unhold', ticketReference: textAt(body, 'ticketReference') }),
  'tracker-clear':        (body) => ({ kind: 'tracker-clear', scope: oneOf(TRACKER_CLEAR_SCOPES, body, 'scope') }),
  'ticket-document-save': (body) => ({
    kind: 'ticket-document-save', ...documentAddressOf(body), baseVersion: versionNumberOrNullAt(body, 'baseVersion'), markdown: textAt(body, 'markdown')
  }),
  'ticket-document-comment': (body) => ({
    kind: 'ticket-document-comment', ...documentAddressOf(body), anchor: anchorOrNullOf(valueAt(body, 'anchor')), text: textAt(body, 'text')
  }),
  'ticket-document-comment-withdraw': (body) => ({ kind: 'ticket-document-comment-withdraw', ...documentAddressOf(body), messageId: textAt(body, 'messageId') }),
  'ticket-document-proposal-apply':   (body) => ({
    kind: 'ticket-document-proposal-apply', ...documentAddressOf(body), proposalId: textAt(body, 'proposalId'), ...replacementLinesOf(body)
  }),
  'ticket-document-proposal-discard': (body) => ({ kind: 'ticket-document-proposal-discard', ...documentAddressOf(body), proposalId: textAt(body, 'proposalId') }),
  'ticket-document-mode-set':         (body) => ({ kind: 'ticket-document-mode-set', ...documentAddressOf(body), mode: oneOf(PROPOSAL_MODES, body, 'mode') }),
  'ticket-document-approve':          (body) => ({ kind: 'ticket-document-approve', ...documentAddressOf(body), version: wholeNumberAt(body, 'version') }),
  'ticket-document-effect-read':      (body) => ({ kind: 'ticket-document-effect-read', ...documentAddressOf(body), version: wholeNumberAt(body, 'version') }),
  'ticket-document-turn-stop':        (body) => ({ kind: 'ticket-document-turn-stop', ...documentAddressOf(body) }),
};

function isBoardCommandKind(kind: string): kind is BoardCommandKind {
  return (BOARD_COMMAND_CONTRACT_KINDS as readonly string[]).includes(kind);
}

/** The command a body of a board kind names, or `null` for a body of another kind or one that does not read. */
function boardCommandOf(body: BodyRecord): BoardContractCommand | null {
  const kind = valueAt(body, 'kind');
  if (typeof kind !== 'string' || !isBoardCommandKind(kind)) return null;
  try {
    return READER_OF_KIND[kind](body);
  } catch (thrown) {
    if (thrown instanceof MalformedBoardCommand) return null;
    throw thrown;
  }
}

export const BoardCommandReadingUtil = Object.freeze({
  isBoardCommandKind,
  boardCommandOf,
});
