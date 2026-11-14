/** The product owner's live turn at the end of the chat: Flint typing beside "Product owner", the session's pill and its calls so far. */
import { FlintSlot }  from 'design-system/FlintSlot';
import { Row }        from 'design-system/Row';
import { StateBadge } from 'design-system/StateBadge';
import { Text }       from 'design-system/Text';

import { useCoveringPanelHoldsTheFlintSlot } from '../../shell/CoveringPanel.ts';
import { StateToneUtil }                     from '../../utils/StateToneUtil.ts';
import type { ProductOwnerAtWorkFacts }      from './IntakeModel.ts';

export function ProductOwnerAtWork({ atWork }: { readonly atWork: ProductOwnerAtWorkFacts }) {
  const flintSlotIsCovered = useCoveringPanelHoldsTheFlintSlot();
  return (
    <Row centerY gap="fourteen" paddingHorizontal="twentyFour" paddingBottom="eighteen">
      {flintSlotIsCovered ? null : <FlintSlot size="100" ground="page" label="Flint, the product owner" pose="typing" />}
      <Row centerY wrap gap="eight">
        <Text typeRole="tab" bold>Product owner</Text>
        <StateBadge {...StateToneUtil.lookOf(atWork.pill.state)} label={atWork.pill.label} size="compact" />
        {atWork.callsText === null ? null : <Text typeRole="small" subtle>{atWork.callsText}</Text>}
      </Row>
    </Row>
  );
}
