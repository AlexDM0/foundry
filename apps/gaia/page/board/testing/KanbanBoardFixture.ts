/**
 * Small synthetic boards in the page's board contract for the Kanban's view-model specs and its DOM specs: each ticket with the facts a forge
 * serves for its status and priority, its rows, its page facts and the open decisions in the served answering order. Test-only.
 */
import type { BoardDecisionDocument }                              from '../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }                                      from '../../@types/board/BoardDocument.ts';
import type { BoardPipelineEntityDocument }                        from '../../@types/board/BoardPipelineDocuments.ts';
import type { BoardFilingDraftDocument, BoardTaskDocument }        from '../../@types/board/BoardTicketDocuments.ts';
import type { BoardTicketDocument, BoardTicketStageFactsDocument } from '../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState, BoardTicketStatus }               from '../../@types/board/BoardVocabulary.ts';
import { TimeUtil }                                                from '../utils/TimeUtil.ts';
import type { KanbanSurroundings }                                 from '../views/kanban/KanbanModel.ts';
import {
  boardStateFixture,
  exampleAskingDecision,
  exampleTask,
  exampleTicket as exampleBoardTicket,
  ticketCountByStatusOf
} from './BoardStateFixture.ts';
import { EXAMPLE_BOARD_LIMITS }           from './PageLimitsFixture.ts';
import { exampleEntity, examplePipeline } from './PipelineFixture.ts';

/** Every example ticket was filed at this moment unless a spec says otherwise. */
export const EXAMPLE_FILED_STAMP = '2026-10-01T09:00:00+02:00';

/** The moment the example boards are read at: nine days after the tickets were filed. */
export const EXAMPLE_NOW_EPOCH_MILLISECONDS = Date.parse('2026-10-10T12:00:00+02:00');

/** Read at the example moment, with every finished ticket shown. */
export const EXAMPLE_SURROUNDINGS_SHOWING_ALL_FINISHED: KanbanSurroundings = {
  nowEpochMilliseconds:    EXAMPLE_NOW_EPOCH_MILLISECONDS,
  todayCalendarDate:       TimeUtil.calendarDateOf(EXAMPLE_NOW_EPOCH_MILLISECONDS),
  finishedWorkChoice:      'all',
  cutoffEpochMilliseconds: Number.NEGATIVE_INFINITY,
};

/** As a forge serves them (`BoardReadingMappingUtil.ticketFactsOf`): the statuses that settle a dependency, close a ticket or no agent took. */
const STATUSES_THAT_SETTLE_A_DEPENDENCY: readonly BoardTicketStatus[] = ['reviewed', 'delivered'];
const CLOSED_STATUSES: readonly BoardTicketStatus[] = ['delivered', 'abandoned'];
const STATUSES_NO_AGENT_HAS_PICKED_UP: readonly BoardTicketStatus[] = ['draft', 'ready-for-review', 'committed'];

/** A committed ticket filed at the example moment; its served facts follow its status and its priority, `normal` where it names none. */
export function exampleTicket(id: string, fields: Partial<BoardTicketDocument> = {}): BoardTicketDocument {
  const status = fields.status ?? 'committed';
  return exampleBoardTicket({
    id,
    title:   `Example ticket ${id}`,
    filed:   EXAMPLE_FILED_STAMP,
    updated: EXAMPLE_FILED_STAMP,
    ...fields,
    facts:   {
      resolvedPriority:     fields.priority ?? EXAMPLE_BOARD_LIMITS.defaultTicketPriority,
      settlesADependency:   STATUSES_THAT_SETTLE_A_DEPENDENCY.includes(status),
      isClosed:             CLOSED_STATUSES.includes(status),
      noAgentHasPickedItUp: STATUSES_NO_AGENT_HAS_PICKED_UP.includes(status),
      reviewRound:          null,
      isRepeatReview:       false,
      ...fields.facts,
    },
  });
}

