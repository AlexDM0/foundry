/**
 * The shapes Gaia checks a forge's ticket documents with (`GET /api/v1/tickets/{ticketId}/documents`), and the refusal the route answers
 * for a ticket with no documents, each typed against the forge's contract, so a key the contract adds or drops is a compile error here.
 */
import type {
  ColumnRangeDocument,
  CommentAnchorDocument,
  DiagramAnchorDocument,
  DocumentApprovalDocument,
  DocumentMessageDocument,
  DocumentOutOfDateDocument,
  DocumentProposalDocument,
  DocumentVersionDocument,
  EffectEntryDocument,
  EffectReadingDocument,
  EffectReferenceDocument,
  ForgeTicketDocumentsDocument,
  LineChangeDocument,
  LineEditDocument,
  LineRangeDocument,
  TicketDocumentDocument,
} from 'forge-contracts/TicketDocumentsDocument';

import type { FieldRule, ShapeOf }                     from '../../../lib/json-value/DocumentShapeUtil.ts';
import type { JsonValue }                              from '../../../lib/json-value/JsonValueUtil.ts';
import { TicketDocumentsMapUtil }                      from '../utils/TicketDocumentsMapUtil.ts';
import { VocabularyMapUtil, type BoardVocabularyName } from '../utils/VocabularyMapUtil.ts';

/** A read route's refusal (404 for a ticket with no documents), which carries no control version, its sentence the command line's. */
export interface ForgeRouteRefusalAnswer {
  readonly refusal: string;
  readonly fields:  Readonly<Record<string, JsonValue>>;
  readonly text:    string;
}

const TEXT_OR_NULL = { nullable: 'text' } as const;
const WHOLE_NUMBER_OR_NULL = { nullable: 'whole-number' } as const;
const FORGE_VALUES = TicketDocumentsMapUtil.forgeValues;

function vocabularyRule(name: BoardVocabularyName): FieldRule {
  return { oneOf: VocabularyMapUtil.forgeValuesOf(VocabularyMapUtil.vocabularies[name]) };
}

export const LINE_RANGE_SHAPE = { from: 'whole-number', to: 'whole-number' } as const satisfies ShapeOf<LineRangeDocument>;

const COLUMN_RANGE_SHAPE = { from: 'whole-number', to: 'whole-number' } as const satisfies ShapeOf<ColumnRangeDocument>;

const LINE_RANGE_OR_NULL = { nullable: { object: LINE_RANGE_SHAPE } } as const;

const VERSION_SHAPE = {
  number:             'whole-number',
  contentHash:        'text',
  author:             { oneOf: FORGE_VALUES.documentAuthor },
  jobId:              TEXT_OR_NULL,
  at:                 'text',
  constitutionCommit: TEXT_OR_NULL,
  constitutionNumber: WHOLE_NUMBER_OR_NULL,
} as const satisfies ShapeOf<DocumentVersionDocument>;

const APPROVAL_SHAPE = {
  number:             'whole-number',
  contentHash:        'text',
  by:                 { oneOf: FORGE_VALUES.documentApprover },
  at:                 'text',
  constitutionCommit: 'text',
  constitutionNumber: WHOLE_NUMBER_OR_NULL,
  onSpecNumber:       WHOLE_NUMBER_OR_NULL,
  onSpecContentHash:  TEXT_OR_NULL,
} as const satisfies ShapeOf<DocumentApprovalDocument>;

const DIAGRAM_ANCHOR_SHAPE = {
  lines:       { object: LINE_RANGE_SHAPE },
  diagramKind: 'text',
  nodeId:      'text',
  nodeLabel:   'text',
} as const satisfies ShapeOf<DiagramAnchorDocument>;

export const COMMENT_ANCHOR_SHAPE = {
  view:             { oneOf: FORGE_VALUES.commentView },
  versionNumber:    'whole-number',
  lines:            { object: LINE_RANGE_SHAPE },
  columns:          { optional: { object: COLUMN_RANGE_SHAPE } },
  sectionPath:      'text-list',
  quote:            { optional: 'text' },
  surroundingLines: { object: LINE_RANGE_SHAPE },
  diagram:          { optional: { object: DIAGRAM_ANCHOR_SHAPE } },
} as const satisfies ShapeOf<CommentAnchorDocument>;

