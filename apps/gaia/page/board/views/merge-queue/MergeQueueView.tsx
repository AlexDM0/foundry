/**
 * The Merge queue lane's detail: no controls of its own, since merge moves belong to the incident or decision they answer, and a ticket
 * waiting for merge links to its detail panel, which holds Accept and Update branch. It is the merge-queue habitat of Flint.
 */
import { Card }       from 'design-system/Card';
import { EmptyState } from 'design-system/EmptyState';
import { IdLink }     from 'design-system/IdLink';
import { StateBadge } from 'design-system/StateBadge';
import { useRef }     from 'react';

import { PriorityMark }                               from '../../chips/TicketMarks.tsx';
import { useHabitatCues }                             from '../../flint/UseHabitatHappenings.ts';
import { useBoardHrefOf }                             from '../../shell/BoardRouteLinks.ts';
import { DetailRoute }                                from '../../shell/DetailRoute.ts';
import { StateToneUtil }                              from '../../utils/StateToneUtil.ts';
import type { MergeQueueTarget, WaitingForMergeLine } from './MergeQueueModel.ts';
import { MERGE_QUEUE_SPRITE_HABITAT }                 from './MergeQueueSpriteHabitat.ts';
import { MergeQueueSpriteModel }                      from './MergeQueueSpriteModel.ts';

const NOTHING_QUEUED_TEXT = 'Nothing is queued to merge.';

export interface MergeQueueViewProps {
  readonly targets:   readonly MergeQueueTarget[];
  /** How the candidates are ordered, worded from the applied pipeline's served merge approval. */
  readonly orderText: string;
}

function ForecastParts({ line }: { readonly line: WaitingForMergeLine }) {
  const hrefOf = useBoardHrefOf();
  return (
    <>
      <IdLink text={`#${line.ticketId}`} href={hrefOf({ tab: 'tickets', item: DetailRoute.itemTextOf({ form: 'ticket-row', ticketId: line.ticketId }) })} />
      <PriorityMark priority={line.priority} />
      <StateBadge {...StateToneUtil.lookOf(line.forecastState)} label={line.forecastLabel} />
      {line.conflictedFilesText === null ? null : <span className="board-merge-files">{line.conflictedFilesText}</span>}
    </>
  );
}

export function MergeQueueView({ targets, orderText }: MergeQueueViewProps) {
  const viewElement = useRef<HTMLElement>(null);
  useHabitatCues(viewElement, MERGE_QUEUE_SPRITE_HABITAT, targets, MergeQueueSpriteModel.cuesBetween);
  return (
    <section className="board-merge-queue" aria-label="Merge queue" ref={viewElement} data-flint-workplace="">
      <p className="board-merge-order">{orderText}</p>
      {targets.length === 0 ? <Card padding="none"><EmptyState text={NOTHING_QUEUED_TEXT} /></Card> : null}
      {targets.map((target) => (
        <article key={target.target} className="board-merge-target" aria-label={target.target}>
          <div className="board-merge-target-head">
            <h2 className="board-merge-target-name">{target.target}</h2>
            <p className="board-merge-holder" data-phase={target.phase ?? undefined}>{target.holderText}</p>
          </div>
          <div className="board-merge-target-body">
            {target.waitingReasons.map((reason) => <p key={reason} className="board-merge-waiting" role="status">{reason}</p>)}
            {target.lines.length === 0
              ? <EmptyState text={NOTHING_QUEUED_TEXT} compact />
              : (
                <ol className="board-merge-lines">
                  {target.lines.map((line) => (
                    <li key={line.ticketId} className="board-merge-line" data-forecast={line.forecast}>
                      <ForecastParts line={line} />
                      {line.causesText === null ? null : <span className="board-merge-causes">{line.causesText}</span>}
                    </li>
                  ))}
                </ol>
              )}
            {target.waitingLines === undefined ? null : (
              <section className="board-merge-section" aria-label={`Waiting for merge into ${target.target}`}>
                <h3 className="board-merge-section-title">Waiting for merge</h3>
                <ul className="board-merge-lines">
                  {target.waitingLines.map((line) => (
                    <li key={line.ticketId} className="board-merge-line" data-forecast={line.forecast}>
                      <ForecastParts line={line} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {target.pairwiseTexts.length === 0 ? null : (
              <ul className="board-merge-pairwise" aria-label="Predicted conflicts between candidates">
                {target.pairwiseTexts.map((text) => <li key={text}>{text}</li>)}
              </ul>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
