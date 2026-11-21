/**
 * What the timeline habitat answers between two payloads (Flint's board wiring design, "New habitats", `progress`): a ticket the previous
 * payload had becomes `in-progress`, and Flint lays the bar along the row of the ticket's own task, named by that task's id; with no own
 * row there is no bar to lay along, and the fallback shows at once.
 */
import type { ElementHappening, HabitatHappenings } from '../../flint/UseHabitatHappenings.ts';
import { TIMELINE_CUES }                            from './TimelineSpriteHabitat.ts';

/** The fields of the chart's board the habitat reads; the board's page satisfies it unchanged. */
export interface TimelineFacts {
  readonly tickets:     readonly { readonly id: string; readonly status: string }[];
  readonly ticketFacts: readonly { readonly ticketId: string; readonly ownRowPosition: number | null }[];
  readonly tasks:       readonly { readonly id: number }[];
}

const STARTED_STATUS = 'in-progress';

function ownTaskIdOf(facts: TimelineFacts, ticketId: string): string | null {
  const ownRowPosition = facts.ticketFacts.find((ticketFacts) => ticketFacts.ticketId === ticketId)?.ownRowPosition ?? null;
  const ownTask = ownRowPosition === null ? undefined : facts.tasks[ownRowPosition];
  return ownTask === undefined ? null : String(ownTask.id);
}

function happeningsBetween(previous: TimelineFacts, next: TimelineFacts): HabitatHappenings {
  const previousStatusById = new Map(previous.tickets.map((ticket) => [ticket.id, ticket.status]));
  const startedTicketIds = next.tickets.flatMap((ticket) => {
    const previousStatus = previousStatusById.get(ticket.id);
    return ticket.status === STARTED_STATUS && previousStatus !== undefined && previousStatus !== STARTED_STATUS ? [ticket.id] : [];
  });
  const elementHappenings = startedTicketIds.map((ticketId): ElementHappening => ({
    intent:      'lay-bar-along',
    elementKey:  ownTaskIdOf(next, ticketId),
    fallbackCue: TIMELINE_CUES.STARTED_BAR_IS_NOT_SHOWN,
  }));
  return { cueNames: [], elementHappenings };
}

export const TimelineSpriteModel = Object.freeze({ happeningsBetween });
