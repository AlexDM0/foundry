/**
 * The record allocation of a transaction a spec builds by hand: tickets get the next free id under the fixture tickets folder, and nothing
 * is refused, so no spec writes its own.
 */
import type { Ticket }                                        from '../lib/tracker-model/@types/Ticket.ts';
import type { Board }                                         from '../lib/tracker-model/Board.ts';
import { FIRST_TICKET_NUMBER }                                from '../lib/tracker-model/constants/TicketFields.ts';
import { TicketIdUtil }                                       from '../lib/tracker-model/utils/TicketIdUtil.ts';
import type { CreateTicketInput, UnreadableRecords }          from '../services/tracker/@types/BoardRecords.ts';
import type { RecordAllocation }                              from '../services/tracker/BoardTransaction.ts';
import { slugFromTitle }                                      from '../services/tracker/SlugFromTitle.ts';
import { FIXTURE_EPICS_DIRECTORY, FIXTURE_TICKETS_DIRECTORY } from './BoardFixtures.ts';

const FIXTURE_TRACKER_DIRECTORY = '/example-agency/storefront/.agent-progress';

export const NO_UNREADABLE_RECORDS: UnreadableRecords = { tickets: [], epics: [], drafts: [] };

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
    body:     input.bodyFor(identifier),
    filePath: `${FIXTURE_TICKETS_DIRECTORY}/${identifier}-${slugFromTitle(input.title)}.md`,
  };
}

export function createFixtureRecordAllocation(board: Board): RecordAllocation {
  return {
    newTicket:             (input) => fixtureTicketOf(board, input),
    newEpicLocation:       (epicKey) => `${FIXTURE_EPICS_DIRECTORY}/${epicKey}.md`,
    requireDraftKeyIsFree: () => undefined,
    locationOf:            (reference) => `${FIXTURE_TRACKER_DIRECTORY}/${reference.record}`,
  };
}
