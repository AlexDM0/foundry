/** The tickets a job works on as chips, each linked to its ticket row with its title on hover; a dash for a job on no ticket. */
import { useBoardHrefOf }        from '../../shared/routing/BoardRouteLinks.ts';
import { DetailRoute }           from '../../shared/routing/DetailRoute.ts';
import type { AgentJobDocument } from './AgentJobDocument.ts';
import { SubjectChip }           from './SubjectChip.tsx';

export interface TicketChipsProps {
  readonly job:           Pick<AgentJobDocument, 'ticketIds'>;
  readonly ticketTitleOf: (ticketId: string) => string | null;
}

export function TicketChips({ job, ticketTitleOf }: TicketChipsProps) {
  const hrefOf = useBoardHrefOf();
  if (job.ticketIds.length === 0) return <span className="agents-muted">-</span>;
  return (
    <div className="agents-subjects">
      {job.ticketIds.map((ticketId) => (
        <SubjectChip
          key={ticketId}
          href={hrefOf({ tab: 'tickets', item: DetailRoute.itemTextOf({ form: 'ticket-row', ticketId }) })}
          idText={`#${ticketId}`}
          text={ticketTitleOf(ticketId)}
        />
      ))}
    </div>
  );
}
