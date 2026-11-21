/**
 * The shapes Gaia checks a forge's board document with: the inventory of what Gaia's views read and the facts the forge serves, each shape
 * typed against the forge's contract, so a key the contract adds or drops is a compile error here. A key named `passed-over` is one no
 * view reads: Gaia passes it over, and a change of it shows here first.
 */
import type {
  BoardDecisionDocument,
  BoardDecisionOptionDocument,
  BoardDecisionQuestionDocument,
  BoardIncidentDeliveryTurnDocument,
  BoardIncidentDocument,
  BoardPictureLimitsDocument,
  BoardQuestionHistoryEntryDocument,
} from 'forge-contracts/BoardConversationDocuments';
import type {
  BoardEndedJobDocument,
  BoardJobDocument,
  BoardJobIntakeDocument,
  BoardJobLiveFactsDocument,
  BoardLastToolCallDocument,
  BoardLostLineDocument,
  BoardSessionLastLineDocument,
  BoardSubagentDocument,
  BoardTicketDependentDocument,
  BoardTicketForecastDocument,
  BoardTicketForecastStepDocument,
} from 'forge-contracts/BoardJobDocuments';
import type { BoardConcurrencyBoundsDocument, BoardLimitsDocument } from 'forge-contracts/BoardLimitsDocument';
import type {
  BoardAirlockHolderDocument,
  BoardMergeQueueDocument,
  BoardMergeQueueEntryDocument,
  BoardMergeTargetDocument,
  BoardWaitingForMergeEntryDocument,
} from 'forge-contracts/BoardMergeQueueDocument';
import type {
  BoardAcceptanceItemDocument,
  BoardDraftAnswerDocument,
  BoardDraftQuestionDocument,
  BoardDraftQuestionOptionDocument,
  BoardDraftRequestDocument,
  BoardDraftSummaryDocument,
  BoardEpicDescriptionDocument,
  BoardEpicRollupDocument,
  BoardEpicSpanDocument,
  BoardLogEntryDocument,
  BoardPageDocument,
  BoardPageFactsDocument,
  BoardPagePayloadDocument,
  BoardPageTicketFactsDocument,
  BoardProgressDocument,
  BoardReadyTicketDocument,
  BoardRowFactsDocument,
  BoardTaskDocument,
  BoardTaskPhaseDocument,
  BoardTicketDocument,
  BoardTicketSectionDocument,
  BoardTicketStageDocument,
  BoardViewRangeDocument,
} from 'forge-contracts/BoardPageDocuments';
import type {
  AgentPairDocument,
  AgentStepSettingsDocument,
  ApplyStateDocument,
  BoardAppliedPipelineDocument,
  BoardDraftEntityFactsDocument,
  BoardEntityAssignmentDocument,
  BoardEntityRefusalDocument,
  BoardEntityRefusalFixDocument,
  BoardGateCacheMarkDocument,
  BoardGateProfileRunDocument,
  BoardPipelineApplicationDocument,
  BoardPipelineChoicesDocument,
  BoardPipelineFlowDocument,
  BoardPipelineHistoryEntryDocument,
  BoardPipelineSetupDocument,
  BoardPipelineStepRunTimeDocument,
  CheckedGateDocument,
  ConditionalReReviewDocument,
  ConstitutionDraftDocument,
  ConstitutionOutlineDocument,
  ConstitutionSourcesDocument,
  EntityAssignmentTicketDocument,
  EntityDraftEditDocument,
  InstructionEntryDocument,
  PipelineAirlockDocument,
  PipelineBillingDocument,
  PipelineChangeDocument,
  PipelineCheckDocument,
  PipelineCheckResultDocument,
  PipelineConstitutionDocument,
  PipelineDefinitionDocument,
  PipelineDraftEditDocument,
  PipelineEntityDefinitionDocument,
  PipelineEntityDocument,
  PipelineEntityFlowDocument,
  PipelineFlowEdgeDocument,
  PipelineFlowNodeDocument,
  PipelineGateChipDocument,
  PipelineGateDocument,
  PipelineGateRowDocument,
  PipelineInsertSlotDocument,
  PipelineOccupantDocument,
  PipelineReviewDocument,
  PipelineSetupEntityDocument,
  PipelineSetupEntityFactsDocument,
  PipelineSetupEntitySummaryDocument,
  PipelineSetupRecordDocument,
  PipelineSetupSummaryDocument,
  PipelineStepDocument,
  PipelineStepsDraftEditDocument,
  ResearchFindingDocument,
  ResearchScriptDocument,
  ResolvedInstructionEntryDocument,
  ResolvedSourceAnnotationDocument,
  SetupEditDocument,
  SetupQuestionDocument,
  SetupQuestionOptionDocument,
  SetupQuestionSubjectDocument,
  SourceAnnotationDocument,
} from 'forge-contracts/BoardPipelineDocuments';
import type {
  BoardAttentionEntryDocument,
  BoardJobOffersDocument,
  BoardJobStopHoldsDocument,
  BoardNoticeDocument,
  BoardTarget,
  BoardTicketFactsDocument,
  BoardTicketOffersDocument,
  BoardTodayDocument,
} from 'forge-contracts/BoardReadingDocuments';
import type {
  BoardConcurrencyDocument,
  BoardLaunchSlotsDocument,
  BoardHephaestusDocument,
  BoardUsageDocument,
  BoardUsageWindowDocument,
  ForgeBoardDocument,
} from 'forge-contracts/ForgeBoardDocument';
import type { ForgeRefusalDocument } from 'forge-contracts/ForgeRefusalDocument';

import type { DocumentShape, FieldRule, ShapeOf }      from '../../../lib/json-value/DocumentShapeUtil.ts';
import { VocabularyMapUtil, type BoardVocabularyName } from '../utils/VocabularyMapUtil.ts';

const TEXT_OR_NULL = { nullable: 'text' } as const;
const WHOLE_NUMBER_OR_NULL = { nullable: 'whole-number' } as const;
const OPTIONAL_TEXT = { optional: 'text' } as const;
const OPTIONAL_TEXT_LIST = { optional: 'text-list' } as const;
const WHOLE_NUMBER_LIST = { eachOf: 'whole-number' } as const;

function vocabularyRule(name: BoardVocabularyName): FieldRule {
  return { oneOf: VocabularyMapUtil.forgeValuesOf(VocabularyMapUtil.vocabularies[name]) };
}

function vocabularyListRule(name: BoardVocabularyName): FieldRule {
  return { eachOf: vocabularyRule(name) };
}

/** An object whose keys are each value of a vocabulary, every one holding a value of the rule. */
function keyedByVocabularyShape(name: BoardVocabularyName, rule: FieldRule): DocumentShape {
  return Object.fromEntries(VocabularyMapUtil.forgeValuesOf(VocabularyMapUtil.vocabularies[name]).map((forgeValue) => [forgeValue, rule]));
}

/** An object whose keys are some values of a vocabulary, every one present holding a value of the rule. */
function partiallyKeyedByVocabularyShape(name: BoardVocabularyName, rule: FieldRule): DocumentShape {
  return Object.fromEntries(VocabularyMapUtil.forgeValuesOf(VocabularyMapUtil.vocabularies[name]).map((forgeValue) => [forgeValue, { optional: rule }]));
}

/** A refusal as a document or a command answer carries it. */
export const REFUSAL_DOCUMENT_SHAPE = { code: 'text', fields: { recordOf: 'json' }, sentence: 'text' } as const satisfies ShapeOf<ForgeRefusalDocument>;

export const TARGET_SHAPE = { subject: vocabularyRule('targetSubject'), id: 'text' } as const satisfies ShapeOf<BoardTarget>;

