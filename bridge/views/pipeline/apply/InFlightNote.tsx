/**
 * The note that tickets are in flight while the pipeline changes: how many, each as a chip linking to its detail, and what version each
 * runs on. The caller words the lead and the text from the applied revision.
 */
import { Callout }                from '../../../design-system/Callout.tsx';
import { Tag }                    from '../../../design-system/Tag.tsx';
import { FlowActivityPanelModel } from '../live/FlowActivityPanelModel.ts';

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
        {FlowActivityPanelModel.inFlightChipsOf(ticketIds).map((chip) => (
          <li key={chip.key} className="bridge-pipeline-in-flight-ticket">
            <Tag text={chip.text} tone="state" state={chip.state} href={chip.href} />
          </li>
        ))}
      </ul>
    </Callout>
  );
}
