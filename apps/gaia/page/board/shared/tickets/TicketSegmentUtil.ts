/**
 * The three segments a ticket stands in by its status: In draft (being written, for User's review), Active (committed up to merged) and
 * Finished (delivered or abandoned), each with the label it shows.
 */
import type { BoardDocument }       from '../../../@types/board/BoardDocument.ts';
import type { BoardTicketDocument } from '../../../@types/board/BoardTicketDocuments.ts';
import type { BoardTicketStatus }   from '../../../@types/board/BoardVocabulary.ts';

export const TICKET_SEGMENTS = ['in-draft', 'active', 'finished'] as const;

export type TicketSegment = typeof TICKET_SEGMENTS[number];

export const TICKET_SEGMENT_LABELS: Readonly<Record<TicketSegment, string>> = {
  'in-draft': 'In draft',
  'active':   'Active',
  'finished': 'Finished',
};

const SEGMENT_OF_STATUS: Readonly<Record<BoardTicketStatus, TicketSegment>> = {
  'draft':            'in-draft',
  'ready-for-review': 'in-draft',
  'committed':        'active',
  'in-progress':      'active',
  'in-review':        'active',
  'reviewed':         'active',
  'delivered':        'finished',
  'abandoned':        'finished',
};

function segmentOfStatus(status: BoardTicketStatus): TicketSegment {
  return SEGMENT_OF_STATUS[status];
}

function ticketsInSegment(board: Pick<BoardDocument, 'page'>, segment: TicketSegment): BoardTicketDocument[] {
  return board.page.tickets.filter((ticket) => segmentOfStatus(ticket.status) === segment);
}

export const TicketSegmentUtil = Object.freeze({ segmentOfStatus, ticketsInSegment });
