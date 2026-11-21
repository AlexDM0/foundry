/**
 * The moves the board document offers on a ticket. What matters: an offered command is one the Board accepts, and a command not offered is
 * one it refuses. For each ticket status, held and unheld, on a fixture board, every board ticket kind is applied in a fresh copy as its
 * control applies it to the Board: an offered kind is accepted, any other refused. The merge kinds run their git step in the Airlock
 * controls, past the Board; on these boards merge approval is off, which those controls refuse first, so neither is offered.
 */
import { describe, expect, test } from 'bun:test';

import type { TicketPriority, TicketStatus }             from '../../lib/tracker-model/@types/Ticket.ts';
import type { TicketOfferKind }                          from '../../lib/tracker-model/MoveOffers.ts';
import { TICKET_OFFER_KINDS }                            from '../../lib/tracker-model/MoveOffers.ts';
import { TICKET_STATUSES, TICKET_STATUSES_USER_READIES } from '../../lib/tracker-model/constants/Statuses.ts';
import { TICKET_PRIORITIES }                             from '../../lib/tracker-model/constants/TicketFields.ts';
import { ticketInStatusFixture }                         from '../../testing/BoardFixtures.ts';

const AT = '2026-11-20T10:00:00+01:00';

const HOLD = 'waiting for the designer';

type HoldState = 'unheld' | 'held';

const HOLD_STATES: readonly HoldState[] = ['unheld', 'held'];

function boardOf(status: TicketStatus, holdState: HoldState) {
  return ticketInStatusFixture(status, holdState === 'held' ? HOLD : null).board;
}

/** Each kind as its control applies it to the Board; `ticket-priority` moves to the given priority, the merge kinds refuse with approval off. */
function applyKind(status: TicketStatus, holdState: HoldState, kind: TicketOfferKind, priority: TicketPriority): boolean {
  const board = boardOf(status, holdState);
  try {
    switch (kind) {
      case 'ticket-ready':
        board.readyDraftTickets(['001'], () => [], AT, TICKET_STATUSES_USER_READIES);
        break;
      case 'ticket-hold':
        board.holdTicket('001', 'Example hold', AT);
        break;
      case 'ticket-unhold':
        board.unholdTicket('001', AT);
        break;
      case 'ticket-park':
        board.parkTicket('001', 'Example park', null, AT);
        break;
      case 'ticket-network':
        board.setTicketNetwork('001', ['registry.example.com'], AT);
        break;
      case 'ticket-priority':
        board.setTicketPriority('001', priority, AT);
        break;
      case 'ticket-deliver-by-hand':
        if (board.liveJobOfTicket('001') !== undefined) return false;
        board.moveTicket('001', 'delivered', { checksLegality: false, byHand: true }, AT);
        break;
      case 'merge-accept':
      case 'merge-update':
        return board.mergeApprovalIsOn();
    }
    return true;
  } catch {
    return false;
  }
}

function kindIsAccepted(status: TicketStatus, holdState: HoldState, kind: TicketOfferKind): boolean {
  if (kind !== 'ticket-priority') return applyKind(status, holdState, kind, 'normal');
  return TICKET_PRIORITIES.some((priority) => applyKind(status, holdState, kind, priority));
}

describe('the offered ticket moves against the Board', () => {
  for (const holdState of HOLD_STATES) {
    for (const status of TICKET_STATUSES) {
      test(`a ${holdState} ${status} ticket: each offered kind is accepted and each other refused`, () => {
        const offered = boardOf(status, holdState).ticketOffersOf('001', null).kinds;
        const accepted = TICKET_OFFER_KINDS.filter((kind) => kindIsAccepted(status, holdState, kind));
        expect(offered).toEqual(accepted);
      });
    }
  }

  test('each offered priority is accepted and each other refused', () => {
    for (const holdState of HOLD_STATES) {
      for (const status of TICKET_STATUSES) {
        const { priorityChoices } = boardOf(status, holdState).ticketOffersOf('001', null);
        const accepted = [...TICKET_PRIORITIES].reverse().filter((priority) => applyKind(status, holdState, 'ticket-priority', priority));
        expect(priorityChoices, `${holdState} ${status}`).toEqual(accepted);
      }
    }
  });
});