const ATTENTION_ENTRY_SHAPE = {
  key:                     'text',
  kind:                    vocabularyRule('attentionKind'),
  idText:                  'text',
  ticketIds:               'text-list',
  subject:                 'text',
  jobId:                   TEXT_OR_NULL,
  askedBy:                 TEXT_OR_NULL,
  decisionKind:            TEXT_OR_NULL,
  escalatedFromIncidentId: TEXT_OR_NULL,
  metaText:                TEXT_OR_NULL,
  stamp:                   'text',
  stampWord:               vocabularyRule('attentionStampWord'),
  actionLabel:             vocabularyRule('attentionActionLabel'),
  target:                  { object: TARGET_SHAPE },
} as const satisfies ShapeOf<BoardAttentionEntryDocument>;

const NOTICE_SHAPE = {
  kind:          'text',
  facts:         { recordOf: 'json' },
  sentence:      'text',
  causeSentence: OPTIONAL_TEXT,
} as const satisfies ShapeOf<BoardNoticeDocument>;

const TODAY_SHAPE = { calendarDate: 'text', deliveredTickets: 'whole-number', tokens: 'whole-number' } as const satisfies ShapeOf<BoardTodayDocument>;

const HEPHAESTUS_SHAPE = {
  state:            vocabularyRule('hephaestusState'),
  paused:           'boolean',
  codeVersion:      'text',
  batonPassWarning: 'passed-over',
} as const satisfies ShapeOf<BoardHephaestusDocument>;

const CONCURRENCY_SHAPE = { limit: 'whole-number', agentsInFlight: 'whole-number' } as const satisfies ShapeOf<BoardConcurrencyDocument>;

const LAUNCH_SLOTS_SHAPE = {
  limit:                         'whole-number',
  slotJobIds:                    'text-list',
  inProgressTicketIdsWithoutJob: 'text-list',
} as const satisfies ShapeOf<BoardLaunchSlotsDocument>;

const USAGE_WINDOW_SHAPE = {
  window:      'text',
  lengthHours: { nullable: 'number' },
  utilization: 'number',
  resetsAt:    'text',
} as const satisfies ShapeOf<BoardUsageWindowDocument>;

const USAGE_SHAPE = { resetsAt: TEXT_OR_NULL, window: TEXT_OR_NULL, windows: { listOf: USAGE_WINDOW_SHAPE } } as const satisfies ShapeOf<BoardUsageDocument>;

const TICKET_FACTS_SHAPE = {
  resolvedPriority:     vocabularyRule('ticketPriority'),
  settlesADependency:   'boolean',
  isClosed:             'boolean',
  noAgentHasPickedItUp: 'boolean',
  reviewRound:          WHOLE_NUMBER_OR_NULL,
  isRepeatReview:       'boolean',
} as const satisfies ShapeOf<BoardTicketFactsDocument>;

const TICKET_OFFERS_SHAPE = {
  kinds:           vocabularyListRule('offeredCommandKind'),
  priorityChoices: vocabularyListRule('ticketPriority'),
} as const satisfies ShapeOf<BoardTicketOffersDocument>;

const TICKET_SECTION_SHAPE = { heading: 'text', markdown: 'text' } as const satisfies ShapeOf<BoardTicketSectionDocument>;

const ACCEPTANCE_ITEM_SHAPE = { label: 'text', text: 'text', waived: 'boolean' } as const satisfies ShapeOf<BoardAcceptanceItemDocument>;

const TICKET_SHAPE = {
  id:              'text',
  title:           'text',
  type:            vocabularyRule('ticketType'),
  status:          vocabularyRule('ticketStatus'),
  priority:        { optional: vocabularyRule('ticketPriority') },
  size:            { optional: vocabularyRule('ticketSize') },
  hold:            OPTIONAL_TEXT,
  epics:           OPTIONAL_TEXT_LIST,
  group:           OPTIONAL_TEXT,
  releasesGroup:   { optional: 'boolean' },
  dependsOn:       OPTIONAL_TEXT_LIST,
  branch:          OPTIONAL_TEXT,
  commit:          OPTIONAL_TEXT,
  reason:          OPTIONAL_TEXT,
  network:         OPTIONAL_TEXT_LIST,
  entity:          OPTIONAL_TEXT,
  crosses:         OPTIONAL_TEXT_LIST,
  introducedBy:    OPTIONAL_TEXT,
  foundInReview:   OPTIONAL_TEXT,
  filedByJob:      OPTIONAL_TEXT,
  task:            WHOLE_NUMBER_OR_NULL,
  filed:           'text',
  updated:         'text',
  started:         TEXT_OR_NULL,
  finished:        TEXT_OR_NULL,
  delivered:       TEXT_OR_NULL,
  abandonedAt:     TEXT_OR_NULL,
  bodyMarkdown:    'text',
  sections:        { listOf: TICKET_SECTION_SHAPE },
  acceptanceItems: { listOf: ACCEPTANCE_ITEM_SHAPE },
  facts:           { object: TICKET_FACTS_SHAPE },
  offers:          { object: TICKET_OFFERS_SHAPE },
} as const satisfies ShapeOf<BoardTicketDocument>;

const TASK_PHASE_SHAPE = { status: vocabularyRule('taskStatus'), at: 'text' } as const satisfies ShapeOf<BoardTaskPhaseDocument>;

const TASK_SHAPE = {
  id:             'whole-number',
  name:           'text',
  status:         vocabularyRule('taskStatus'),
  start:          TEXT_OR_NULL,
  end:            TEXT_OR_NULL,
  owner:          'text',
  note:           'text',
  ticket:         TEXT_OR_NULL,
  tokens:         WHOLE_NUMBER_OR_NULL,
  reviewed:       OPTIONAL_TEXT,
  reviewRound:    { optional: 'whole-number' },
  history:        { optional: { listOf: TASK_PHASE_SHAPE } },
  reviewOf:       OPTIONAL_TEXT,
  reviewBarRound: { optional: 'whole-number' },
} as const satisfies ShapeOf<BoardTaskDocument>;

const LOG_ENTRY_SHAPE = {
  at:        'text',
  text:      'text',
  taskIds:   { optional: WHOLE_NUMBER_LIST },
  ticketIds: OPTIONAL_TEXT_LIST,
} as const satisfies ShapeOf<BoardLogEntryDocument>;

const AUTOMATIC_RANGE_SHAPE = { kind: { oneOf: ['auto'] } } as const satisfies ShapeOf<Extract<BoardViewRangeDocument, { kind: 'auto' }>>;

const WINDOW_RANGE_SHAPE = {
  kind:        { oneOf: ['absolute', 'relative'] },
  from:        'text',
  to:          'text',
  tickMinutes: WHOLE_NUMBER_OR_NULL,
} as const satisfies ShapeOf<Extract<BoardViewRangeDocument, { kind: 'absolute' }>>;

const PROGRESS_SHAPE = {
  startedAt:       'text',
  view:            { anyShapeOf: [AUTOMATIC_RANGE_SHAPE, WINDOW_RANGE_SHAPE] },
  hephaestusState: vocabularyRule('hephaestusSetting'),
  tasks:           { listOf: TASK_SHAPE },
  log:             { listOf: LOG_ENTRY_SHAPE },
} as const satisfies ShapeOf<BoardProgressDocument>;

const ROW_FACTS_SHAPE = {
  displayState:                   vocabularyRule('displayState'),
  deliveredRowCountsAsReviewed:   'boolean',
  ownRowPositionOfReviewedTicket: WHOLE_NUMBER_OR_NULL,
} as const satisfies ShapeOf<BoardRowFactsDocument>;

const TICKET_STAGE_SHAPE = { name: vocabularyRule('ticketStage'), entity: 'text' } as const satisfies ShapeOf<BoardTicketStageDocument>;

const PAGE_TICKET_FACTS_SHAPE = {
  ticketId:           'text',
  ownRowPosition:     WHOLE_NUMBER_OR_NULL,
  reviewBarPositions: WHOLE_NUMBER_LIST,
  displayState:       vocabularyRule('displayState'),
  waitingOnTicketIds: 'text-list',
  entity:             OPTIONAL_TEXT,
  stage:              { optional: { object: TICKET_STAGE_SHAPE } },
} as const satisfies ShapeOf<BoardPageTicketFactsDocument>;

