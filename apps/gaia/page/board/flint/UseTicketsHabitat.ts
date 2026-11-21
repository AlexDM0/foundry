/**
 * Makes a view of the board's tickets, the Tickets table or the Kanban, the tickets habitat of Flint: it cues the changes of the tickets,
 * and chases a new bug from the row or card of the delivered ticket that let it out, which both views mark with `data-ticket-id`.
 */
import type { RefObject } from 'react';

import { TICKETS_SPRITE_HABITAT }              from './TicketsSpriteHabitat.ts';
import { TicketsSpriteModel, type CuedTicket } from './TicketsSpriteModel.ts';
import { useHabitatHappenings }                from './UseHabitatHappenings.ts';

const TICKET_ID_ATTRIBUTE = 'data-ticket-id';

function ticketElementOf(viewElement: HTMLElement, ticketId: string): Element | null {
  return [...viewElement.querySelectorAll(`[${TICKET_ID_ATTRIBUTE}]`)].find((element) => element.getAttribute(TICKET_ID_ATTRIBUTE) === ticketId) ?? null;
}

/** `tickets` is the board's own list, the same array while the board is the same. */
export function useTicketsHabitat(viewElement: RefObject<HTMLElement | null>, tickets: readonly CuedTicket[]): void {
  useHabitatHappenings({
    viewElement,
    habitat:           TICKETS_SPRITE_HABITAT,
    facts:             tickets,
    happeningsBetween: TicketsSpriteModel.happeningsBetween,
    elementOf:         ticketElementOf,
  });
}
