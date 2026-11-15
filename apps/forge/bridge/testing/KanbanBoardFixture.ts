/** Small synthetic `BoardState`s holding exactly what the Kanban reads, for its view-model specs and its DOM spec. */
import type { KanbanBoardState, KanbanTaskDocument, KanbanTicketDocument } from '../@types/KanbanBoardState.ts';
import { TimeUtil }                                                        from '../utils/TimeUtil.ts';
import type { KanbanSurroundings }                                         from '../views/kanban/KanbanModel.ts';
import { EXAMPLE_PAGE_LIMITS }                                             from './TimestampSlicesFixture.ts';

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

export function exampleTicket(id: string, fields: Partial<KanbanTicketDocument> = {}): KanbanTicketDocument {
  return {
    id,
    title:       `Example ticket ${id}`,
    type:        'ticket',
    status:      'pending',
    filed:       EXAMPLE_FILED_STAMP,
    updated:     EXAMPLE_FILED_STAMP,
    started:     null,
    finished:    null,
    delivered:   null,
    abandonedAt: null,
    ...fields,
  };
}

/** A ticket's own row; `tokens` gives it a token count and the rest its stamps. */
export type ExampleOwnRow = Partial<KanbanTaskDocument> & { readonly countsAsReviewed?: boolean };

export interface ExampleBoardFields {
  readonly tickets:                    readonly KanbanTicketDocument[];
  readonly readyTicketIds?:            readonly string[];
  readonly queuedTicketIds?:           readonly string[];
  /** The tickets waiting for User's merge accept, one target's `waitingForMerge`. */
  readonly waitingForAcceptTicketIds?: readonly string[];
  /** The board's open filing drafts; one waiting draft, D7, when not given. */
  readonly filingDrafts?:              KanbanBoardState['page']['payload']['boardFacts']['drafts'];
  readonly waitingOn?:                 Readonly<Record<string, readonly string[]>>;
  readonly tokensById?:                Readonly<Record<string, number>>;
  /** Rows beside the tokens' rows: a ticket named here gets an own row with these fields. */
  readonly ownRowsById?:               Readonly<Record<string, ExampleOwnRow>>;
  /** Review rows, each of the ticket it reviews, oldest first. */
  readonly reviewRowsById?:            Readonly<Record<string, readonly Partial<KanbanTaskDocument>[]>>;
  /** The display state the Board answers, where it differs from the ticket's status. */
  readonly displayStateById?:          Readonly<Record<string, KanbanBoardState['page']['payload']['boardFacts']['tickets'][number]['displayState']>>;
  /** The open decisions, in the board's order; none when not given. */
  readonly decisions?:                 KanbanBoardState['decisions'];
}

const EMPTY_ROW: KanbanTaskDocument = { start: null, end: null };

export function exampleBoard(fields: ExampleBoardFields): KanbanBoardState {
  const ownRowIds = [...new Set([...Object.keys(fields.tokensById ?? {}), ...Object.keys(fields.ownRowsById ?? {})])];
  const ownRows = ownRowIds.map((ticketId) => {
    const tokens = fields.tokensById?.[ticketId];
    const { countsAsReviewed = false, ...row } = fields.ownRowsById?.[ticketId] ?? {};
    return { task: { ...EMPTY_ROW, ...tokens === undefined ? {} : { tokens }, ...row }, countsAsReviewed };
  });
  const reviewRows = Object.entries(fields.reviewRowsById ?? {})
    .flatMap(([ticketId, rows]) => rows.map((row) => ({ ticketId, task: { ...EMPTY_ROW, ...row } })));
  const tasks = [...ownRows.map((row) => row.task), ...reviewRows.map((row) => row.task)];
  return {
    decisions: fields.decisions ?? [],
    page:      {
      tickets: fields.tickets,
      payload: {
        concurrency: { limit: 4 },
        limits:      EXAMPLE_PAGE_LIMITS,
        progress:    { tasks },
        boardFacts:  {
          rows:    [...ownRows.map((row) => ({ deliveredRowCountsAsReviewed: row.countsAsReviewed })), ...reviewRows.map(() => ({ deliveredRowCountsAsReviewed: false }))],
          tickets: fields.tickets.map((ticket) => {
            const position = ownRowIds.indexOf(ticket.id);
            return {
              ticketId:           ticket.id,
              ownRowPosition:     position === -1 ? null : position,
              reviewBarPositions: reviewRows.flatMap((row, index) => (row.ticketId === ticket.id ? [ownRows.length + index] : [])),
              displayState:       fields.displayStateById?.[ticket.id] ?? ticket.status,
              waitingOnTicketIds: fields.waitingOn?.[ticket.id] ?? [],
            };
          }),
          epics:        [{ key: 'checkout', title: 'Example checkout', slot: 2 }, { key: 'billing', title: 'Example billing', slot: 4 }],
          readyTickets: (fields.readyTicketIds ?? []).map((id) => ({ id })),
          drafts:       fields.filingDrafts ?? [{
            id: 'D7', title: 'Example filing draft', state: 'waiting', openQuestionCount: 2
          }],
        },
      },
    },
    mergeQueue: { queuedTicketIds: fields.queuedTicketIds ?? [], targets: [{ waitingForMerge: (fields.waitingForAcceptTicketIds ?? []).map((ticketId) => ({ ticketId })) }] },
  };
}