const EPIC_SPAN_SHAPE = { start: 'text', end: TEXT_OR_NULL } as const satisfies ShapeOf<BoardEpicSpanDocument>;

const EPIC_SHAPE = {
  key:                 'text',
  title:               'text',
  slot:                'whole-number',
  ticketIds:           'text-list',
  ticketCountByStatus: { object: keyedByVocabularyShape('ticketStatus', 'whole-number') },
  tokens:              'whole-number',
  span:                { nullable: { object: EPIC_SPAN_SHAPE } },
} as const satisfies ShapeOf<BoardEpicRollupDocument>;

const READY_TICKET_SHAPE = { id: 'text', held: { optional: 'boolean' } } as const satisfies ShapeOf<BoardReadyTicketDocument>;

const QUESTION_OPTION_SHAPE = { letter: 'text', text: 'text' } as const satisfies ShapeOf<BoardDraftQuestionOptionDocument & SetupQuestionOptionDocument>;

const LETTERS_ANSWER_SHAPE = { letters: 'text-list', answeredAt: 'text' } as const satisfies ShapeOf<Extract<BoardDraftAnswerDocument, { letters: unknown }>>;

const TEXT_ANSWER_SHAPE = { text: 'text', answeredAt: 'text' } as const satisfies ShapeOf<Extract<BoardDraftAnswerDocument, { text: unknown }>>;

const QUESTION_ANSWER_RULE = { nullable: { anyShapeOf: [LETTERS_ANSWER_SHAPE, TEXT_ANSWER_SHAPE] } } as const;

/** A follow-up is a question of the same shape, so its rule is read from the shape it is part of when the shape is checked. */
const DRAFT_QUESTION_SHAPE: ShapeOf<BoardDraftQuestionDocument> = {
  id:          'text',
  question:    'text',
  context:     'text',
  options:     { listOf: QUESTION_OPTION_SHAPE },
  multiple:    'boolean',
  recommended: 'text-list',
  answer:      QUESTION_ANSWER_RULE,
  get followUps(): FieldRule {
    return { listOf: DRAFT_QUESTION_SHAPE };
  },
};

const FILING_DRAFT_SHAPE = {
  id:                'text',
  title:             'text',
  claimOwner:        TEXT_OR_NULL,
  openedAt:          'text',
  state:             vocabularyRule('draftState'),
  openQuestionCount: 'whole-number',
  questions:         { listOf: DRAFT_QUESTION_SHAPE },
} as const satisfies ShapeOf<BoardDraftSummaryDocument>;

const PAGE_FACTS_SHAPE = {
  rows:         { listOf: ROW_FACTS_SHAPE },
  tickets:      { listOf: PAGE_TICKET_FACTS_SHAPE },
  epics:        { listOf: EPIC_SHAPE },
  readyTickets: { listOf: READY_TICKET_SHAPE },
  drafts:       { listOf: FILING_DRAFT_SHAPE },
} as const satisfies ShapeOf<BoardPageFactsDocument>;

const EPIC_DESCRIPTION_SHAPE = { key: 'text', descriptionMarkdown: 'text' } as const satisfies ShapeOf<BoardEpicDescriptionDocument>;

const DRAFT_REQUEST_SHAPE = { id: 'text', request: 'text' } as const satisfies ShapeOf<BoardDraftRequestDocument>;

const PAGE_PAYLOAD_SHAPE = {
  progress:         { object: PROGRESS_SHAPE },
  epicDescriptions: { listOf: EPIC_DESCRIPTION_SHAPE },
  draftRequests:    { listOf: DRAFT_REQUEST_SHAPE },
  boardFacts:       { object: PAGE_FACTS_SHAPE },
} as const satisfies ShapeOf<BoardPagePayloadDocument>;

const PAGE_SHAPE = { payload: { object: PAGE_PAYLOAD_SHAPE }, tickets: { listOf: TICKET_SHAPE } } as const satisfies ShapeOf<BoardPageDocument>;

const LAST_TOOL_CALL_SHAPE = { toolName: 'text', startedAt: TEXT_OR_NULL, running: 'boolean' } as const satisfies ShapeOf<BoardLastToolCallDocument>;

const SUBAGENT_SHAPE = {
  parentToolUseId: 'text',
  toolCalls:       'whole-number',
  lastToolCall:    { nullable: { object: LAST_TOOL_CALL_SHAPE } },
  tokens:          'whole-number',
  state:           vocabularyRule('subagentState'),
  description:     TEXT_OR_NULL,
} as const satisfies ShapeOf<BoardSubagentDocument>;

const SESSION_LAST_LINE_SHAPE = {
  role: vocabularyRule('sessionLineRole'),
  text: 'text',
  at:   TEXT_OR_NULL,
} as const satisfies ShapeOf<BoardSessionLastLineDocument>;

const JOB_LIVE_FACTS_SHAPE = {
  calls:                  'whole-number',
  callBudget:             WHOLE_NUMBER_OR_NULL,
  tokens:                 'whole-number',
  toolCalls:              'whole-number',
  lastToolCall:           { nullable: { object: LAST_TOOL_CALL_SHAPE } },
  subagents:              { listOf: SUBAGENT_SHAPE },
  toolCallsWithSubagents: 'whole-number',
  silentSweeps:           'whole-number',
  turn:                   { nullable: vocabularyRule('jobTurn') },
  messagesWaiting:        'whole-number',
  lastLine:               { nullable: { object: SESSION_LAST_LINE_SHAPE } },
} as const satisfies ShapeOf<BoardJobLiveFactsDocument>;

const LOST_LINE_SHAPE = { line: vocabularyRule('lostLineKind'), cause: vocabularyRule('interruptionCause') } as const satisfies ShapeOf<BoardLostLineDocument>;

const JOB_INTAKE_SHAPE = { text: 'text', title: TEXT_OR_NULL } as const satisfies ShapeOf<BoardJobIntakeDocument>;

const JOB_OFFERS_SHAPE = {
  stopModes:    vocabularyListRule('jobStopMode'),
  takesFresh:   'boolean',
  takesMessage: 'boolean',
} as const satisfies ShapeOf<BoardJobOffersDocument>;

const JOB_STOP_HOLDS_SHAPE = { stop: 'text', windDown: 'text' } as const satisfies ShapeOf<BoardJobStopHoldsDocument>;

const JOB_SHAPE = {
  id:            'text',
  kind:          'text',
  role:          TEXT_OR_NULL,
  ticketIds:     'text-list',
  state:         vocabularyRule('jobState'),
  attempt:       'whole-number',
  childInstance: 'whole-number',
  crashResumes:  'whole-number',
  launchedAt:    TEXT_OR_NULL,
  airlock:       { nullable: { object: { phase: 'text' } } },
  interruption:  { nullable: vocabularyRule('interruptionCause') },
  lostLine:      { nullable: { object: LOST_LINE_SHAPE } },
  stopRequest:   { nullable: vocabularyRule('jobStopRequest') },
  intake:        { nullable: { object: JOB_INTAKE_SHAPE } },
  entity:        TEXT_OR_NULL,
  live:          { object: JOB_LIVE_FACTS_SHAPE },
  stopHolds:     { object: JOB_STOP_HOLDS_SHAPE },
  offers:        { object: JOB_OFFERS_SHAPE },
} as const satisfies ShapeOf<BoardJobDocument>;

const ENDED_JOB_SHAPE = {
  id:        'text',
  kind:      'text',
  role:      TEXT_OR_NULL,
  ticketIds: 'text-list',
  attempt:   'whole-number',
  outcome:   'text',
  cause:     TEXT_OR_NULL,
  endedAt:   'text',
} as const satisfies ShapeOf<BoardEndedJobDocument>;

