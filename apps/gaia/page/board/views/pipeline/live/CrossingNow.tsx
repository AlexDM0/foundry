/**
 * The crossings an entity's live page shows over its phases (MonoLive): each ticket that runs a package stage now, out of the entity or
 * into it, as its id linking to its detail, its entity and the package it crosses into, and the stage with whose agent and gates it runs.
 */
import { MicroCapsLabel, MonoId, Text } from '../../../../lib/design-system/DesignSystemInterface.ts';

import { useBoardHrefOf }       from '../../../shell/BoardRouteLinks.ts';
import type { CrossingNowView } from './EntityWorkModel.ts';

export function CrossingNow({ crossings }: { readonly crossings: readonly CrossingNowView[] }) {
  const hrefOf = useBoardHrefOf();
  if (crossings.length === 0) return null;
  return (
    <section className="board-pipeline-crossing-now" aria-label="Crossing now">
      <MicroCapsLabel text="Crossing now" element="h3" />
      <ul className="board-pipeline-crossing-now-rows">
        {crossings.map((crossing) => (
          <li key={crossing.key} className="board-pipeline-crossing-now-row">
            <a href={hrefOf(crossing.route)} aria-label={`Open ticket ${crossing.ticketId}`}><MonoId text={crossing.ticketId} tone="link" weight="medium" /></a>
            <MonoId text={crossing.homeEntity} tone="strong" />
            <Text muted>→</Text>
            <MonoId text={crossing.packageEntity} tone="strong" />
            <Text muted>{`· ${crossing.stageText}`}</Text>
          </li>
        ))}
      </ul>
    </section>
  );
}
