/**
 * The Merge queue lane's detail: no controls of its own, since merge moves belong to the incident or decision they answer, and a ticket
 * waiting for merge links to its detail panel, which holds Accept and Update branch.
 */
import { StateBadge }                                                           from '../../chips/StateBadge.tsx';
import { PriorityMark }                                                         from '../../chips/TicketMarks.tsx';
import { DetailRoute }                                                          from '../../shell/DetailRoute.ts';
import { HashRouter }                                                           from '../../shell/HashRouter.ts';
import { FIVE_KEY_ORDER_TEXT, type MergeQueueTarget, type WaitingForMergeLine } from './MergeQueueModel.ts';

export interface MergeQueueViewProps {
  readonly targets: readonly MergeQueueTarget[];
}

function ForecastParts({ line }: { readonly line: WaitingForMergeLine }) {
  return (
    <>
      <a className="bridge-id-link" href={HashRouter.fragmentOf({ tab: 'tickets', item: DetailRoute.itemTextOf({ form: 'ticket-row', ticketId: line.ticketId }) })}>
        {`#${line.ticketId}`}
      </a>
      <PriorityMark priority={line.priority} />
      <StateBadge state={line.forecastState} label={line.forecastLabel} />
      {line.conflictedFilesText === null ? null : <span className="bridge-merge-files">{line.conflictedFilesText}</span>}
    </>
  );
}

export function MergeQueueView({ targets }: MergeQueueViewProps) {
  return (
    <section className="bridge-merge-queue" aria-label="Merge queue">
      <p className="bridge-merge-order">{FIVE_KEY_ORDER_TEXT}</p>
      {targets.length === 0 ? <p className="bridge-empty">Nothing is queued to merge.</p> : null}
      {targets.map((target) => (
        <article key={target.target} className="bridge-merge-target" aria-label={target.target}>
          <div className="bridge-merge-target-head">
            <h2 className="bridge-merge-target-name">{target.target}</h2>
            <p className="bridge-merge-holder" data-phase={target.phase ?? undefined}>{target.holderText}</p>
          </div>
          <div className="bridge-merge-target-body">
            {target.waitingReasons.map((reason) => <p key={reason} className="bridge-merge-waiting" role="status">{reason}</p>)}
            {target.lines.length === 0
              ? <p className="bridge-empty">Nothing is queued to merge.</p>
              : (
                <ol className="bridge-merge-lines">
                  {target.lines.map((line) => (
                    <li key={line.ticketId} className="bridge-merge-line" data-forecast={line.forecast}>
                      <ForecastParts line={line} />
                      {line.causesText === null ? null : <span className="bridge-merge-causes">{line.causesText}</span>}
                    </li>
                  ))}
                </ol>
              )}
            {target.waitingLines === undefined ? null : (
              <section className="bridge-merge-section" aria-label={`Waiting for merge into ${target.target}`}>
                <h3 className="bridge-merge-section-title">Waiting for merge</h3>
                <ul className="bridge-merge-lines">
                  {target.waitingLines.map((line) => (
                    <li key={line.ticketId} className="bridge-merge-line" data-forecast={line.forecast}>
                      <ForecastParts line={line} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {target.pairwiseTexts.length === 0 ? null : (
              <ul className="bridge-merge-pairwise" aria-label="Predicted conflicts between candidates">
                {target.pairwiseTexts.map((text) => <li key={text}>{text}</li>)}
              </ul>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