type ForecastStepOf<Kind extends BoardTicketForecastStepDocument['kind']> = Extract<BoardTicketForecastStepDocument, { kind: Kind }>;

const FORECAST_STEP_SHAPES = [
  { kind: { oneOf: ['build'] }, attempt: 'whole-number', jobId: TEXT_OR_NULL } as const satisfies ShapeOf<ForecastStepOf<'build'>>,
  { kind: { oneOf: ['customs-and-gates'] }, gateNames: 'text-list', jobId: TEXT_OR_NULL } as const satisfies ShapeOf<ForecastStepOf<'customs-and-gates'>>,
  { kind: { oneOf: ['review'] }, round: 'whole-number', jobId: TEXT_OR_NULL } as const satisfies ShapeOf<ForecastStepOf<'review'>>,
  { kind: { oneOf: ['merge-approval', 'land'] }, target: TEXT_OR_NULL } as const satisfies ShapeOf<ForecastStepOf<'merge-approval' | 'land'>>,
  { kind: { oneOf: ['integrate'] }, target: TEXT_OR_NULL, group: 'text' } as const satisfies ShapeOf<ForecastStepOf<'integrate'>>,
] as const;

const TICKET_DEPENDENT_SHAPE = { ticketId: 'text', stillWaitingOnTicketIds: 'text-list' } as const satisfies ShapeOf<BoardTicketDependentDocument>;

const TICKET_FORECAST_SHAPE = {
  ticketId:         'text',
  steps:            { eachOf: { anyShapeOf: FORECAST_STEP_SHAPES } },
  currentStepIndex: WHOLE_NUMBER_OR_NULL,
  dependents:       { listOf: TICKET_DEPENDENT_SHAPE },
} as const satisfies ShapeOf<BoardTicketForecastDocument>;

const WAITING_FOR_MERGE_SHAPE = {
  ticketId:        'text',
  priority:        vocabularyRule('ticketPriority'),
  againstTarget:   vocabularyRule('mergePrediction'),
  conflictedFiles: { nullable: 'text-list' },
} as const satisfies ShapeOf<BoardWaitingForMergeEntryDocument>;

const MERGE_QUEUE_ENTRY_SHAPE = { ...WAITING_FOR_MERGE_SHAPE, conflictsCaused: 'whole-number' } as const satisfies ShapeOf<BoardMergeQueueEntryDocument>;

const AIRLOCK_HOLDER_SHAPE = { jobId: 'text', ticketIds: 'text-list', phase: 'text' } as const satisfies ShapeOf<BoardAirlockHolderDocument>;

const MERGE_TARGET_SHAPE = {
  target:                 'text',
  holder:                 { nullable: { object: AIRLOCK_HOLDER_SHAPE } },
  order:                  { listOf: MERGE_QUEUE_ENTRY_SHAPE },
  waitingForMerge:        { listOf: WAITING_FOR_MERGE_SHAPE },
  pairwiseConflicts:      { eachOf: 'text-list' },
  targetMovedDecisionIds: 'text-list',
} as const satisfies ShapeOf<BoardMergeTargetDocument>;

const MERGE_QUEUE_SHAPE = { queuedTicketIds: 'text-list', targets: { listOf: MERGE_TARGET_SHAPE } } as const satisfies ShapeOf<BoardMergeQueueDocument>;

const DECISION_OPTION_SHAPE = {
  label:            'text',
  description:      'text',
  recommended:      'boolean',
  touches:          OPTIONAL_TEXT_LIST,
  tradeOff:         OPTIONAL_TEXT,
  acceptanceEffect: OPTIONAL_TEXT,
} as const satisfies ShapeOf<BoardDecisionOptionDocument>;

const DECISION_QUESTION_SHAPE = {
  question:    'text',
  header:      'text',
  multiSelect: 'boolean',
  options:     { listOf: DECISION_OPTION_SHAPE },
} as const satisfies ShapeOf<BoardDecisionQuestionDocument>;

const DECISION_SHAPE = {
  id:        'text',
  kind:      'text',
  ticketIds: 'text-list',
  jobId:     TEXT_OR_NULL,
  askedBy:   'text',
  questions: { listOf: DECISION_QUESTION_SHAPE },
  context:   'text',
  openedAt:  'text',
} as const satisfies ShapeOf<BoardDecisionDocument>;

const DELIVERY_TURN_SHAPE = { jobId: 'text', chatSequence: 'whole-number' } as const satisfies ShapeOf<BoardIncidentDeliveryTurnDocument>;

const INCIDENT_SHAPE = {
  id:              'text',
  kind:            'text',
  ticketIds:       'text-list',
  jobId:           TEXT_OR_NULL,
  facts:           { recordOf: 'text' },
  defaultMove:     'text',
  deliveredInTurn: { nullable: { object: DELIVERY_TURN_SHAPE } },
  openedAt:        'text',
} as const satisfies ShapeOf<BoardIncidentDocument>;

const QUESTION_HISTORY_ENTRY_SHAPE = {
  kind:       'text',
  at:         'text',
  jobId:      OPTIONAL_TEXT,
  ticketId:   OPTIONAL_TEXT,
  decisionId: OPTIONAL_TEXT,
  incidentId: OPTIONAL_TEXT,
  fields:     { recordOf: 'json' },
} as const satisfies ShapeOf<BoardQuestionHistoryEntryDocument>;

const PICTURE_LIMITS_SHAPE = {
  perMessage:     'whole-number',
  sizeLimitBytes: 'whole-number',
  mediaTypes:     'text-list',
} as const satisfies ShapeOf<BoardPictureLimitsDocument>;

type InstructionOf<Kind extends InstructionEntryDocument['kind']> = Extract<InstructionEntryDocument, { kind: Kind }>;

const INSTRUCTION_RULE = {
  anyShapeOf: [
    { kind: { oneOf: ['constitution'] } } as const satisfies ShapeOf<InstructionOf<'constitution'>>,
    { kind: { oneOf: ['default-brief'] }, role: vocabularyRule('pipelineAgentRole') } as const satisfies ShapeOf<InstructionOf<'default-brief'>>,
    { kind: { oneOf: ['file'] }, path: 'text' } as const satisfies ShapeOf<InstructionOf<'file'>>,
  ],
} as const;

const CONCURRENCY_BOUNDS_SHAPE = { lowest: 'whole-number', ceiling: 'whole-number', default: 'whole-number' } as const satisfies ShapeOf<BoardConcurrencyBoundsDocument>;

const LIMITS_SHAPE = {
  tickStepLadderMinutes:      WHOLE_NUMBER_LIST,
  maximumTicksPerAxis:        'whole-number',
  axisMinimumSpanMinutes:     'whole-number',
  axisPaddingMinutes:         'whole-number',
  minimumBarWidthPercent:     'number',
  hoursAxisLabelLimitMinutes: 'whole-number',
  weekAxisLabelLimitMinutes:  'whole-number',
  hourMinutes:                'whole-number',
  dayMinutes:                 'whole-number',
  tickCountSafetyBound:       'whole-number',
  dateAndClockLength:         'whole-number',
  calendarDateLength:         'whole-number',
  monthAndDaySliceStart:      'whole-number',
  clockSliceStart:            'whole-number',
  clockSliceEnd:              'whole-number',
  concurrency:                { object: CONCURRENCY_BOUNDS_SHAPE },
  workerModel:                vocabularyRule('agentModel'),
  workerEffort:               vocabularyRule('agentEffort'),
  reworkRoundThresholdLines:  'whole-number',
  defaultTicketPriority:      vocabularyRule('ticketPriority'),
  firstRepeatReviewRound:     'whole-number',
  defaultInstructionsOfRole:  { object: keyedByVocabularyShape('pipelineAgentRole', { eachOf: INSTRUCTION_RULE }) },
  reReviewThresholdStepLines: 'whole-number',
} as const satisfies ShapeOf<BoardLimitsDocument>;

