/**
 * Where each ticket being written stands, read from the board: the board document carries it on each ticket, and the Waiting on User
 * list of the board document and the monitor reads it to leave out a draft whose agent is still writing it.
 */
import type { DraftProgress }  from '../../lib/tracker-model/@types/DraftProgress.ts';
import type { Board }          from '../../lib/tracker-model/Board.ts';
import { DraftProgressUtil }   from '../../lib/tracker-model/utils/DraftProgressUtil.ts';
import { TicketWritingUtil }   from '../../lib/tracker-model/utils/TicketWritingUtil.ts';
import type { PageTicket }     from '../../shared/@types/PagePayload.ts';
import type { AttentionBoard } from '../../shared/monitor/AttentionEntries.ts';
import type { BoardState }     from './BoardState.ts';

export type DraftReadingBoard = Pick<Board, 'ticketDocumentRecordOf' | 'pipeline'>;

function draftProgressOf(state: Pick<BoardState, 'decisions' | 'jobs'>, board: DraftReadingBoard, ticket: PageTicket): DraftProgress | null {
  return DraftProgressUtil.progressOf({
    ticketId:  ticket.id,
    status:    ticket.status,
    updated:   ticket.updated,
    route:     TicketWritingUtil.routeOf(board.pipeline()),
    documents: board.ticketDocumentRecordOf(ticket.id)?.record ?? null,
    decisions: state.decisions,
    jobs:      state.jobs,
  });
}

/** The state as the Waiting on User list reads it, each ticket carrying where it stands while it is written. */
function attentionBoardOf(state: BoardState, board: DraftReadingBoard): AttentionBoard {
  return {
    ...state,
    page: { ...state.page, tickets: state.page.tickets.map((ticket) => ({ ...ticket, draft: draftProgressOf(state, board, ticket) })) },
  };
}

export const DraftProgressReading = Object.freeze({ draftProgressOf, attentionBoardOf });
