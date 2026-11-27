import type { Ticket }           from '../../../src/domain/tracker-model/@types/Ticket.ts';
import { TicketIdUtil }          from '../../../src/domain/tracker-model/utils/TicketIdUtil.ts';
import type { UnreadableRecord } from '../../../src/services/tracker/@types/BoardRecords.ts';
import type { BoardTransaction } from '../../../src/services/tracker/BoardTransaction.ts';
import { OperationRefusal }      from '../../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }         from '../../../src/shared/constants/ProductNames.ts';
import { OutputUtil }            from '../../utils/OutputUtil.ts';

function unreadableTicketOf(unreadableTickets: readonly UnreadableRecord[], reference: string): UnreadableRecord | undefined {
  const identifier = TicketIdUtil.parseTicketReference(reference);
  if (identifier === null) return undefined;
  return unreadableTickets.find(({ record, key }) => record === 'ticket' && key === identifier);
}

/** A ticket file that is there and will not parse is exit 2: the tool will not repair a hand edit, and a missing ticket is the caller's to fix. */
function refuseAMissingTicket(reference: string, unreadableTickets: readonly UnreadableRecord[]): never {
  const unreadable = unreadableTicketOf(unreadableTickets, reference);
  if (unreadable !== undefined) throw new OperationRefusal('unrepaired', OutputUtil.ignoredTicketFileText(unreadable));
  throw new OperationRefusal(
    'refused',
    `There is no readable ticket ${reference}. Run \`${PRODUCT_NAMES.PROGRAM} ticket list\` to see what this tracker holds; `
    + 'a file that will not parse is reported there as malformed.',
  );
}

function requireTicket(change: Pick<BoardTransaction, 'board' | 'unreadableRecords'>, reference: string): Ticket {
  return change.board.ticketByReference(reference) ?? refuseAMissingTicket(reference, change.unreadableRecords.tickets);
}

export const TicketLookupUtil = { requireTicket, refuseAMissingTicket } as const;