const AGENT_PAIR_SHAPE = { model: vocabularyRule('agentModel'), effort: vocabularyRule('agentEffort') } as const satisfies ShapeOf<AgentPairDocument>;

const STEP_SHAPE = { name: 'text', run: 'text', in: OPTIONAL_TEXT } as const satisfies ShapeOf<PipelineStepDocument>;

const GATE_SHAPE = {
  name:      'text',
  run:       'text',
  fix:       OPTIONAL_TEXT,
  in:        OPTIONAL_TEXT,
  definedBy: 'passed-over',
  network:   OPTIONAL_TEXT_LIST,
  writes:    OPTIONAL_TEXT_LIST,
  forgeOnly: 'passed-over',
} as const satisfies ShapeOf<PipelineGateDocument>;

const PHASE_ORDERS_SHAPE = keyedByVocabularyShape('gatePhase', 'text-list');

const AGENT_STEP_SETTINGS_SHAPE = {
  model:        { optional: vocabularyRule('agentModel') },
  effort:       { optional: vocabularyRule('agentEffort') },
  instructions: { optional: { eachOf: INSTRUCTION_RULE } },
} as const satisfies ShapeOf<AgentStepSettingsDocument>;

const RE_REVIEW_SHAPE = { thresholdLines: 'whole-number' } as const satisfies ShapeOf<ConditionalReReviewDocument>;

const REVIEW_SHAPE = { name: 'text', reReview: { optional: { object: RE_REVIEW_SHAPE } } } as const satisfies ShapeOf<PipelineReviewDocument>;

const AIRLOCK_SHAPE = { reReview: { optional: { object: RE_REVIEW_SHAPE } } } as const satisfies ShapeOf<PipelineAirlockDocument>;

const CONSTITUTION_SHAPE = { path: 'text' } as const satisfies ShapeOf<PipelineConstitutionDocument>;

type BillingOf<Mode extends PipelineBillingDocument['mode']> = Extract<PipelineBillingDocument, { mode: Mode }>;

const BILLING_RULE = {
  anyShapeOf: [
    { mode: { oneOf: ['subscription'] } } as const satisfies ShapeOf<BillingOf<'subscription'>>,
    { mode: { oneOf: ['api'] }, maxBudgetUsd: { optional: 'number' } } as const satisfies ShapeOf<BillingOf<'api'>>,
  ],
} as const;

const PIPELINE_ENTITY_SHAPE = {
  kind:         vocabularyRule('entityKind'),
  home:         'text-list',
  summary:      OPTIONAL_TEXT,
  constitution: { optional: { object: CONSTITUTION_SHAPE } },
  prepare:      { listOf: STEP_SHAPE },
  gates:        { listOf: GATE_SHAPE },
  phases:       { object: PHASE_ORDERS_SHAPE },
  review:       { optional: { object: REVIEW_SHAPE } },
  agents:       { optional: { object: partiallyKeyedByVocabularyShape('entityAgentRole', { object: AGENT_STEP_SETTINGS_SHAPE }) } },
  whitelist:    OPTIONAL_TEXT_LIST,
  reach:        OPTIONAL_TEXT_LIST,
  dependsOn:    OPTIONAL_TEXT_LIST,
  concurrency:  { optional: 'whole-number' },
} as const satisfies ShapeOf<PipelineEntityDocument>;

const PIPELINE_DEFINITION_SHAPE = {
  version:      'whole-number',
  prepare:      { listOf: STEP_SHAPE },
  gates:        { listOf: GATE_SHAPE },
  phases:       { object: PHASE_ORDERS_SHAPE },
  review:       { optional: { object: REVIEW_SHAPE } },
  airlock:      { optional: { object: AIRLOCK_SHAPE } },
  constitution: { optional: { object: CONSTITUTION_SHAPE } },
  agents:       { optional: { object: partiallyKeyedByVocabularyShape('pipelineAgentRole', { object: AGENT_STEP_SETTINGS_SHAPE }) } },
  approvals:    { optional: { object: partiallyKeyedByVocabularyShape('pipelineApproval', 'boolean') } },
  billing:      { optional: BILLING_RULE },
  reach:        OPTIONAL_TEXT_LIST,
  entities:     { optional: { recordOf: { object: PIPELINE_ENTITY_SHAPE } } },
  assistant:    { optional: 'boolean' },
} as const satisfies ShapeOf<PipelineDefinitionDocument>;

const APPLICATION_SHAPE = {
  appliedRevision:    'whole-number',
  appliedAt:          'text',
  appliedBy:          'passed-over',
  constitutionCommit: TEXT_OR_NULL,
} as const satisfies ShapeOf<BoardPipelineApplicationDocument>;

type AppliedPipelineOf<Verdict extends BoardAppliedPipelineDocument['readingVerdict']> = Extract<BoardAppliedPipelineDocument, { readingVerdict: Verdict }>;

const APPLIED_PIPELINE_RULE = {
  anyShapeOf: [
    { readingVerdict: { oneOf: ['absent'] } } as const satisfies ShapeOf<AppliedPipelineOf<'absent'>>,
    { readingVerdict: { oneOf: ['older'] }, fileText: 'text' } as const satisfies ShapeOf<AppliedPipelineOf<'older'>>,
    { readingVerdict: { oneOf: ['malformed'] }, reason: 'text', fileText: 'text' } as const satisfies ShapeOf<AppliedPipelineOf<'malformed'>>,
    {
      readingVerdict:  { oneOf: ['readable'] },
      pipeline:        { object: PIPELINE_DEFINITION_SHAPE },
      contentHash:     'text',
      fileText:        'text',
      application:     { nullable: { object: APPLICATION_SHAPE } },
      entityPipelines: { recordOf: { object: PIPELINE_DEFINITION_SHAPE } },
    } as const satisfies ShapeOf<AppliedPipelineOf<'readable'>>,
  ],
} as const;

const SETUP_STEP_STATES_SHAPE: DocumentShape = {
  ...keyedByVocabularyShape('setupStep', vocabularyRule('setupStepState')),
  entities: { optional: vocabularyRule('setupStepState') },
};

const RESEARCH_SCRIPT_SHAPE = {
  name:          'text',
  run:           'text',
  meaning:       'text',
  gateCandidate: vocabularyRule('gateCandidacy'),
  needs:         'text-list',
} as const satisfies ShapeOf<ResearchScriptDocument>;

const RESEARCH_FINDING_SHAPE = {
  findingId:    'text',
  topic:        vocabularyRule('findingTopic'),
  label:        'text',
  value:        TEXT_OR_NULL,
  sourcePaths:  'text-list',
  script:       { nullable: { object: RESEARCH_SCRIPT_SHAPE } },
  needsRecheck: 'boolean',
} as const satisfies ShapeOf<ResearchFindingDocument>;

const SETUP_QUESTION_SUBJECT_SHAPE = {
  kind:      vocabularyRule('setupQuestionSubjectKind'),
  reference: 'text',
} as const satisfies ShapeOf<SetupQuestionSubjectDocument>;

const SETUP_QUESTION_SHAPE = {
  questionId:  'text',
  step:        vocabularyRule('setupQuestionStep'),
  subject:     { nullable: { object: SETUP_QUESTION_SUBJECT_SHAPE } },
  question:    'text',
  context:     'text',
  options:     { listOf: QUESTION_OPTION_SHAPE },
  recommended: 'text-list',
  multiple:    'boolean',
  answer:      QUESTION_ANSWER_RULE,
} as const satisfies ShapeOf<SetupQuestionDocument>;

const SOURCE_ANNOTATION_SHAPE = {
  lineText:   'text',
  occurrence: 'whole-number',
  kind:       vocabularyRule('sourceAnnotationKind'),
  path:       TEXT_OR_NULL,
} as const satisfies ShapeOf<SourceAnnotationDocument>;

