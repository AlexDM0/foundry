/** The product owner's live turn at the end of the chat: Flint writing in its slot beside "Product owner", the session's pill and its calls so far. */
import { Row, StateBadge, Text } from '../../../lib/design-system/DesignSystemInterface.ts';

import { FLINT_SLOT_CUES }                   from '../../flint/FlintSlotCues.ts';
import { FlintSlotHabitat }                  from '../../flint/FlintSlotHabitat.tsx';
import { FLINT_SLOT_HABITATS }               from '../../flint/FlintSlotHabitats.ts';
import { useCoveringPanelHoldsTheFlintSlot } from '../../shell/CoveringPanel.ts';
import { StateToneUtil }                     from '../../utils/StateToneUtil.ts';
import type { ProductOwnerAtWorkFacts }      from './IntakeModel.ts';

export function ProductOwnerAtWork({ atWork }: { readonly atWork: ProductOwnerAtWorkFacts }) {
  const flintSlotIsCovered = useCoveringPanelHoldsTheFlintSlot();
  return (
    <Row centerY gap="fourteen" paddingHorizontal="twentyFour" paddingBottom="eighteen">
      {flintSlotIsCovered
        ? null
        : <FlintSlotHabitat habitat={FLINT_SLOT_HABITATS.intake} cue={FLINT_SLOT_CUES.AGENT_WRITES} label="Flint, the product owner" ground="page" />}
      <Row centerY wrap gap="eight">
        <Text typeRole="tab" bold>Product owner</Text>
        <StateBadge {...StateToneUtil.lookOf(atWork.pill.state)} label={atWork.pill.label} size="compact" />
        <Text typeRole="small" subtle>{atWork.callsText}</Text>
      </Row>
    </Row>
  );
}