/** A ticket's own row; `tokens` gives it a token count and the rest its stamps. */
export type ExampleOwnRow = Partial<BoardTaskDocument> & { readonly countsAsReviewed?: boolean };

/** An open decision as far as the Kanban reads it. */
export type ExampleDecision = Pick<BoardDecisionDocument, 'id' | 'kind' | 'ticketIds'>;

export interface ExampleBoardFields {
  readonly tickets:                    readonly BoardTicketDocument[];
  readonly readyTicketIds?:            readonly string[];
  readonly queuedTicketIds?:           readonly string[];
  /** The tickets waiting for User's merge accept, one target's `waitingForMerge`. */
  readonly waitingForAcceptTicketIds?: readonly string[];
  /** The board's open filing drafts; one waiting draft, D7, when not given. */
  readonly filingDrafts?:              readonly BoardFilingDraftDocument[];
  readonly waitingOn?:                 Readonly<Record<string, readonly string[]>>;
  readonly tokensById?:                Readonly<Record<string, number>>;
  /** Rows beside the tokens' rows: a ticket named here gets an own row with these fields. */
  readonly ownRowsById?:               Readonly<Record<string, ExampleOwnRow>>;
  /** Review rows, each of the ticket it reviews, oldest first. */
  readonly reviewRowsById?:            Readonly<Record<string, readonly Partial<BoardTaskDocument>[]>>;
  /** The display state the forge serves, where it differs from the ticket's status. */
  readonly displayStateById?:          Readonly<Record<string, BoardDisplayState>>;
  /** The open decisions; none when not given. */
  readonly decisions?:                 readonly ExampleDecision[];
  /** The served answering order; the decisions' own order when not given. */
  readonly openDecisionIds?:           readonly string[];
  /** The applied pipeline's entities: given, the board is in monorepo mode; absent, it has no readable pipeline at all. */
  readonly entities?:                  Readonly<Record<string, Pick<BoardPipelineEntityDocument, 'kind'>>>;
  /** Each ticket's entity in the served page facts. */
  readonly entityById?:                Readonly<Record<string, string>>;
  /** Each crossing ticket's stage in the served page facts. */
  readonly stageById?:                 Readonly<Record<string, BoardTicketStageFactsDocument>>;
}

/** A waiting filing draft with two open questions. */
export function exampleFilingDraft(changes: Partial<BoardFilingDraftDocument> & Pick<BoardFilingDraftDocument, 'id'>): BoardFilingDraftDocument {
  return {
    title:             'Example filing draft',
    claimOwner:        null,
    openedAt:          EXAMPLE_FILED_STAMP,
    state:             'waiting',
    openQuestionCount: 2,
    questions:         [],
    ...changes,
  };
}

function exampleRow(id: number, ticketId: string, row: Partial<BoardTaskDocument>): BoardTaskDocument {
  return exampleTask({
    name: `#${ticketId}`, status: 'in-progress', ticket: ticketId, ...row, id,
  });
}

function appliedPipelineOf(entities: ExampleBoardFields['entities']): BoardDocument['pipeline']['applied'] {
  if (entities === undefined) return { readingVerdict: 'absent' };
  const fullEntities = Object.fromEntries(Object.entries(entities).map(([key, entity]) => [key, exampleEntity(entity.kind, [`${key}/`])]));
  return {
    readingVerdict:  'readable',
    pipeline:        examplePipeline({ entities: fullEntities }),
    contentHash:     'example-hash',
    fileText:        '',
    application:     null,
    entityPipelines: {},
  };
}

