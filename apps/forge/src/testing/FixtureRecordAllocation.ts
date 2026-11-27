/**
 * The record allocation of a transaction a spec builds by hand: tickets get the next free id, and nothing is refused, so no spec writes its
 * own.
 */
import type { Ticket }                               from '../domain/tracker-model/@types/Ticket.ts';
import type { Board }                                from '../domain/tracker-model/Board.ts';
import { FIRST_TICKET_NUMBER }                       from '../domain/tracker-model/constants/TicketFields.ts';
import { TicketIdUtil }                              from '../domain/tracker-model/utils/TicketIdUtil.ts';
import type { CreateTicketInput, UnreadableRecords } from '../services/tracker/@types/BoardRecords.ts';
import type { RecordAllocation }                     from '../services/tracker/BoardTransaction.ts';

const FIXTURE_TRACKER_DIRECTORY = '/example-agency/storefront/.agent-progress';

export const NO_UNREADABLE_RECORDS: UnreadableRecords = {
  tickets: [], epics: [], drafts: [], ticketDocuments: []
};

/** A hand-built hold of the local allocation that listed no ticket file. */
export const NO_LISTED_TICKET_LOCATIONS: ReadonlyMap<string, string> = new Map();

function nextFreeTicketNumberOf(board: Board): number {
  const spentNumbers = [
    ...board.tickets().map((ticket) => Number(ticket.frontmatter.id)),
    ...board.logRecordsSoFar().flatMap((record) => (record.kind === 'ticket-filed' ? [Number(record.ticketId)] : [])),
  ];
  return Math.max(FIRST_TICKET_NUMBER - 1, ...spentNumbers) + 1;
}

function fixtureTicketOf(board: Board, input: CreateTicketInput): Ticket {
  const identifier = TicketIdUtil.padTicketId(nextFreeTicketNumberOf(board));
  return {
    frontmatter: {
      id:          identifier,
      title:       input.title,
      type:        input.type,
      ...(input.priority === undefined ? {} : { priority: input.priority }),
      status:      'draft',
      filed:       input.at,
      updated:     input.at,
      started:     null,
      finished:    null,
      delivered:   null,
      abandonedAt: null,
      ...(input.group === undefined ? {} : { group: input.group }),
      task:        null,
      extra:       [],
    },
    body: input.bodyFor(identifier),
  };
}

export function createFixtureRecordAllocation(board: Board): RecordAllocation {
  return {
    newTicket:             (input) => fixtureTicketOf(board, input),
    requireEpicKeyIsFree:  () => undefined,
    requireDraftKeyIsFree: () => undefined,
    locationOf:            (reference) => `${FIXTURE_TRACKER_DIRECTORY}/${reference.record}`,
  };
}
