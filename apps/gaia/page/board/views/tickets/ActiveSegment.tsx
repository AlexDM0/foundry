/**
 * The Active segment: the stage table, each row its id, title, stage badge, agent, epic and since, a row opening its ticket's detail in
 * place as its id link does.
 */
import { StateBadge }                                    from '../../../lib/design-system/DesignSystemInterface.ts';
import { useDetailRouting }                              from '../../shell/DetailRouting.ts';
import { StateToneUtil }                                 from '../../utils/StateToneUtil.ts';
import type { ActiveTicketRowModel, ActiveTicketsModel } from './ActiveTicketsModel.ts';
import {
  AgentMark,
  RowEpicMark,
  SegmentEmptyLine,
  TicketDetailRow
} from './TicketRowParts.tsx';

function ActiveRow({ row }: { readonly row: ActiveTicketRowModel }) {
  const routing = useDetailRouting();
  return (
    <TicketDetailRow ticketId={row.ticketId}>
      <td className="board-tickets-id"><a href={routing.openerHrefOf({ form: 'ticket', ticketId: row.ticketId })}>{row.idText}</a></td>
      <td><span className="board-tickets-title">{row.title}</span></td>
      <td><StateBadge {...StateToneUtil.lookOf(row.stage.state)} label={row.stage.label} palette="quiet" fitted /></td>
      <td><AgentMark dotState={row.agent.dotState} pulsing={row.agent.pulsing} jobId={null} roleText={row.agent.text} /></td>
      <td><RowEpicMark epic={row.epic} /></td>
      <td className="board-tickets-stamp">{row.sinceText}</td>
    </TicketDetailRow>
  );
}

export function ActiveSegment({ model, searches }: { readonly model: ActiveTicketsModel; readonly searches: boolean }) {
  return (
    <div className="board-tickets-segment" data-segment="active">
      <section className="board-tickets-panel" aria-label="Active tickets">
        {model.rows.length === 0
          ? <SegmentEmptyLine text={searches ? 'No active ticket matches the search.' : 'No ticket is under way.'} />
          : (
            <table className="board-tickets-table">
              <colgroup>
                <col className="board-tickets-column-id" />
                <col />
                <col className="board-tickets-column-stage" />
                <col className="board-tickets-column-agent" />
                <col className="board-tickets-column-epic" />
                <col className="board-tickets-column-since" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Id</th>
                  <th scope="col">Ticket</th>
                  <th scope="col">Stage</th>
                  <th scope="col">Agent</th>
                  <th scope="col">Epic</th>
                  <th scope="col">Since</th>
                </tr>
              </thead>
              <tbody>
                {model.rows.map((row) => <ActiveRow key={row.ticketId} row={row} />)}
              </tbody>
            </table>
          )}
      </section>
    </div>
  );
}