const RESOLVED_SOURCE_ANNOTATION_SHAPE = { ...SOURCE_ANNOTATION_SHAPE, lineIndex: 'passed-over' } as const satisfies ShapeOf<ResolvedSourceAnnotationDocument>;

const CONSTITUTION_SOURCES_SHAPE = {
  contributing:     'boolean',
  research:         'boolean',
  installedDefault: 'boolean',
} as const satisfies ShapeOf<ConstitutionSourcesDocument>;

const CONSTITUTION_DRAFT_SHAPE = {
  markdown:    'text',
  annotations: { listOf: SOURCE_ANNOTATION_SHAPE },
  draftedFrom: { object: CONSTITUTION_SOURCES_SHAPE },
  baseBlob:    'passed-over',
  revision:    'whole-number',
} as const satisfies ShapeOf<ConstitutionDraftDocument>;

const SETUP_EDIT_SHAPE = {
  editId:  'text',
  by:      vocabularyRule('editAuthor'),
  field:   'text',
  summary: 'text',
  undone:  'boolean',
  batch:   OPTIONAL_TEXT,
} as const satisfies ShapeOf<SetupEditDocument>;

const CHECKED_GATE_SHAPE = {
  name:                  'text',
  outcomes:              'passed-over',
  durationsMilliseconds: 'passed-over',
  verdict:               vocabularyRule('checkedGateVerdict'),
  output:                'text',
} as const satisfies ShapeOf<CheckedGateDocument>;

const CHECK_RESULT_SHAPE = {
  snapshotCommit: 'text',
  prepare:        { object: { failedSteps: { eachOf: TEXT_OR_NULL }, output: 'text' } },
  gates:          { listOf: CHECKED_GATE_SHAPE },
} as const satisfies ShapeOf<PipelineCheckResultDocument>;

const CHECK_SHAPE = {
  draftRevision: 'whole-number',
  gateNames:     'text-list',
  state:         vocabularyRule('checkState'),
  result:        { nullable: { object: CHECK_RESULT_SHAPE } },
  reason:        TEXT_OR_NULL,
} as const satisfies ShapeOf<PipelineCheckDocument>;

const SETUP_ENTITY_SHAPE = {
  agentJobId:   TEXT_OR_NULL,
  findings:     { listOf: RESEARCH_FINDING_SHAPE },
  questions:    { listOf: SETUP_QUESTION_SHAPE },
  constitution: { nullable: { object: CONSTITUTION_DRAFT_SHAPE } },
  check:        { nullable: { object: CHECK_SHAPE } },
} as const satisfies ShapeOf<PipelineSetupEntityDocument>;

const SETUP_RECORD_SHAPE = {
  setupId:                    'text',
  mode:                       vocabularyRule('setupMode'),
  baseContentHash:            'passed-over',
  stepStates:                 { object: SETUP_STEP_STATES_SHAPE },
  currentStep:                vocabularyRule('setupStep'),
  billing:                    BILLING_RULE,
  agentJobId:                 TEXT_OR_NULL,
  snapshotCommit:             TEXT_OR_NULL,
  readyToContinue:            vocabularyListRule('setupStep'),
  findings:                   { listOf: RESEARCH_FINDING_SHAPE },
  questions:                  { listOf: SETUP_QUESTION_SHAPE },
  constitution:               { nullable: { object: CONSTITUTION_DRAFT_SHAPE } },
  draft:                      { nullable: { object: PIPELINE_DEFINITION_SHAPE } },
  draftRevision:              'whole-number',
  edits:                      { listOf: SETUP_EDIT_SHAPE },
  replacesUnreadablePipeline: 'boolean',
  applyRequest:               'passed-over',
  check:                      { nullable: { object: CHECK_SHAPE } },
  entities:                   { optional: { recordOf: { object: SETUP_ENTITY_SHAPE } } },
  openedAtEntity:             'passed-over',
} as const satisfies ShapeOf<PipelineSetupRecordDocument>;

const SETUP_ENTITY_SUMMARY_SHAPE = {
  stackItemCount:                'whole-number',
  scriptCount:                   'whole-number',
  answeredResearchQuestionCount: 'whole-number',
  prepareStepCount:              'whole-number',
  gateCountByPhase:              { object: keyedByVocabularyShape('gatePhase', 'whole-number') },
} as const satisfies ShapeOf<PipelineSetupEntitySummaryDocument>;

const SETUP_SUMMARY_SHAPE = { ...SETUP_ENTITY_SUMMARY_SHAPE, userEditsKeptCount: 'whole-number' } as const satisfies ShapeOf<PipelineSetupSummaryDocument>;

const CONSTITUTION_OUTLINE_SHAPE = { sectionCount: 'whole-number', ruleCount: 'whole-number' } as const satisfies ShapeOf<ConstitutionOutlineDocument>;

const APPLY_STATE_SHAPE = {
  draftRevision:       'whole-number',
  resumesBoard:        'boolean',
  commitJobId:         'passed-over',
  state:               vocabularyRule('applyRequestState'),
  reason:              { nullable: vocabularyRule('applyRequestReason') },
  blockingFiles:       'text-list',
  ticketIdHoldingMain: TEXT_OR_NULL,
} as const satisfies ShapeOf<ApplyStateDocument>;

const SETUP_ENTITY_FACTS_SHAPE = {
  summary:              { object: SETUP_ENTITY_SUMMARY_SHAPE },
  openQuestionCount:    'whole-number',
  agentJobState:        { nullable: vocabularyRule('jobState') },
  constitutionMarkdown: TEXT_OR_NULL,
  constitutionOutline:  { nullable: { object: CONSTITUTION_OUTLINE_SHAPE } },
  annotations:          { listOf: RESOLVED_SOURCE_ANNOTATION_SHAPE },
  readByRoles:          vocabularyListRule('entityAgentRole'),
} as const satisfies ShapeOf<PipelineSetupEntityFactsDocument>;

const DRAFT_ENTITY_FACTS_SHAPE = {
  effectivePipeline:   { object: PIPELINE_DEFINITION_SHAPE },
  dependentEntityKeys: 'text-list',
} as const satisfies ShapeOf<BoardDraftEntityFactsDocument>;

type StepsEditOf<Target extends PipelineStepsDraftEditDocument['target']> = Extract<PipelineStepsDraftEditDocument, { target: Target }>;
type EntityEditOf<Target extends EntityDraftEditDocument['target']> = Extract<EntityDraftEditDocument, { target: Target }>;
type DraftEditOf<Target extends PipelineDraftEditDocument['target']> = Extract<PipelineDraftEditDocument, { target: Target }>;

const STEPS_DRAFT_EDIT_SHAPES = [
  { target: { oneOf: ['gate'] }, name: 'text', value: { nullable: { object: GATE_SHAPE } } } as const satisfies ShapeOf<StepsEditOf<'gate'>>,
  { target: { oneOf: ['phase-order'] }, phase: vocabularyRule('gatePhase'), names: 'text-list' } as const satisfies ShapeOf<StepsEditOf<'phase-order'>>,
  { target: { oneOf: ['prepare'] }, name: 'text', value: { nullable: { object: STEP_SHAPE } } } as const satisfies ShapeOf<StepsEditOf<'prepare'>>,
  { target: { oneOf: ['prepare-order'] }, names: 'text-list' } as const satisfies ShapeOf<StepsEditOf<'prepare-order'>>,
  { target: { oneOf: ['review'] }, value: { nullable: { object: REVIEW_SHAPE } } } as const satisfies ShapeOf<StepsEditOf<'review'>>,
  { target: { oneOf: ['constitution'] }, value: { nullable: { object: CONSTITUTION_SHAPE } } } as const satisfies ShapeOf<StepsEditOf<'constitution'>>,
] as const;

