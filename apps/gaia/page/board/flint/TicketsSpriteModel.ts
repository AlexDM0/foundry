/**
 * What the tickets habitat answers between two payloads (`docs/design/board.md`, "Flint's habitats on the board views", `tickets`): each row of the table
 * once, in its order. A ticket that appears is filed; one a review found is jarred instead, and a bug that names the delivered ticket that let it out is
 * chased from that ticket's row or card instead of both, so each new ticket shows one thing. The priority is the one the forge resolved, so Gaia applies
 * no default of its own. Every other row is a change of a ticket the previous payload had.
 */
import { TICKETS_CUES }                             from './TicketsSpriteHabitat.ts';
import type { ElementHappening, HabitatHappenings } from './UseHabitatHappenings.ts';

/** The fields of a page ticket the habitat reads; an absent or `null` hold, finding review or bug source is none. */
export interface CuedTicket {
  readonly id:               string;
  readonly status:           string;
  /** The ticket's served `facts.resolvedPriority`, the priority it runs at. */
  readonly resolvedPriority: string;
  readonly hold?:            string | null;
  readonly dependsOn?:       readonly string[];
  readonly foundInReview?:   string | null;
  readonly introducedBy?:    string | null;
}

const isSet = (value: string | null | undefined): value is string => typeof value === 'string';

type TicketChange = (previous: CuedTicket, next: CuedTicket) => boolean;

const becameStatus = (toStatus: string, fromStatus: string | null = null): TicketChange => (previous, next) => (
  next.status === toStatus && previous.status !== toStatus && (fromStatus === null || previous.status === fromStatus)
);
const priorityChanged: TicketChange = (previous, next) => previous.resolvedPriority !== next.resolvedPriority;
const dependencyAdded: TicketChange = (previous, next) => (next.dependsOn ?? []).some((ticketId) => !(previous.dependsOn ?? []).includes(ticketId));
const holdWasSet: TicketChange = (previous, next) => !isSet(previous.hold) && isSet(next.hold);

function happeningsBetween(previous: readonly CuedTicket[], next: readonly CuedTicket[]): HabitatHappenings {
  const previousById = new Map(previous.map((ticket) => [ticket.id, ticket]));
  const appeared = next.filter((ticket) => !previousById.has(ticket.id));
  const changed = (change: TicketChange): boolean => next.some((ticket) => {
    const before = previousById.get(ticket.id);
    return before !== undefined && change(before, ticket);
  });
  const happenings: readonly (readonly [string, boolean])[] = [
    [TICKETS_CUES.DRAFT_READIED, changed(becameStatus('committed', 'draft'))],
    [TICKETS_CUES.TICKET_FILED, appeared.some((ticket) => !isSet(ticket.foundInReview) && !isSet(ticket.introducedBy))],
    [TICKETS_CUES.PRIORITY_CHANGED, changed(priorityChanged)],
    [TICKETS_CUES.DEPENDENCY_ADDED, changed(dependencyAdded)],
    [TICKETS_CUES.TICKET_HELD, changed(holdWasSet)],
    [TICKETS_CUES.TICKET_DELIVERED, changed(becameStatus('delivered'))],
    [TICKETS_CUES.REVIEW_FILED_A_TICKET, appeared.some((ticket) => isSet(ticket.foundInReview) && !isSet(ticket.introducedBy))],
  ];
  const elementHappenings = appeared.flatMap((ticket): ElementHappening[] => (!isSet(ticket.introducedBy)
    ? []
    : [{ intent: 'chase-bug', elementKey: ticket.introducedBy, fallbackCue: TICKETS_CUES.BUG_SOURCE_IS_NOT_SHOWN }]));
  return { cueNames: happenings.flatMap(([cueName, happened]) => (happened ? [cueName] : [])), elementHappenings };
}

export const TicketsSpriteModel = Object.freeze({ happeningsBetween });
