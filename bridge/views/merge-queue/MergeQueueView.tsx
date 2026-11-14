/**
 * The Merge queue lane's detail: no controls of its own, since merge moves belong to the incident or decision they answer, and a ticket
 * waiting for merge links to its detail panel, which holds Accept and Update branch.
 */
import { Card }       from 'design-system/Card';
import { EmptyState } from 'design-system/EmptyState';
import { IdLink }     from 'design-system/IdLink';
import { StateBadge } from 'design-system/StateBadge';

import { PriorityMark }                               from '../../chips/TicketMarks.tsx';
import { DetailRoute }                                from '../../shell/DetailRoute.ts';
import { HashRouter }                                 from '../../shell/HashRouter.ts';
import { StateToneUtil }                              from '../../utils/StateToneUtil.ts';
import type { MergeQueueTarget, WaitingForMergeLine } from './MergeQueueModel.ts';

const NOTHING_QUEUED_TEXT = 'Nothing is queued to merge.';

export interface MergeQueueViewProps {
  readonly targets:   readonly MergeQueueTarget[];
  /** How the candidates are ordered, worded from the applied pipeline's merge approval. */
  readonly orderText: string;
}

function ForecastParts({ line }: { readonly line: WaitingForMergeLine }) {
  return (
    <>
      <IdLink text={`#${line.ticketId}`} href={HashRouter.fragmentOf({ tab: 'tickets', item: DetailRoute.itemTextOf({ form: 'ticket-row', ticketId: line.ticketId }) })} />
      <PriorityMark priority={line.priority} />
      <StateBadge {...StateToneUtil.lookOf(line.forecastState)} label={line.forecastLabel} />
      {line.conflictedFilesText === null ? null : <span className="bridge-merge-files">{line.conflictedFilesText}</span>}
    </>
  );
}

export function MergeQueueView({ targets, orderText }: MergeQueueViewProps) {
  return (
    <section className="bridge-merge-queue" aria-label="Merge queue">
      <p className="bridge-merge-order">{orderText}</p>
      {targets.length === 0 ? <Card padding="none"><EmptyState text={NOTHING_QUEUED_TEXT} /></Card> : null}
      {targets.map((target) => (
        <article key={target.target} className="bridge-merge-target" aria-label={target.target}>
          <div className="bridge-merge-target-head">
            <h2 className="bridge-merge-target-name">{target.target}</h2>
            <p className="bridge-merge-holder" data-phase={target.phase ?? undefined}>{target.holderText}</p>
          </div>
          <div className="bridge-merge-target-body">
            {target.waitingReasons.map((reason) => <p key={reason} className="bridge-merge-waiting" role="status">{reason}</p>)}
            {target.lines.length === 0
              ? <EmptyState text={NOTHING_QUEUED_TEXT} compact />
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
