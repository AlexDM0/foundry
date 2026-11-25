/**
 * The Finished segment: the history the finished-work window lets through, each row its id, title, outcome, epic and when it landed, a row
 * opening its ticket's detail in place; under it "N earlier tickets · show all", which widens the board's window to all.
 */
import { StateBadge, TextButton }                            from '../../../lib/design-system/DesignSystemInterface.ts';
import { useDetailRouting }                                  from '../../shell/DetailRouting.ts';
import { StateToneUtil }                                     from '../../utils/StateToneUtil.ts';
import type { FinishedTicketRowModel, FinishedTicketsModel } from './FinishedTicketsModel.ts';
import { RowEpicMark, SegmentEmptyLine, TicketDetailRow }    from './TicketRowParts.tsx';

function FinishedRow({ row }: { readonly row: FinishedTicketRowModel }) {
  const routing = useDetailRouting();
  return (
    <TicketDetailRow ticketId={row.ticketId}>
      <td className="board-tickets-id"><a href={routing.openerHrefOf({ form: 'ticket', ticketId: row.ticketId })}>{row.idText}</a></td>
      <td><span className="board-tickets-title" data-outcome={row.outcome}>{row.title}</span></td>
      <td><StateBadge {...StateToneUtil.lookOf(row.outcome)} label={row.outcomeLabel} palette="quiet" fitted /></td>
      <td><RowEpicMark epic={row.epic} /></td>
      <td className="board-tickets-stamp">{row.landedText}</td>
    </TicketDetailRow>
  );
}

export interface FinishedSegmentProps {
  readonly model:        FinishedTicketsModel;
  readonly searches:     boolean;
  /** "in the last day", what the window lets through, for the empty line. */
  readonly windowPhrase: string;
  readonly onShowAll:    () => void;
}

export function FinishedSegment({
  model, searches, windowPhrase, onShowAll
}: FinishedSegmentProps) {
  const emptyText = searches ? 'No finished ticket matches the search.' : `No ticket finished ${windowPhrase}.`;
  return (
    <div className="board-tickets-segment" data-segment="finished">
      <section className="board-tickets-panel" aria-label="Finished tickets">
        {model.rows.length === 0
          ? <SegmentEmptyLine text={emptyText} />
          : (
            <table className="board-tickets-table">
              <colgroup>
                <col className="board-tickets-column-id" />
                <col />
                <col className="board-tickets-column-outcome" />
                <col className="board-tickets-column-epic" />
                <col className="board-tickets-column-landed" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Id</th>
                  <th scope="col">Ticket</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Epic</th>
                  <th scope="col">Landed</th>
                </tr>
              </thead>
              <tbody>
                {model.rows.map((row) => <FinishedRow key={row.ticketId} row={row} />)}
              </tbody>
            </table>
          )}
        {model.earlierCount === 0
          ? null
          : (
            <p className="board-tickets-earlier">
              {`${model.earlierCount} earlier ${model.earlierCount === 1 ? 'ticket' : 'tickets'} · `}
              <TextButton label="show all" onPress={onShowAll} />
            </p>
          )}
      </section>
    </div>
  );
}
