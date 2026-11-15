/** The pipeline agent's model and effort at the right end of a panel head; nothing while no model is named. */
import { ModelEffortMeter } from 'design-system/ModelEffortMeter';

import type { PipelineAgentMeter } from '../setup/BillingStepModel.ts';

export function AgentMeter({ meter }: { readonly meter: PipelineAgentMeter | null }) {
  if (meter === null) return null;
  return (
    <ModelEffortMeter
      model={meter.model}
      effort={meter.effort}
      level={meter.level}
      levelCount={meter.levelCount}
      accessibleName={meter.accessibleName}
      size="node"
    />
  );
}
