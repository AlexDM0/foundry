/**
 * The Tickets view's segments: the segment a route item names, the segment the view opens on, and the search each segment narrows its rows
 * by: a digits query looks for an id alone, any other for the words of a row.
 */
import type { BoardTicketDocument }            from '../../../@types/board/BoardTicketDocuments.ts';
import type { CuedTicket }                     from '../../flint/TicketsSpriteModel.ts';
import { TICKET_SEGMENTS, type TicketSegment } from '../../shared/tickets/TicketSegmentUtil.ts';
import { SearchMatchUtil }                     from '../../utils/SearchMatchUtil.ts';

export const [DEFAULT_TICKET_SEGMENT] = TICKET_SEGMENTS;

/** The board's preference holding the segment this viewer chose last. */
export const TICKET_SEGMENT_CHOICE_NAME = 'tickets-segment';

/** A query of digits, with or without its `#`, looks for a ticket id and nothing else, so "12" does not match every title naming a twelve. */
const TICKET_ID_QUERY_PATTERN = /^#?\d+$/;

/** What a row is searched by: its id as shown, and the words it shows. */
export interface SearchableRow {
  readonly idText: string;
  readonly words:  readonly string[];
}

function isTicketSegment(text: string | null): text is TicketSegment {
  return (TICKET_SEGMENTS as readonly (string | null)[]).includes(text);
}

/** The segment `tickets/<segment>` names, so a link can open Tickets on one; `null` for any other item, such as a detail. */
function segmentOfRouteItem(routeItem: string | null): TicketSegment | null {
  return isTicketSegment(routeItem) ? routeItem : null;
}

/** The segment a route names first; else In draft while something there waits on User; else the one this viewer chose last; else In draft. */
function openingSegmentOf(routedSegment: TicketSegment | null, inDraftWaitsOnUser: boolean, storedSegment: string | null): TicketSegment {
  if (routedSegment !== null) return routedSegment;
  if (inDraftWaitsOnUser) return 'in-draft';
  return isTicketSegment(storedSegment) ? storedSegment : DEFAULT_TICKET_SEGMENT;
}

function rowMatches(row: SearchableRow, searchText: string): boolean {
  const query = SearchMatchUtil.normalisedQueryOf(searchText);
  if (query === '') return true;
  if (TICKET_ID_QUERY_PATTERN.test(query)) return row.idText.replace(/^#/, '').includes(query.replace(/^#/, ''));
  return row.words.some((word) => word.toLowerCase().includes(query));
}

/** The tickets as Flint's tickets habitat reads them, each with the priority the forge resolved and the review or ticket that filed it. */
function cuedTicketsOf(tickets: readonly BoardTicketDocument[]): CuedTicket[] {
  return tickets.map((ticket) => ({
    id:               ticket.id,
    status:           ticket.status,
    resolvedPriority: ticket.facts.resolvedPriority,
    hold:             ticket.hold,
    dependsOn:        ticket.dependsOn,
    foundInReview:    ticket.foundInReview,
    introducedBy:     ticket.introducedBy,
  }));
}

export const TicketsModel = Object.freeze({
  cuedTicketsOf,
  segmentOfRouteItem,
  openingSegmentOf,
  rowMatches,
});
