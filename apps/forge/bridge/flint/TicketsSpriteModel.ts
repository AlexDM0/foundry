/**
 * What the tickets habitat answers between two payloads (`09-bridge-wiring.md`, "New habitats", `tickets`): each row of the table once,
 * in its order. A ticket that appears is filed; one a review found is jarred instead, and a bug that names the delivered ticket that let
 * it out is chased from that ticket's row or card instead of both, so each new ticket shows one thing. A priority that is absent is
 * `normal`. Every other row is a change of a ticket the previous payload had.
 */
import { TICKETS_CUES }                             from './TicketsSpriteHabitat.ts';
import type { ElementHappening, HabitatHappenings } from './UseHabitatHappenings.ts';

/** The fields of a page ticket the habitat reads; the Tickets view's and the Kanban's tickets satisfy it unchanged. */
export interface CuedTicket {
  readonly id:             string;
  readonly status:         string;
  readonly priority?:      string;
  readonly hold?:          string;
  readonly dependsOn?:     readonly string[];
  readonly foundInReview?: string;
  readonly introducedBy?:  string;
}

const ABSENT_PRIORITY = 'normal';

type TicketChange = (previous: CuedTicket, next: CuedTicket) => boolean;

const becameStatus = (toStatus: string, fromStatus: string | null = null): TicketChange => (previous, next) => (
  next.status === toStatus && previous.status !== toStatus && (fromStatus === null || previous.status === fromStatus)
);
const priorityChanged: TicketChange = (previous, next) => (previous.priority ?? ABSENT_PRIORITY) !== (next.priority ?? ABSENT_PRIORITY);
const dependencyAdded: TicketChange = (previous, next) => (next.dependsOn ?? []).some((ticketId) => !(previous.dependsOn ?? []).includes(ticketId));
const holdWasSet: TicketChange = (previous, next) => previous.hold === undefined && next.hold !== undefined;

function happeningsBetween(previous: readonly CuedTicket[], next: readonly CuedTicket[]): HabitatHappenings {
  const previousById = new Map(previous.map((ticket) => [ticket.id, ticket]));
  const appeared = next.filter((ticket) => !previousById.has(ticket.id));
  const changed = (change: TicketChange): boolean => next.some((ticket) => {
    const before = previousById.get(ticket.id);
    return before !== undefined && change(before, ticket);
  });
  const happenings: readonly (readonly [string, boolean])[] = [
    [TICKETS_CUES.DRAFT_READIED, changed(becameStatus('pending', 'draft'))],
    [TICKETS_CUES.TICKET_FILED, appeared.some((ticket) => ticket.foundInReview === undefined && ticket.introducedBy === undefined)],
    [TICKETS_CUES.PRIORITY_CHANGED, changed(priorityChanged)],
    [TICKETS_CUES.DEPENDENCY_ADDED, changed(dependencyAdded)],
    [TICKETS_CUES.TICKET_HELD, changed(holdWasSet)],
    [TICKETS_CUES.TICKET_DELIVERED, changed(becameStatus('delivered'))],
    [TICKETS_CUES.REVIEW_FILED_A_TICKET, appeared.some((ticket) => ticket.foundInReview !== undefined && ticket.introducedBy === undefined)],
  ];
  const elementHappenings = appeared.flatMap((ticket): ElementHappening[] => (ticket.introducedBy === undefined
    ? []
    : [{ intent: 'chase-bug', elementKey: ticket.introducedBy, fallbackCue: TICKETS_CUES.BUG_SOURCE_IS_NOT_SHOWN }]));
  return { cueNames: happenings.flatMap(([cueName, happened]) => (happened ? [cueName] : [])), elementHappenings };
}

export const TicketsSpriteModel = Object.freeze({ happeningsBetween });
