/**
 * The note that tickets are in flight while the pipeline changes: a live dot, how many, what version each runs on, and each ticket as a
 * chip. The caller words the lead and the text from the applied revision.
 */
import { Card }   from 'design-system/Card';
import { MonoId } from 'design-system/MonoId';
import { Row }    from 'design-system/Row';
import { Text }   from 'design-system/Text';
import { View }   from 'design-system/View';

export interface InFlightNoteProps {
  readonly ticketIds: readonly string[];
  readonly lead:      string;
  readonly text:      string;
}

export function InFlightNote({ ticketIds, lead, text }: InFlightNoteProps) {
  if (ticketIds.length === 0) return null;
  return (
    <Card quiet paddingVertical="ten" paddingHorizontal="twelve">
      <Row gap="ten">
        <span className="bridge-pipeline-in-flight-dot" aria-hidden="true" />
        <View gap="six">
          <Text element="p">
            <Text bold>{lead}</Text>
            {' '}
            <Text muted>{text}</Text>
          </Text>
          <ul className="bridge-pipeline-in-flight-tickets" aria-label="Tickets in flight">
            {ticketIds.map((ticketId) => <li key={ticketId} className="bridge-pipeline-in-flight-ticket"><MonoId text={ticketId} /></li>)}
          </ul>
        </View>
      </Row>
    </Card>
  );
}
