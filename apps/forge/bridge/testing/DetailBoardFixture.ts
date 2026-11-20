/** Small synthetic `BoardState`s holding exactly what the detail panel reads, for its model specs and DOM specs. */
import type { DraftSummary }     from '../../src/lib/tracker-model/@types/Draft.ts';
import type { DisplayState }     from '../../src/lib/tracker-model/@types/Task.ts';
import type {
  DetailBoardState,
  DetailIncidentDocument,
  DetailJobDocument,
  DetailLogEntry,
  DetailTaskDocument,
  DetailTicketDocument,
  DetailTicketForecastDocument
} from '../@types/DetailBoardState.ts';
import type { DetailFormat }   from '../views/detail-panel/DetailFactsModel.ts';
import { EXAMPLE_PAGE_LIMITS } from './PageLimitsFixture.ts';

export const EXAMPLE_TODAY = '2026-09-18';

export const EXAMPLE_NOW_EPOCH_MILLISECONDS = Date.parse('2026-09-18T13:36:00+02:00');

export const EXAMPLE_DETAIL_FORMAT: DetailFormat = Object.freeze({
  todayCalendarDate:    EXAMPLE_TODAY,
  nowEpochMilliseconds: EXAMPLE_NOW_EPOCH_MILLISECONDS,
  limits:               EXAMPLE_PAGE_LIMITS,
});

/** A stamp of the example day at a wall clock, `09:30`, in the story's zone. */
export function exampleStampAt(clock: string, day = EXAMPLE_TODAY): string {
  return `${day}T${clock}:00+02:00`;
}

export function exampleDetailTicket(id: string, fields: Partial<DetailTicketDocument> = {}): DetailTicketDocument {
  return {
    id,
    title:       `Example ticket ${id}`,
    type:        'ticket',
    status:      'committed',
    task:        null,
    filed:       exampleStampAt('09:00'),
    updated:     exampleStampAt('09:00'),
    started:     null,
    finished:    null,
    delivered:   null,
    abandonedAt: null,
    bodyHtml:    `<p>Body of example ticket ${id}.</p>`,
    ...fields,
  };
}

export function exampleDetailRow(id: number, fields: Partial<DetailTaskDocument> = {}): DetailTaskDocument {
  return {
    id,
    name:   `Example row ${String(id)}`,
    status: 'committed',
    start:  null,
    end:    null,
    owner:  '',
    note:   '',
    ticket: null,
    tokens: null,
    ...fields,
  };
}

/** A running build job on the ticket, attempt 1, with no call made yet against a budget of 150. */
export function exampleDetailJob(id: string, ticketId: string, fields: Partial<DetailJobDocument> = {}): DetailJobDocument {
  return {
    id,
    kind:      'build',
    role:      'builder',
    ticketIds: [ticketId],
    state:     'running',
    attempt:   1,
    live:      { calls: 0, callBudget: 150, lastToolCall: null },
    ...fields,
  };
}

/** An open incident on the ticket, waiting to take its default `gate-retry`. */
export function exampleDetailIncident(id: string, ticketId: string, fields: Partial<DetailIncidentDocument> = {}): DetailIncidentDocument {
  return {
    id, kind: 'sandbox-unavailable', ticketIds: [ticketId], defaultMove: 'gate-retry', ...fields
  };
}

/** A committed ticket's forecast: a builder takes it, Customs and the gate, a review, then it lands on main; nothing waits on it. */
export function exampleTicketForecast(ticketId: string, fields: Partial<DetailTicketForecastDocument> = {}): DetailTicketForecastDocument {
  return {
    ticketId,
    steps: [
      { kind: 'build', attempt: 1, jobId: null },
      { kind: 'customs-and-gates', gateNames: ['tests'], jobId: null },
      { kind: 'review', round: 1, jobId: null },
      { kind: 'land', target: 'main' },
    ],
    currentStepIndex: null,
    dependents:       [],
    ...fields,
  };
}

export interface ExampleDetailBoardFields {
  readonly tickets:          readonly DetailTicketDocument[];
  /** Every row, in board order; a ticket's own row is the one whose `ticket` names it, a review row the one whose `reviewOf` does. */
  readonly rows?:            readonly DetailTaskDocument[];
  /** The display state the Board reports for a ticket or a row (by its id), where it differs from the stored status. */
  readonly displayStates?:   Readonly<Record<string, DisplayState>>;
  readonly reviewedFirst?:   readonly number[];
  readonly waitingOn?:       Readonly<Record<string, readonly string[]>>;
  readonly log?:             readonly DetailLogEntry[];
  readonly drafts?:          readonly DraftSummary[];
  readonly draftRequests?:   readonly { readonly id: string; readonly request: string }[];
  readonly mergeQueue?:      DetailBoardState['mergeQueue'];
  /** The board's jobs, records the ticket form joins by their `ticketIds`. */
  readonly jobs?:            readonly unknown[];
  readonly ticketForecasts?: readonly DetailTicketForecastDocument[];
  readonly incidents?:       readonly DetailIncidentDocument[];
  /** A board without epics, for a spec of the whole shell, whose other views read an epic's full roll-up. */
  readonly withoutEpics?:    boolean;
}

export function exampleDetailBoard(fields: ExampleDetailBoardFields): DetailBoardState {
  const rows = fields.rows ?? [];
  const positionsOf = (matches: (row: DetailTaskDocument) => boolean): number[] => rows.flatMap((row, position) => (matches(row) ? [position] : []));
  return {
    ...(fields.mergeQueue === undefined ? {} : { mergeQueue: fields.mergeQueue }),
    ...(fields.jobs === undefined ? {} : { jobs: fields.jobs }),
    ...(fields.ticketForecasts === undefined ? {} : { ticketForecasts: fields.ticketForecasts }),
    ...(fields.incidents === undefined ? {} : { incidents: fields.incidents }),
    page: {
      tickets: fields.tickets,
      payload: {
        progress:   { tasks: rows, log: fields.log ?? [] },
        limits:     EXAMPLE_PAGE_LIMITS,
        ...(fields.draftRequests === undefined ? {} : { draftRequests: fields.draftRequests }),
        boardFacts: {
          rows: rows.map((row) => ({
            displayState:                 fields.displayStates?.[String(row.id)] ?? row.status,
            deliveredRowCountsAsReviewed: (fields.reviewedFirst ?? []).includes(row.id),
          })),
          tickets: fields.tickets.map((ticket) => ({
            ticketId:           ticket.id,
            ownRowPosition:     positionsOf((row) => row.ticket === ticket.id)[0] ?? null,
            reviewBarPositions: positionsOf((row) => row.reviewOf === ticket.id),
            displayState:       fields.displayStates?.[ticket.id] ?? ticket.status,
            waitingOnTicketIds: fields.waitingOn?.[ticket.id] ?? [],
          })),
          epics:  fields.withoutEpics === true ? [] : [{ key: 'billing', title: 'Example billing', slot: 4 }, { key: 'checkout', title: 'Example checkout', slot: 2 }],
          drafts: fields.drafts ?? [],
        },
      },
    },
  };
}
