/**
 * The delivered and abandoned tickets the finished-work choice lets through, latest closed first, in a card under the Progress chart. Each
 * line is drawn as a chart row is, its id, title and state badge, and opens its ticket's row detail in place.
 */
import type { DisplayState }                         from '../../../src/lib/tracker-model/@types/Task.ts';
import type { PageTicketDocument }                   from '../../@types/BoardStateDocument.ts';
import { TicketIdMark }                              from '../../chips/TicketMarks.tsx';
import { StateBadge }                                from '../../design-system/StateBadge.tsx';
import { useDetailRouting }                          from '../../shell/DetailRouting.ts';
import { DisplayStateWordingUtil }                   from '../../utils/DisplayStateWordingUtil.ts';
import { FinishedWorkUtil, type FinishedWorkChoice } from '../../utils/FinishedWorkUtil.ts';

export interface FinishedWorkViewProps {
  readonly tickets:              readonly PageTicketDocument[];
  readonly choice:               FinishedWorkChoice;
  readonly nowEpochMilliseconds: number;
}

const ABANDONED_STATE: DisplayState = 'abandoned';
const DELIVERED_STATE: DisplayState = 'delivered';

function FinishedTicketLine({ ticket }: { readonly ticket: PageTicketDocument }) {
  const routing = useDetailRouting();
  const detailItem = { form: 'ticket-row', ticketId: ticket.id } as const;
  const state = ticket.status === ABANDONED_STATE ? ABANDONED_STATE : DELIVERED_STATE;
  return (
    <li className="bridge-finished-ticket" data-state={state} data-selected={routing.isOpen(detailItem) ? '' : undefined}>
      <a className="bridge-finished-link" href={routing.openerHrefOf(detailItem)}>
        <TicketIdMark ticketId={ticket.id} />
        <span className="bridge-finished-name" title={ticket.title}>{ticket.title}</span>
        <StateBadge state={state} label={DisplayStateWordingUtil.labelOf(state)} />
      </a>
    </li>
  );
}

export function FinishedWorkView({ tickets, choice, nowEpochMilliseconds }: FinishedWorkViewProps) {
  const { shown } = FinishedWorkUtil.finishedTicketsOf(tickets, FinishedWorkUtil.cutoffEpochMillisecondsOf(choice, nowEpochMilliseconds));
  const windowPhrase = FinishedWorkUtil.windowPhraseOf(choice);
  return (
    <section className="bridge-finished" aria-label="Finished work">
      <div className="bridge-finished-head">
        <span className="bridge-finished-title">Finished work</span>
        <span className="bridge-finished-note">{`${shown.length} closed ${windowPhrase}`}</span>
      </div>
      {shown.length === 0
        ? <p className="bridge-finished-empty">{`No ticket finished ${windowPhrase}.`}</p>
        : (
          <ul className="bridge-finished-list">
            {shown.map((ticket) => <FinishedTicketLine key={ticket.id} ticket={ticket} />)}
          </ul>
        )}
    </section>
  );
}