const ENTITY_DRAFT_EDIT_SHAPES = [
  ...STEPS_DRAFT_EDIT_SHAPES,
  {
    target: { oneOf: ['role'] },
    role:   vocabularyRule('entityAgentRole'),
    value:  { nullable: { object: AGENT_STEP_SETTINGS_SHAPE } },
  } as const satisfies ShapeOf<EntityEditOf<'role'>>,
  { target: { oneOf: ['whitelist', 'reach', 'depends-on'] }, value: { nullable: 'text-list' } } as const satisfies ShapeOf<EntityEditOf<'whitelist' | 'reach' | 'depends-on'>>,
  { target: { oneOf: ['concurrency'] }, value: WHOLE_NUMBER_OR_NULL } as const satisfies ShapeOf<EntityEditOf<'concurrency'>>,
] as const;

const ENTITY_DEFINITION_SHAPE = { kind: vocabularyRule('entityKind'), home: 'text-list', summary: OPTIONAL_TEXT } as const satisfies ShapeOf<PipelineEntityDefinitionDocument>;

const DRAFT_EDIT_RULE = {
  anyShapeOf: [
    ...STEPS_DRAFT_EDIT_SHAPES,
    {
      target: { oneOf: ['role'] },
      role:   vocabularyRule('pipelineAgentRole'),
      value:  { nullable: { object: AGENT_STEP_SETTINGS_SHAPE } },
    } as const satisfies ShapeOf<DraftEditOf<'role'>>,
    { target: { oneOf: ['airlock'] }, value: { nullable: { object: AIRLOCK_SHAPE } } } as const satisfies ShapeOf<DraftEditOf<'airlock'>>,
    {
      target:   { oneOf: ['approval'] },
      approval: vocabularyRule('pipelineApproval'),
      value:    { nullable: 'boolean' },
    } as const satisfies ShapeOf<DraftEditOf<'approval'>>,
    {
      target:    { oneOf: ['entity'] },
      entityKey: 'text',
      value:     { nullable: { object: ENTITY_DEFINITION_SHAPE } },
    } as const satisfies ShapeOf<DraftEditOf<'entity'>>,
    {
      target:    { oneOf: ['within-entity'] },
      entityKey: 'text',
      edit:      { anyShapeOf: ENTITY_DRAFT_EDIT_SHAPES },
    } as const satisfies ShapeOf<DraftEditOf<'within-entity'>>,
  ],
} as const;

const ENTITY_REFUSAL_FIX_SHAPE = { label: 'text', edits: { eachOf: DRAFT_EDIT_RULE } } as const satisfies ShapeOf<BoardEntityRefusalFixDocument>;

const ENTITY_REFUSAL_SHAPE = {
  reason:     vocabularyRule('entityRefusalReason'),
  entityKeys: 'text-list',
  shownOn:    'text',
  sentence:   'text',
  fix:        { nullable: { object: ENTITY_REFUSAL_FIX_SHAPE } },
} as const satisfies ShapeOf<BoardEntityRefusalDocument>;

const PIPELINE_SETUP_SHAPE = {
  record:               { object: SETUP_RECORD_SHAPE },
  summary:              { object: SETUP_SUMMARY_SHAPE },
  openQuestionCount:    'whole-number',
  agentJobState:        { nullable: vocabularyRule('jobState') },
  mainMovedByCommits:   'whole-number',
  constitutionMarkdown: TEXT_OR_NULL,
  constitutionOutline:  { nullable: { object: CONSTITUTION_OUTLINE_SHAPE } },
  annotations:          { listOf: RESOLVED_SOURCE_ANNOTATION_SHAPE },
  readByRoles:          vocabularyListRule('pipelineAgentRole'),
  applyState:           { nullable: { object: APPLY_STATE_SHAPE } },
  entities:             { optional: { recordOf: { object: SETUP_ENTITY_FACTS_SHAPE } } },
  draftEntities:        { recordOf: { object: DRAFT_ENTITY_FACTS_SHAPE } },
  applyRefusal:         { nullable: { object: REFUSAL_DOCUMENT_SHAPE } },
  entityRefusals:       { listOf: ENTITY_REFUSAL_SHAPE },
} as const satisfies ShapeOf<BoardPipelineSetupDocument>;

const RESOLVED_INSTRUCTION_SHAPE = {
  entry:       INSTRUCTION_RULE,
  fileName:    'text',
  readByRoles: vocabularyListRule('pipelineAgentRole'),
  text:        TEXT_OR_NULL,
  textIsCut:   'boolean',
} as const satisfies ShapeOf<ResolvedInstructionEntryDocument>;

const GATE_CHIP_SHAPE = { gateName: 'text', mark: vocabularyRule('pipelineNodeMark') } as const satisfies ShapeOf<PipelineGateChipDocument>;

const FLOW_NODE_SHAPE = {
  nodeId:             'text',
  nodeKind:           vocabularyRule('pipelineNodeKind'),
  role:               { nullable: vocabularyRule('pipelineAgentRole') },
  settings:           { nullable: { object: AGENT_PAIR_SHAPE } },
  instructionEntries: { listOf: RESOLVED_INSTRUCTION_SHAPE },
  derivedFrom:        { nullable: vocabularyRule('derivedSettingsSource') },
  mergePlacement:     { nullable: vocabularyRule('mergePlacement') },
  phase:              { nullable: vocabularyRule('gatePhase') },
  conditional:        'boolean',
  thresholdLines:     WHOLE_NUMBER_OR_NULL,
  switchState:        { nullable: vocabularyRule('switchState') },
  gateChips:          { listOf: GATE_CHIP_SHAPE },
  mark:               vocabularyRule('pipelineNodeMark'),
  dialogTarget:       { nullable: vocabularyRule('nodeDialogTarget') },
  questionIds:        'text-list',
} as const satisfies ShapeOf<PipelineFlowNodeDocument>;

const FLOW_EDGE_SHAPE = {
  edgeId:    'passed-over',
  from:      'text',
  to:        'text',
  tone:      vocabularyRule('edgeTone'),
  labelKind: { nullable: vocabularyRule('edgeLabelKind') },
  active:    'boolean',
} as const satisfies ShapeOf<PipelineFlowEdgeDocument>;

const INSERT_SLOT_SHAPE = {
  slotId:       'text',
  after:        'text',
  offeredSteps: vocabularyListRule('insertableStep'),
} as const satisfies ShapeOf<PipelineInsertSlotDocument>;

const OCCUPANT_SHAPE = {
  occupantKind: vocabularyRule('occupantKind'),
  occupantId:   'text',
  nodeId:       'text',
  jobId:        TEXT_OR_NULL,
  since:        'text',
} as const satisfies ShapeOf<PipelineOccupantDocument>;

const GATE_ROW_SHAPE = {
  rowKind:      vocabularyRule('gateRowKind'),
  name:         'text',
  run:          'text',
  fix:          TEXT_OR_NULL,
  in:           TEXT_OR_NULL,
  network:      'text-list',
  alsoInPhases: vocabularyListRule('gatePhase'),
  mark:         vocabularyRule('pipelineNodeMark'),
} as const satisfies ShapeOf<PipelineGateRowDocument>;

const GATE_ROWS_SHAPE = keyedByVocabularyShape('gatePhase', { listOf: GATE_ROW_SHAPE });

const PIPELINE_CHANGE_SHAPE = {
  field:      'text',
  changeKind: vocabularyRule('changeKind'),
  editId:     TEXT_OR_NULL,
} as const satisfies ShapeOf<PipelineChangeDocument>;

const ENTITY_FLOW_SHAPE = {
  nodes:       { listOf: FLOW_NODE_SHAPE },
  edges:       { listOf: FLOW_EDGE_SHAPE },
  insertSlots: { listOf: INSERT_SLOT_SHAPE },
  gateRows:    { object: GATE_ROWS_SHAPE },
} as const satisfies ShapeOf<PipelineEntityFlowDocument>;

