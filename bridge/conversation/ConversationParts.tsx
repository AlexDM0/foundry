/**
 * The parts the Questions, Assistant and Intake views share: a section's head over its list of cards, a card's head (its mono id, its
 * title and its state pill), and the meta line whose ticket and job ids each link to their own place; the Agents table links its
 * tickets the same way.
 */
import { Fragment, type ReactNode } from 'react';

import { StateBadge }  from '../chips/StateBadge.tsx';
import { DetailRoute } from '../shell/DetailRoute.ts';
import { HashRouter }  from '../shell/HashRouter.ts';

export interface SectionHeadProps {
  readonly title:     string;
  /** Shown apart, muted at the head's end; left out where a section counts nothing. */
  readonly count?:    number;
  readonly children?: ReactNode;
}

export function SectionHead({ title, count, children }: SectionHeadProps) {
  return (
    <div className="bridge-section-head">
      <h2 className="bridge-section-title">{title}</h2>
      {count === undefined ? null : <span className="bridge-section-count">{count}</span>}
      {children}
    </div>
  );
}

export interface CardPill {
  readonly state: string;
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
        <span className="bridge-ticket-id">{id}</span>
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
      <a className="bridge-id-link" href={HashRouter.fragmentOf({ tab: 'tickets', item: DetailRoute.itemTextOf({ form: 'ticket-row', ticketId }) })}>
        {`#${ticketId}`}
      </a>
    </Fragment>
  ));
}

export function JobLink({ jobId }: { readonly jobId: string }) {
  return <a className="bridge-id-link" href={HashRouter.fragmentOf({ tab: 'agents', item: jobId })}>{jobId}</a>;
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
