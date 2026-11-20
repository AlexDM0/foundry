import type { TicketStatus } from '../@types/Ticket.ts';

/**
 * Read as "to reach the key, the ticket has to be in one of these"; no row holds its own key, so a move to the current
 * status is never legal. A repeat review pass is the one move deliberately outside this table. Filing and `ticket unready` are
 * the only ways into `draft`, and the filer's close the only way into `ready-for-review`.
 */
export const LEGAL_SOURCE_STATUSES_FOR_TICKET_STATUS: Record<TicketStatus, readonly TicketStatus[]> = {
  'draft':            [],
  'ready-for-review': ['draft'],
  'committed':        ['draft', 'ready-for-review', 'in-progress', 'in-review', 'reviewed', 'delivered', 'abandoned'],
  'in-progress':      ['committed', 'in-review'],
  'in-review':        ['in-progress'],
  'reviewed':         ['in-progress', 'in-review'],
  'delivered':        ['reviewed'],
  'abandoned':        ['draft', 'ready-for-review', 'committed', 'in-progress', 'in-review', 'reviewed'],
};
