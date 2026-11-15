/**
 * The note that tickets are in flight while the pipeline changes: a live dot, how many, what version each runs on, and each ticket as a
 * chip linking to its detail. The caller words the lead and the text from the applied revision.
 */
import { Card } from 'design-system/Card';
import { Row }  from 'design-system/Row';
import { Tag }  from 'design-system/Tag';
import { Text } from 'design-system/Text';
import { View } from 'design-system/View';

import { StateToneUtil }          from '../../../utils/StateToneUtil.ts';
import { FlowActivityPanelModel } from '../live/FlowActivityPanelModel.ts';

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
            {FlowActivityPanelModel.inFlightChipsOf(ticketIds).map((chip) => (
              <li key={chip.key} className="bridge-pipeline-in-flight-ticket">
                <Tag text={chip.text} {...StateToneUtil.tagLookOf(chip.state)} dot href={chip.href} />
              </li>
            ))}
          </ul>
        </View>
      </Row>
    </Card>
  );
}
