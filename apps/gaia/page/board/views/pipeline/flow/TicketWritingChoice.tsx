/**
 * How a ticket is written, one ticket or a spec, then a plan, chosen in the Ticket phase of a single repository's pipeline and on the forge
 * level of a monorepo's, where the route is set for every entity.
 */
import { useId } from 'react';

import type { BoardPipelineDefinitionDocument }          from '../../../../@types/board/BoardPipelineDocuments.ts';
import { Row, SegmentedControl, Text }                   from '../../../../lib/design-system/DesignSystemInterface.ts';
import type { PipelineFlowEditSender }                   from './PipelineFlowEditSender.ts';
import { PipelineFlowModel, type TicketWritingDefaults } from './PipelineFlowModel.ts';

const TICKET_WRITING_TITLE = 'How a ticket is written';

const TICKET_WRITING_LEAD = 'Each document gets its own agent, and its own review if you want one.';

interface TicketWritingChoiceProps {
  readonly draft:      Pick<BoardPipelineDefinitionDocument, 'ticketWriting'> | null;
  /** The route a draft that names none writes a ticket by, as the forge serves it. */
  readonly defaults:   TicketWritingDefaults;
  readonly editSender: PipelineFlowEditSender;
}

/** One ticket, or a spec, then a plan: a press sends the one `ticket-writing` edit, and the choice already made sends nothing. */
export function TicketWritingChoice({ draft, defaults, editSender }: TicketWritingChoiceProps) {
  const titleId = useId();
  const route = PipelineFlowModel.ticketWritingRouteOfDraft(draft, defaults);
  return (
    <section className="board-pipeline-ticket-writing" aria-labelledby={titleId}>
      <Row centerY gap="ten" wrap>
        <Text typeRole="lead" bold element="h3" id={titleId}>{TICKET_WRITING_TITLE}</Text>
        <Text muted>{TICKET_WRITING_LEAD}</Text>
      </Row>
      <SegmentedControl
        labelledBy={titleId}
        options={PipelineFlowModel.TICKET_WRITING_CHOICES.map((choice) => ({ ...choice, disabled: !editSender.enabled }))}
        selected={route}
        size="standard"
        onSelect={(chosen) => {
          if (chosen !== route) editSender.sendEdits([PipelineFlowModel.ticketWritingEditOf(chosen, defaults)]);
        }}
      />
    </section>
  );
}
