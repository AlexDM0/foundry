/** The 100px strip above the pipeline agent's composer: Flint's slot and what the agent does on this step. */
import { FlintSlot } from 'design-system/FlintSlot';
import { Text }      from 'design-system/Text';

import { useCoveringPanelHoldsTheFlintSlot } from '../../../shell/CoveringPanel.ts';
import type { AgentStripView }               from './PipelineAgentPanelModel.ts';

export const PIPELINE_AGENT_FLINT_LABEL = 'Flint, the pipeline agent';

export function AgentStrip({ strip }: { readonly strip: AgentStripView }) {
  const flintSlotIsCovered = useCoveringPanelHoldsTheFlintSlot();
  return (
    <div className="bridge-pipeline-agent-strip">
      {flintSlotIsCovered ? null : <FlintSlot label={PIPELINE_AGENT_FLINT_LABEL} size="76" ground="page" pose={strip.pose} />}
      <Text typeRole="tab" muted>{strip.text}</Text>
    </div>
  );
}
