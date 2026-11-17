/**
 * The note that tickets are in flight while the pipeline changes: a live dot, how many, what version each runs on, and each ticket as a
 * chip linking to its detail. The caller words the lead and the text from the applied revision. Over entities (MonoApplyChanges) the
 * chips stand in one group per entity, a ticket that runs a package stage under the package with the crossing it comes from.
 */
import { Card }   from 'design-system/Card';
import { MonoId } from 'design-system/MonoId';
import { Row }    from 'design-system/Row';
import { Tag }    from 'design-system/Tag';
import { Text }   from 'design-system/Text';
import { View }   from 'design-system/View';

import { StateToneUtil }                                 from '../../../utils/StateToneUtil.ts';
import type { InFlightGroupView }                        from '../live/EntityWorkModel.ts';
import { FlowActivityPanelModel, type OccupantChipView } from '../live/FlowActivityPanelModel.ts';

export interface InFlightNoteProps {
  readonly ticketIds: readonly string[];
  readonly lead:      string;
  readonly text:      string;
  /** Over entities, the tickets grouped by entity; absent or null keeps them one list. */
  readonly groups?:   readonly InFlightGroupView[] | null;
}

const NO_ENTITY_TEXT = 'No entity yet';

function TicketChip({ chip }: { readonly chip: OccupantChipView }) {
  return <Tag text={chip.text} {...StateToneUtil.tagLookOf(chip.state)} dot href={chip.href} />;
}

function InFlightGroups({ groups }: { readonly groups: readonly InFlightGroupView[] }) {
  return (
    <ul className="bridge-pipeline-in-flight-groups" aria-label="Tickets in flight by entity">
      {groups.map((group) => {
        const name = group.entity ?? NO_ENTITY_TEXT;
        return (
          <li key={group.key} className="bridge-pipeline-in-flight-group">
            <span className="bridge-pipeline-in-flight-group-head">
              {group.entity === null ? <Text typeRole="small" muted>{name}</Text> : <MonoId text={name} tone="strong" weight="bold" />}
            </span>
            <ul className="bridge-pipeline-in-flight-tickets" aria-label={`Tickets in flight in ${name}`}>
              {group.tickets.map((ticket) => (
                <li key={ticket.chip.key} className="bridge-pipeline-in-flight-ticket">
                  <TicketChip chip={ticket.chip} />
                  {ticket.crossingText === null ? null : <span className="bridge-pipeline-in-flight-crossing">{ticket.crossingText}</span>}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

export function InFlightNote({
  ticketIds, lead, text, groups = null
}: InFlightNoteProps) {
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
          {groups === null
            ? (
              <ul className="bridge-pipeline-in-flight-tickets" aria-label="Tickets in flight">
                {FlowActivityPanelModel.inFlightChipsOf(ticketIds).map((chip) => (
                  <li key={chip.key} className="bridge-pipeline-in-flight-ticket">
                    <TicketChip chip={chip} />
                  </li>
                ))}
              </ul>
            )
            : <InFlightGroups groups={groups} />}
        </View>
      </Row>
    </Card>
  );
}