const MESSAGE_SHAPE = {
  messageId:      'text',
  commentNumber:  WHOLE_NUMBER_OR_NULL,
  decisionId:     TEXT_OR_NULL,
  anchor:         { nullable: { object: COMMENT_ANCHOR_SHAPE } },
  placement:      LINE_RANGE_OR_NULL,
  orphaned:       'boolean',
  text:           'text',
  from:           { oneOf: FORGE_VALUES.documentMessageSender },
  state:          vocabularyRule('documentMessageState'),
  queuedAt:       'text',
  deliveryNumber: WHOLE_NUMBER_OR_NULL,
  agentTurn:      WHOLE_NUMBER_OR_NULL,
} as const satisfies ShapeOf<DocumentMessageDocument>;

const LINE_EDIT_SHAPE = {
  fromLine:         'whole-number',
  toLine:           'whole-number',
  originalLines:    'text-list',
  replacementLines: 'text-list',
} as const satisfies ShapeOf<LineEditDocument>;

const PROPOSAL_SHAPE = {
  proposalId:       'text',
  jobId:            'text',
  baseNumber:       WHOLE_NUMBER_OR_NULL,
  edits:            { listOf: LINE_EDIT_SHAPE },
  summary:          'text',
  answersMessageId: TEXT_OR_NULL,
  forSpecNumber:    WHOLE_NUMBER_OR_NULL,
  state:            vocabularyRule('documentProposalState'),
  appliedNumber:    WHOLE_NUMBER_OR_NULL,
  at:               'text',
  headLines:        LINE_RANGE_OR_NULL,
} as const satisfies ShapeOf<DocumentProposalDocument>;

const LINE_CHANGE_SHAPE = {
  originalFromLine:    'whole-number',
  originalLines:       'text-list',
  replacementFromLine: 'whole-number',
  replacementLines:    'text-list',
} as const satisfies ShapeOf<LineChangeDocument>;

const OUT_OF_DATE_SHAPE = {
  approvedOnSpecNumber: 'whole-number',
  specNumber:           'whole-number',
  specChanges:          { listOf: LINE_CHANGE_SHAPE },
} as const satisfies ShapeOf<DocumentOutOfDateDocument>;

const TICKET_DOCUMENT_SHAPE = {
  document:        vocabularyRule('ticketDocumentKind'),
  standing:        vocabularyRule('documentStanding'),
  reviewer:        { oneOf: FORGE_VALUES.documentApprover },
  holdsAcceptance: 'boolean',
  editable:        'boolean',
  proposalMode:    vocabularyRule('proposalMode'),
  head:            { nullable: { object: VERSION_SHAPE } },
  markdown:        'text',
  versions:        { listOf: VERSION_SHAPE },
  approvals:       { listOf: APPROVAL_SHAPE },
  messages:        { listOf: MESSAGE_SHAPE },
  proposals:       { listOf: PROPOSAL_SHAPE },
  agentJobId:      TEXT_OR_NULL,
  outOfDate:       { nullable: { object: OUT_OF_DATE_SHAPE } },
} as const satisfies ShapeOf<TicketDocumentDocument>;

const EFFECT_REFERENCE_SHAPE = {
  reference: 'whole-number',
  lines:     { object: LINE_RANGE_SHAPE },
  quote:     'text',
} as const satisfies ShapeOf<EffectReferenceDocument>;

const EFFECT_ENTRY_SHAPE = {
  reference:        'whole-number',
  path:             'text',
  change:           vocabularyRule('effectChange'),
  detail:           'text',
  unresolvedReason: { nullable: { oneOf: FORGE_VALUES.effectUnresolvedReason } },
  candidates:       'text-list',
} as const satisfies ShapeOf<EffectEntryDocument>;

const EFFECT_READING_SHAPE = {
  document:             vocabularyRule('ticketDocumentKind'),
  versionNumber:        'whole-number',
  state:                { oneOf: FORGE_VALUES.effectReadingState },
  durationMilliseconds: WHOLE_NUMBER_OR_NULL,
  references:           { listOf: EFFECT_REFERENCE_SHAPE },
  entries:              { listOf: EFFECT_ENTRY_SHAPE },
} as const satisfies ShapeOf<EffectReadingDocument>;

export const TICKET_DOCUMENTS_SHAPE = {
  ticketId:       'text',
  documents:      { listOf: TICKET_DOCUMENT_SHAPE },
  effectReadings: { listOf: EFFECT_READING_SHAPE },
} as const satisfies ShapeOf<ForgeTicketDocumentsDocument>;

export const ROUTE_REFUSAL_SHAPE = {
  refusal: 'text',
  fields:  { recordOf: 'json' },
  text:    'text',
} as const satisfies ShapeOf<ForgeRouteRefusalAnswer>;
