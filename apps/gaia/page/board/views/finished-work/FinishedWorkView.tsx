/**
 * The delivered and abandoned tickets the finished-work choice lets through, latest closed first, in a card under the Progress chart. Each
 * line is drawn as a chart row is, its id, title and state badge, and opens its ticket's row detail in place.
 */
import { StateBadge } from 'design-system/StateBadge';

import type { BoardTicketDocument }                  from '../../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState }                    from '../../../@types/board/BoardVocabulary.ts';
import { TicketIdMark }                              from '../../chips/TicketMarks.tsx';
import { useDetailRouting }                          from '../../shell/DetailRouting.ts';
import { DisplayStateWordingUtil }                   from '../../utils/DisplayStateWordingUtil.ts';
import { FinishedWorkUtil, type FinishedWorkChoice } from '../../utils/FinishedWorkUtil.ts';
import { StateToneUtil }                             from '../../utils/StateToneUtil.ts';

export interface FinishedWorkViewProps {
  readonly tickets:              readonly BoardTicketDocument[];
  readonly choice:               FinishedWorkChoice;
  readonly nowEpochMilliseconds: number;
}

const ABANDONED_STATE: BoardDisplayState = 'abandoned';
const DELIVERED_STATE: BoardDisplayState = 'delivered';

function FinishedTicketLine({ ticket }: { readonly ticket: BoardTicketDocument }) {
  const routing = useDetailRouting();
  const detailItem = { form: 'ticket-row', ticketId: ticket.id } as const;
  const state = ticket.status === ABANDONED_STATE ? ABANDONED_STATE : DELIVERED_STATE;
  return (
    <li className="board-finished-ticket" data-state={state} data-state-tone={StateToneUtil.toneOf(state)} data-selected={routing.isOpen(detailItem) ? '' : undefined}>
      <a className="board-finished-link" href={routing.openerHrefOf(detailItem)}>
        <span className="board-finished-id"><TicketIdMark ticketId={ticket.id} /></span>
        <span className="board-finished-name" title={ticket.title}>{ticket.title}</span>
        <StateBadge {...StateToneUtil.lookOf(state)} label={DisplayStateWordingUtil.labelOf(state)} />
      </a>
    </li>
  );
}

export function FinishedWorkView({ tickets, choice, nowEpochMilliseconds }: FinishedWorkViewProps) {
  const { shown } = FinishedWorkUtil.finishedTicketsOf(tickets, FinishedWorkUtil.cutoffEpochMillisecondsOf(choice, nowEpochMilliseconds));
  const windowPhrase = FinishedWorkUtil.windowPhraseOf(choice);
  return (
    <section className="board-finished" aria-label="Finished work">
      <div className="board-finished-head">
        <span className="board-finished-title">Finished work</span>
        <span className="board-finished-note">{`${shown.length} closed ${windowPhrase}`}</span>
      </div>
      {shown.length === 0
        ? <p className="board-finished-empty">{`No ticket finished ${windowPhrase}.`}</p>
        : (
          <ul className="board-finished-list">
            {shown.map((ticket) => <FinishedTicketLine key={ticket.id} ticket={ticket} />)}
          </ul>
        )}
    </section>
  );
}
