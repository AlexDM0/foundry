/**
 * The parts the Questions, Assistant and Intake views share: a card's head (its mono id, its title and its state pill), and the meta line
 * whose ticket and job ids each link to their own place; the Agents table links its tickets the same way.
 */
import { Fragment, type ReactNode } from 'react';

import type { DisplayState } from '../../src/lib/tracker-model/@types/Task.ts';
import { IdLink, MonoId }    from '../design-system/MonoId.tsx';
import { StateBadge }        from '../design-system/StateBadge.tsx';
import { DetailRoute }       from '../shell/DetailRoute.ts';
import { HashRouter }        from '../shell/HashRouter.ts';

export interface CardPill {
  readonly state: DisplayState;
  readonly label: string;
}

export interface CardHeadProps {
  readonly id:     string;
  readonly title?: string;
  readonly pill:   CardPill;
}

export function CardHead({ id, title, pill }: CardHeadProps) {
  return (
    <div className="bridge-card-head">
      <h3 className="bridge-card-title">
        <MonoId text={id} />
        {title === undefined ? null : <span>{title}</span>}
      </h3>
      <StateBadge state={pill.state} label={pill.label} />
    </div>
  );
}

export function TicketLinks({ ticketIds }: { readonly ticketIds: readonly string[] }) {
  return ticketIds.map((ticketId, position) => (
    <Fragment key={ticketId}>
      {position === 0 ? null : ' '}
      <IdLink text={`#${ticketId}`} href={HashRouter.fragmentOf({ tab: 'tickets', item: DetailRoute.itemTextOf({ form: 'ticket-row', ticketId }) })} />
    </Fragment>
  ));
}

export function JobLink({ jobId }: { readonly jobId: string }) {
  return <IdLink text={jobId} href={HashRouter.fragmentOf({ tab: 'agents', item: jobId })} />;
}

/** The facts a card's meta line holds, each its own element between middle dots; a `null` part is left out. */
export function MetaLine({ parts }: { readonly parts: readonly ReactNode[] }) {
  const shown = parts.filter((part) => part !== null);
  return (
    <p className="bridge-card-meta">
      {shown.map((part, position) => (
        <Fragment key={position}>
          {position === 0 ? null : ' · '}
          <span>{part}</span>
        </Fragment>
      ))}
    </p>
  );
}
