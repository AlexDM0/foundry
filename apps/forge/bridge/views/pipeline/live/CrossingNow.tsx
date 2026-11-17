/**
 * The crossings an entity's live page shows over its phases (MonoLive): each ticket that runs a package stage now, out of the entity or
 * into it, as its id linking to its detail, its entity and the package it crosses into, and the stage with whose agent and gates it runs.
 */
import { MicroCapsLabel } from 'design-system/MicroCapsLabel';
import { MonoId }         from 'design-system/MonoId';
import { Text }           from 'design-system/Text';

import type { CrossingNowView } from './EntityWorkModel.ts';

export function CrossingNow({ crossings }: { readonly crossings: readonly CrossingNowView[] }) {
  if (crossings.length === 0) return null;
  return (
    <section className="bridge-pipeline-crossing-now" aria-label="Crossing now">
      <MicroCapsLabel text="Crossing now" element="h3" />
      <ul className="bridge-pipeline-crossing-now-rows">
        {crossings.map((crossing) => (
          <li key={crossing.key} className="bridge-pipeline-crossing-now-row">
            <a href={crossing.href} aria-label={`Open ticket ${crossing.ticketId}`}><MonoId text={crossing.ticketId} tone="link" weight="medium" /></a>
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
