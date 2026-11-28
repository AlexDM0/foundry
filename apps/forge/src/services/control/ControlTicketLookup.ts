/**
 * A command's ticket reference resolved inside the hold: `3`, `003` and `#3` name one ticket. A reference with no ticket is refused, while
 * a file of that id that will not parse is unrepaired, a hand edit the tool will not repair; both leave as wordless details.
 */
import { TicketIdUtil }                from '../../domain/tracker-model/utils/TicketIdUtil.ts';
import { OperationRefusal }            from '../../shared/OperationRefusal.ts';
import type { UnreadableTicketRecord } from '../tracker/@types/BoardRecords.ts';
import type { BoardTransaction }       from '../tracker/BoardTransaction.ts';

function unreadableTicketNamedBy(change: Pick<BoardTransaction, 'unreadableRecords'>, reference: string): UnreadableTicketRecord | undefined {
  const identifier = TicketIdUtil.parseTicketReference(reference);
  if (identifier === null) return undefined;
  return change.unreadableRecords.tickets.find(({ key }) => key === identifier);
}

export function ticketIdOfReference(change: Pick<BoardTransaction, 'board' | 'unreadableRecords'>, reference: string): string {
  const ticket = change.board.ticketByReference(reference);
  if (ticket !== undefined) return ticket.frontmatter.id;
  const unreadable = unreadableTicketNamedBy(change, reference);
  if (unreadable !== undefined) {
    throw new OperationRefusal('unrepaired', {
      kind: 'malformed-ticket-file', filePath: unreadable.location, line: unreadable.line, problem: unreadable.problem
    });
  }
  throw new OperationRefusal('refused', { kind: 'no-readable-ticket', reference });
}
