/**
 * The marks a ticket carries wherever it shows: its mono id, its priority (low quiet, high amber; normal unmarked), its type in small
 * capitals, and the dashed "waiting on" note whose ids each link where the caller says.
 */
import { Fragment } from 'react';

import type { TicketPriority, TicketType } from '../../src/lib/tracker-model/@types/Ticket.ts';
import { MonoId }                          from '../design-system/MonoId.tsx';

const PRIORITY_MARK_TITLE: Readonly<Record<Exclude<TicketPriority, 'normal'>, string>> = {
  low:  'Low priority: no row on the chart until it is started, and worked once every normal and high ticket is done',
  high: 'High priority: dispatched before every normal ticket',
};

export function TicketIdMark({ ticketId }: { readonly ticketId: string }) {
  return <MonoId text={`#${ticketId}`} />;
}

/** Nothing for a normal ticket. */
export function PriorityMark({ priority }: { readonly priority: TicketPriority }) {
  if (priority === 'normal') return null;
  return <span className="bridge-priority-mark" data-priority={priority} title={PRIORITY_MARK_TITLE[priority]}>{priority}</span>;
}

export function TypeMark({ type }: { readonly type: TicketType }) {
  return <span className="bridge-type-mark" data-type={type}>{type}</span>;
}

export interface WaitingOnMarkProps {
  readonly ticketIds: readonly string[];
  /** Where each id links: the card it waits on, or that ticket's detail. */
  readonly hrefOf:    (ticketId: string) => string;
  /** Brings the id's own item into view in place; `true` when it did, so the link is not followed. */
  readonly onFollow?: (ticketId: string) => boolean;
}

/** Nothing while the ticket waits on none. */
export function WaitingOnMark({ ticketIds, hrefOf, onFollow }: WaitingOnMarkProps) {
  if (ticketIds.length === 0) return null;
  return (
    <span className="bridge-waiting-on">
      {'waiting on '}
      {ticketIds.map((ticketId, position) => (
        <Fragment key={ticketId}>
          {position === 0 ? null : ', '}
          <a
            className="bridge-waiting-on-link"
            href={hrefOf(ticketId)}
            onClick={(event) => {
              event.stopPropagation();
              if (onFollow?.(ticketId) === true) event.preventDefault();
            }}
          >
            {`#${ticketId}`}
          </a>
        </Fragment>
      ))}
    </span>
  );
}