const PIPELINE_FLOW_SHAPE = {
  ...ENTITY_FLOW_SHAPE,
  occupants:         { listOf: OCCUPANT_SHAPE },
  changeList:        { listOf: PIPELINE_CHANGE_SHAPE },
  ticketIdsInFlight: 'text-list',
  toolbarStage:      vocabularyRule('flowStage'),
  entityFlows:       { optional: { recordOf: { object: ENTITY_FLOW_SHAPE } } },
} as const satisfies ShapeOf<BoardPipelineFlowDocument>;

const PROFILE_RUN_SHAPE = {
  profileRunId:        'text',
  entity:              OPTIONAL_TEXT,
  gateName:            'text',
  phase:               vocabularyRule('gatePhase'),
  state:               vocabularyRule('profileRunState'),
  elapsedMilliseconds: WHOLE_NUMBER_OR_NULL,
  cacheReport:         { nullable: vocabularyRule('cacheReport') },
} as const satisfies ShapeOf<BoardGateProfileRunDocument>;

const GATE_CACHE_MARK_SHAPE = {
  entity:      OPTIONAL_TEXT,
  gateName:    'text',
  phase:       vocabularyRule('gatePhase'),
  cacheReport: vocabularyRule('cacheReport'),
} as const satisfies ShapeOf<BoardGateCacheMarkDocument>;

const STEP_RUN_TIME_SHAPE = {
  entity:          OPTIONAL_TEXT,
  stepKind:        vocabularyRule('stepKind'),
  stepName:        'text',
  phase:           { optional: vocabularyRule('gatePhase') },
  runMilliseconds: 'whole-number',
  ending:          vocabularyRule('stepEnding'),
  at:              'text',
} as const satisfies ShapeOf<BoardPipelineStepRunTimeDocument>;

type HistoryEntryOf<Kind extends BoardPipelineHistoryEntryDocument['kind']> = Extract<BoardPipelineHistoryEntryDocument, { kind: Kind }>;

const PIPELINE_HISTORY_ENTRY_RULE = {
  anyShapeOf: [
    {
      kind:   { oneOf: ['pipeline-gate-added', 'pipeline-prepare-step-set'] },
      at:     'text',
      fields: { object: { name: 'text', run: 'text' } },
    } as const satisfies ShapeOf<HistoryEntryOf<'pipeline-gate-added' | 'pipeline-prepare-step-set'>>,
    { kind: { oneOf: ['pipeline-gate-removed'] }, at: 'text', fields: { object: { name: 'text' } } } as const satisfies ShapeOf<HistoryEntryOf<'pipeline-gate-removed'>>,
    { kind: { oneOf: ['pipeline-gates-none'] }, at: 'text' } as const satisfies ShapeOf<HistoryEntryOf<'pipeline-gates-none'>>,
    {
      kind:   { oneOf: ['pipeline-gates-ordered'] },
      at:     'text',
      fields: { object: { phase: vocabularyRule('gatePhase'), names: 'text-list' } },
    } as const satisfies ShapeOf<HistoryEntryOf<'pipeline-gates-ordered'>>,
    {
      kind:   { oneOf: ['pipeline-approval-set'] },
      at:     'text',
      fields: { object: { approval: 'text', state: 'text' } },
    } as const satisfies ShapeOf<HistoryEntryOf<'pipeline-approval-set'>>,
    {
      kind:   { oneOf: ['pipeline-assistant-set'] },
      at:     'text',
      fields: { object: { state: 'text' } },
    } as const satisfies ShapeOf<HistoryEntryOf<'pipeline-assistant-set'>>,
    {
      kind:    { oneOf: ['pipeline-setup-opened'] },
      at:      'text',
      setupId: 'text',
      fields:  { object: { mode: vocabularyRule('setupMode'), replacesUnreadablePipeline: 'boolean' } },
    } as const satisfies ShapeOf<HistoryEntryOf<'pipeline-setup-opened'>>,
    {
      kind:    { oneOf: ['pipeline-draft-discarded'] },
      at:      'text',
      setupId: 'text',
      fields:  { object: { revision: 'whole-number' } },
    } as const satisfies ShapeOf<HistoryEntryOf<'pipeline-draft-discarded'>>,
    { kind: { oneOf: ['pipeline-setup-discarded'] }, at: 'text', setupId: 'text' } as const satisfies ShapeOf<HistoryEntryOf<'pipeline-setup-discarded'>>,
    {
      kind:   { oneOf: ['hephaestus-set'] },
      at:     'text',
      fields: { object: { state: vocabularyRule('hephaestusSetting') } },
    } as const satisfies ShapeOf<HistoryEntryOf<'hephaestus-set'>>,
  ],
} as const;

const PIPELINE_CHOICES_SHAPE = {
  models:  vocabularyListRule('agentModel'),
  efforts: vocabularyListRule('agentEffort'),
} as const satisfies ShapeOf<BoardPipelineChoicesDocument>;

const ENTITY_ASSIGNMENT_TICKET_SHAPE = {
  ticketId:   'text',
  title:      TEXT_OR_NULL,
  entity:     TEXT_OR_NULL,
  reason:     TEXT_OR_NULL,
  assignedBy: { nullable: vocabularyRule('assignedBy') },
} as const satisfies ShapeOf<EntityAssignmentTicketDocument>;

const ENTITY_ASSIGNMENT_SHAPE = {
  jobId:    'text',
  jobState: { nullable: vocabularyRule('jobState') },
  tickets:  { listOf: ENTITY_ASSIGNMENT_TICKET_SHAPE },
} as const satisfies ShapeOf<BoardEntityAssignmentDocument>;

export const BOARD_DOCUMENT_SHAPE = {
  project:               'text',
  hephaestus:            { object: HEPHAESTUS_SHAPE },
  concurrency:           { object: CONCURRENCY_SHAPE },
  launchSlots:           { object: LAUNCH_SLOTS_SHAPE },
  confinement:           'passed-over',
  usage:                 { object: USAGE_SHAPE },
  page:                  { object: PAGE_SHAPE },
  mergeQueue:            { object: MERGE_QUEUE_SHAPE },
  jobs:                  { listOf: JOB_SHAPE },
  endedJobs:             { listOf: ENDED_JOB_SHAPE },
  decisions:             { listOf: DECISION_SHAPE },
  incidents:             { listOf: INCIDENT_SHAPE },
  questionHistory:       { listOf: QUESTION_HISTORY_ENTRY_SHAPE },
  ticketForecasts:       { listOf: TICKET_FORECAST_SHAPE },
  pipeline:              APPLIED_PIPELINE_RULE,
  pipelineSetup:         { nullable: { object: PIPELINE_SETUP_SHAPE } },
  pipelineFlow:          { nullable: { object: PIPELINE_FLOW_SHAPE } },
  profileRuns:           { listOf: PROFILE_RUN_SHAPE },
  gateCacheMarks:        { listOf: GATE_CACHE_MARK_SHAPE },
  stepRunTimes:          { listOf: STEP_RUN_TIME_SHAPE },
  pipelineHistory:       { eachOf: PIPELINE_HISTORY_ENTRY_RULE },
  pipelineChoices:       { object: PIPELINE_CHOICES_SHAPE },
  pipelineAgentDefaults: { object: AGENT_PAIR_SHAPE },
  entityAssignment:      { nullable: { object: ENTITY_ASSIGNMENT_SHAPE } },
  pictureLimits:         { nullable: { object: PICTURE_LIMITS_SHAPE } },
  limits:                { object: LIMITS_SHAPE },
  notices:               { listOf: NOTICE_SHAPE },
  warnings:              { listOf: NOTICE_SHAPE },
  attention:             { listOf: ATTENTION_ENTRY_SHAPE },
  today:                 { object: TODAY_SHAPE },
  openDecisionIds:       'text-list',
  escalatedDecisionIds:  'text-list',
} as const satisfies ShapeOf<ForgeBoardDocument>;
