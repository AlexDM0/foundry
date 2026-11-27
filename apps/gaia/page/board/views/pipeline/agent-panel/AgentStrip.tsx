/**
 * The strip above the pipeline agent's composer: Flint's strip slot of 60 by 50 px, the habitat of this step, and what the agent does on
 * it; an entity's research session names the entity it reads, in mono.
 */
import { MonoId, Text } from '../../../../lib/design-system/DesignSystemInterface.ts';

import { FlintSlotHabitat }                  from '../../../flint/FlintSlotHabitat.tsx';
import { STRIP_FLINT_SLOT }                  from '../../../flint/FlintStripSlot.ts';
import { useCoveringPanelHoldsTheFlintSlot } from '../../../shared/CoveringPanel.ts';
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
            size={STRIP_FLINT_SLOT.SIZE}
            ground="page"
          />
        )}
      <Text typeRole="tab" muted>{strip.text}</Text>
      {strip.entityKey === undefined ? null : <MonoId text={strip.entityKey} tone="muted" />}
    </div>
  );
}
