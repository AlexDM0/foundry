/**
 * The Finished segment as data: the delivered and abandoned tickets the finished-work window lets through, latest closed first, each with
 * its outcome, epic and when it landed, and how many earlier ones the window hides behind "show all". A search looks through every
 * finished ticket, the window aside, as the window only keeps the history short.
 */
import type { BoardDocument }                               from '../../../@types/board/BoardDocument.ts';
import type { BoardTicketDocument }                         from '../../../@types/board/BoardTicketDocuments.ts';
import { TicketRowFactsUtil, type RowEpic, type RowMoment } from '../../shared/tickets/TicketRowFactsUtil.ts';
import { FinishedWorkUtil }                                 from '../../utils/FinishedWorkUtil.ts';
import { SearchMatchUtil }                                  from '../../utils/SearchMatchUtil.ts';
import { TicketsModel }                                     from './TicketsModel.ts';

export interface FinishedTicketRowModel {
  readonly ticketId:     string;
  readonly idText:       string;
  readonly title:        string;
  readonly outcome:      'delivered' | 'abandoned';
  readonly outcomeLabel: string;
  readonly epic:         RowEpic | null;
  /** "today 13:05", "11-24 16:20"; `null` for a ticket that cannot be dated. */
  readonly landedText:   string | null;
}

export interface FinishedTicketsModel {
  readonly rows:         readonly FinishedTicketRowModel[];
  /** The finished tickets the window hides; zero while a search shows every one. */
  readonly earlierCount: number;
  /** Every finished ticket: the segment's count. */
  readonly count:        number;
}

function closingStampOf(ticket: BoardTicketDocument): string {
  return (ticket.status === 'delivered' ? ticket.delivered : ticket.abandonedAt) ?? ticket.updated;
}

function rowOf(ticket: BoardTicketDocument, board: BoardDocument, moment: RowMoment): FinishedTicketRowModel {
  const outcome = ticket.status === 'abandoned' ? 'abandoned' : 'delivered';
  return {
    ticketId:     ticket.id,
    idText:       `#${ticket.id}`,
    title:        ticket.title,
    outcome,
    outcomeLabel: outcome === 'abandoned' ? 'Abandoned' : 'Done',
    epic:         TicketRowFactsUtil.primaryEpicOf(ticket, board.page.facts.epics),
    landedText:   TicketRowFactsUtil.dayStampTextOf(closingStampOf(ticket), moment),
  };
}

function finishedTicketsModelOf(board: BoardDocument, moment: RowMoment, cutoffEpochMilliseconds: number, searchText: string): FinishedTicketsModel {
  const searches = SearchMatchUtil.normalisedQueryOf(searchText) !== '';
  const { shown, hiddenCount } = FinishedWorkUtil.finishedTicketsOf(board.page.tickets, searches ? Number.NEGATIVE_INFINITY : cutoffEpochMilliseconds);
  const rows = shown.map((ticket) => rowOf(ticket, board, moment));
  return {
    rows:         rows.filter((row) => TicketsModel.rowMatches({ idText: row.idText, words: [row.title, row.epic?.title ?? '', row.outcomeLabel] }, searchText)),
    earlierCount: hiddenCount,
    count:        shown.length + hiddenCount,
  };
}

export const FinishedTicketsModelUtil = Object.freeze({ finishedTicketsModelOf });