export function exampleBoard(fields: ExampleBoardFields): BoardDocument {
  const ownRowIds = [...new Set([...Object.keys(fields.tokensById ?? {}), ...Object.keys(fields.ownRowsById ?? {})])];
  const ownRows = ownRowIds.map((ticketId, index) => {
    const tokens = fields.tokensById?.[ticketId];
    const { countsAsReviewed = false, ...row } = fields.ownRowsById?.[ticketId] ?? {};
    return { ticketId, task: exampleRow(index, ticketId, { ...tokens === undefined ? {} : { tokens }, ...row }), countsAsReviewed };
  });
  const reviewRows = Object.entries(fields.reviewRowsById ?? {})
    .flatMap(([ticketId, rows]) => rows.map((row) => ({ ticketId, row })))
    .map(({ ticketId, row }, index) => ({ ticketId, task: exampleRow(ownRows.length + index, ticketId, { reviewOf: ticketId, ...row }) }));
  const tasks = [...ownRows.map((row) => row.task), ...reviewRows.map((row) => row.task)];
  const displayStateOf = (ticket: BoardTicketDocument): BoardDisplayState => fields.displayStateById?.[ticket.id] ?? ticket.status;
  const tickets = fields.tickets.map((ticket) => {
    const ownRow = ownRows.find((row) => row.ticketId === ticket.id)?.task;
    const isRepeatReview = displayStateOf(ticket) === 're-review';
    const reviewRound = ownRow?.reviewRound ?? (isRepeatReview ? EXAMPLE_BOARD_LIMITS.firstRepeatReviewRound : null);
    return { ...ticket, facts: { ...ticket.facts, reviewRound, isRepeatReview } };
  });
  const decisions = (fields.decisions ?? []).map((decision) => exampleAskingDecision({ ...decision, jobId: null }));
  const board = boardStateFixture();
  return boardStateFixture({
    decisions,
    openDecisionIds: fields.openDecisionIds ?? decisions.map((decision) => decision.id),
    pipeline:        { ...board.pipeline, applied: appliedPipelineOf(fields.entities) },
    page:            {
      ...board.page,
      progress: { ...board.page.progress, tasks },
      facts:    {
        rows: [
          ...ownRows.map((row) => ({ displayState: row.task.status, deliveredRowCountsAsReviewed: row.countsAsReviewed, ownRowPositionOfReviewedTicket: null })),
          ...reviewRows.map((row) => ({ displayState: row.task.status, deliveredRowCountsAsReviewed: false, ownRowPositionOfReviewedTicket: null })),
        ],
        tickets: tickets.map((ticket) => {
          const position = ownRowIds.indexOf(ticket.id);
          return {
            ticketId:           ticket.id,
            ownRowPosition:     position === -1 ? null : position,
            reviewBarPositions: reviewRows.flatMap((row, index) => (row.ticketId === ticket.id ? [ownRows.length + index] : [])),
            displayState:       displayStateOf(ticket),
            waitingOnTicketIds: fields.waitingOn?.[ticket.id] ?? [],
            entity:             fields.entityById?.[ticket.id] ?? null,
            stage:              fields.stageById?.[ticket.id] ?? null,
          };
        }),
        epics: [
          {
            key: 'checkout', title: 'Example checkout', slot: 2, ticketIds: [], ticketCountByStatus: ticketCountByStatusOf({}), tokens: 0, span: null,
          },
          {
            key: 'billing', title: 'Example billing', slot: 4, ticketIds: [], ticketCountByStatus: ticketCountByStatusOf({}), tokens: 0, span: null,
          },
        ],
        readyTickets: (fields.readyTicketIds ?? []).map((id) => ({ id, isHeld: false })),
        drafts:       fields.filingDrafts ?? [exampleFilingDraft({ id: 'D7' })],
      },
      tickets,
    },
    mergeQueue: {
      queuedTicketIds: fields.queuedTicketIds ?? [],
      targets:         [{
        target:          'main',
        holder:          null,
        order:           [],
        waitingForMerge: (fields.waitingForAcceptTicketIds ?? []).map((ticketId) => ({
          ticketId, priority: 'normal', againstTarget: 'clean', conflictedFiles: [],
        })),
        pairwiseConflicts:      [],
        targetMovedDecisionIds: [],
      }],
    },
  });
}
