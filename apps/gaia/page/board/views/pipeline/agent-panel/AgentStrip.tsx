/**
 * The strip above the pipeline agent's composer: Flint's 50px slot, the habitat of this step, and what the agent does on it; an entity's
 * research session names the entity it reads, in mono.
 */
import { MonoId, Text } from '../../../../lib/design-system/DesignSystemInterface.ts';

import { FlintSlotHabitat }                  from '../../../flint/FlintSlotHabitat.tsx';
import { useCoveringPanelHoldsTheFlintSlot } from '../../../shell/CoveringPanel.ts';
import type { AgentStripView }               from './PipelineAgentPanelModel.ts';

export const PIPELINE_AGENT_FLINT_LABEL = 'Flint, the pipeline agent';

export function AgentStrip({ strip }: { readonly strip: AgentStripView }) {
  const flintSlotIsCovered = useCoveringPanelHoldsTheFlintSlot();
  return (
    <div className="board-pipeline-agent-strip">
      {flintSlotIsCovered
        ? null
        : (
          <FlintSlotHabitat
            key={strip.flintHabitat.kind}
            habitat={strip.flintHabitat}
            cue={strip.flintCue}
            label={PIPELINE_AGENT_FLINT_LABEL}
            size="50"
            ground="page"
          />
        )}
      <Text typeRole="tab" muted>{strip.text}</Text>
      {strip.entityKey === undefined ? null : <MonoId text={strip.entityKey} tone="muted" />}
    </div>
  );
}
