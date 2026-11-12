/**
 * The note that tickets are in flight while the pipeline changes: how many, each as a chip, and what version each runs on. The caller
 * words the lead and the text from the applied revision.
 */
import { Callout } from '../../../design-system/Callout.tsx';
import { MonoId }  from '../../../design-system/MonoId.tsx';

export interface InFlightNoteProps {
  readonly ticketIds: readonly string[];
  readonly lead:      string;
  readonly text:      string;
}

export function InFlightNote({ ticketIds, lead, text }: InFlightNoteProps) {
  if (ticketIds.length === 0) return null;
  return (
    <Callout tone="state" state="in-progress">
      <p className="bridge-pipeline-in-flight-text">
        <strong>{lead}</strong>
        {' '}
        {text}
      </p>
      <ul className="bridge-pipeline-in-flight-tickets" aria-label="Tickets in flight">
        {ticketIds.map((ticketId) => <li key={ticketId} className="bridge-pipeline-in-flight-ticket"><MonoId text={ticketId} /></li>)}
      </ul>
    </Callout>
  );
}
