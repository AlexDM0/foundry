/** The delivered and abandoned tickets the finished-work choice lets through, latest closed first, under the Progress chart. */
import type { PageTicketDocument }                   from '../../@types/BoardStateDocument.ts';
import { DetailRoute }                               from '../../shell/DetailRoute.ts';
import { HashRouter }                                from '../../shell/HashRouter.ts';
import { FinishedWorkUtil, type FinishedWorkChoice } from '../../utils/FinishedWorkUtil.ts';

export interface FinishedWorkViewProps {
  readonly tickets:              readonly PageTicketDocument[];
  readonly choice:               FinishedWorkChoice;
  readonly nowEpochMilliseconds: number;
}

export function FinishedWorkView({ tickets, choice, nowEpochMilliseconds }: FinishedWorkViewProps) {
  const { shown } = FinishedWorkUtil.finishedTicketsOf(tickets, FinishedWorkUtil.cutoffEpochMillisecondsOf(choice, nowEpochMilliseconds));
  return (
    <section className="bridge-finished" aria-label="Finished work">
      {shown.length === 0
        ? <p className="bridge-empty">{`No ticket finished ${FinishedWorkUtil.windowPhraseOf(choice)}.`}</p>
        : (
          <ul className="bridge-finished-list">
            {shown.map((ticket) => (
              <li key={ticket.id} className="bridge-finished-ticket" data-state={ticket.status}>
                <a href={HashRouter.fragmentOf({ tab: 'progress', item: DetailRoute.itemTextOf({ form: 'ticket-row', ticketId: ticket.id }) })}>{`#${ticket.id}`}</a>
                {` ${ticket.title}`}
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
