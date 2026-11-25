/**
 * The In draft segment: the running intakes, each linking to its session in Intake; then "Waiting on you", each draft with its track, what
 * waits and the one action that opens it; then "Agent writing", each draft with its agent and Watch. Every link opens a route; no row
 * sends a command.
 */
import { Button, StateDot }                  from '../../../lib/design-system/DesignSystemInterface.ts';
import { useBoardHrefOf }                    from '../../shell/BoardRouteLinks.ts';
import { StateToneUtil }                     from '../../utils/StateToneUtil.ts';
import type { InDraftModel, IntakeRowModel } from './InDraftModel.ts';
import {
  AgentMark,
  DraftTrack,
  RowEpicMark,
  SegmentEmptyLine
} from './TicketRowParts.tsx';

function IntakePanel({ intake }: { readonly intake: IntakeRowModel }) {
  const hrefOf = useBoardHrefOf();
  return (
    <section className="board-tickets-panel" data-intake="" aria-label={`Intake ${intake.title}`}>
      <div className="board-tickets-panel-head">
        <StateDot {...StateToneUtil.dotOf('in-progress')} pulsing small />
        <span className="board-tickets-job">{intake.jobId}</span>
        <span className="board-tickets-role" data-state-tone={StateToneUtil.toneOf('in-progress')}>intake</span>
        <h3 className="board-tickets-intake-title">{intake.title}</h3>
        <span className="board-tickets-intake-facts">{[intake.draftsText, intake.runningText].filter((text) => text !== null).join(' · ')}</span>
        <span className="board-tickets-panel-end">
          {intake.waitsText === null ? null : <span className="board-tickets-waits">{intake.waitsText}</span>}
          <Button dense label="Open intake" href={hrefOf(intake.route)} />
        </span>
      </div>
    </section>
  );
}

/** The columns both draft tables share, so the waiting and the writing rows line up. */
function DraftColumns() {
  return (
    <colgroup>
      <col className="board-tickets-column-id" />
      <col />
      <col className="board-tickets-column-track" />
      <col className="board-tickets-column-what" />
      <col className="board-tickets-column-action" />
      <col className="board-tickets-column-since" />
    </colgroup>
  );
}

export interface InDraftSegmentProps {
  readonly model:    InDraftModel;
  /** The search narrows the rows: the empty line says so. */
  readonly searches: boolean;
}

export function InDraftSegment({ model, searches }: InDraftSegmentProps) {
  const hrefOf = useBoardHrefOf();
  const nothingShows = model.intakes.length === 0 && model.waiting.length === 0 && model.writing.length === 0;
  return (
    <div className="board-tickets-segment" data-segment="in-draft">
      {model.intakes.map((intake) => <IntakePanel key={intake.jobId} intake={intake} />)}
      {nothingShows ? <SegmentEmptyLine text={searches ? 'No draft matches the search.' : 'No ticket is being written.'} /> : null}
      {model.waiting.length === 0
        ? null
        : (
          <section className="board-tickets-panel" aria-label="Waiting on you">
            <div className="board-tickets-panel-head">
              <h3 className="board-tickets-panel-title" data-waiting="">Waiting on you</h3>
              <span className="board-tickets-panel-count" data-waiting="">{model.waiting.length}</span>
            </div>
            <table className="board-tickets-table">
              <DraftColumns />
              <thead>
                <tr>
                  <th scope="col">Id</th>
                  <th scope="col">Ticket</th>
                  <th scope="col">Writing</th>
                  <th scope="col">What waits on you</th>
                  <th scope="col" aria-label="Action" />
                  <th scope="col">Since</th>
                </tr>
              </thead>
              <tbody>
                {model.waiting.map((row) => (
                  <tr key={row.key} className="board-tickets-row" data-ticket-id={row.ticketId ?? undefined}>
                    <td className="board-tickets-id"><a href={hrefOf(row.openRoute)}>{row.idText}</a></td>
                    <td>
                      <span className="board-tickets-title">{row.title}</span>
                      <RowEpicMark epic={row.epic} originText={row.originText} />
                    </td>
                    <td><DraftTrack steps={row.steps} /></td>
                    <td><span className="board-tickets-waits">{row.waitsText}</span></td>
                    <td><Button dense emphasis="primary" label={row.actionLabel} href={hrefOf(row.actionRoute)} accessibleName={`${row.actionLabel} ${row.idText}`} /></td>
                    <td className="board-tickets-stamp">{row.sinceText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      {model.writing.length === 0
        ? null
        : (
          <section className="board-tickets-panel" aria-label="Agent writing">
            <div className="board-tickets-panel-head">
              <h3 className="board-tickets-panel-title">Agent writing</h3>
              <span className="board-tickets-panel-count">{model.writing.length}</span>
            </div>
            <table className="board-tickets-table">
              <DraftColumns />
              <tbody>
                {model.writing.map((row) => (
                  <tr key={row.key} className="board-tickets-row" data-ticket-id={row.ticketId ?? undefined}>
                    <td className="board-tickets-id"><a href={hrefOf(row.openRoute)}>{row.idText}</a></td>
                    <td>
                      <span className="board-tickets-title">{row.title}</span>
                      <RowEpicMark epic={row.epic} originText={row.originText} />
                    </td>
                    <td><DraftTrack steps={row.steps} /></td>
                    <td>
                      {row.agent === null
                        ? <AgentMark dotState="committed" pulsing={false} jobId={null} roleText="no agent yet" />
                        : <AgentMark dotState={row.agent.dotState} pulsing jobId={row.agent.jobId} roleText={row.agent.roleText} tokensText={row.agent.tokensText} />}
                    </td>
                    <td>
                      {row.watchRoute === null ? null : <Button dense label="Watch" href={hrefOf(row.watchRoute)} accessibleName={`Watch ${row.idText}`} />}
                    </td>
                    <td className="board-tickets-stamp" data-strong="">{row.sinceText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
    </div>
  );
}
