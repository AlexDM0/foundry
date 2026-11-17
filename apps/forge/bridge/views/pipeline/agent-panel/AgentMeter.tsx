/**
 * The pipeline agent's model and effort at the right end of a panel head; nothing while no model is named. In monorepo mode each session
 * shows its meter, named for the session: "Pipeline agent · web: Opus, high effort".
 */
import { ModelEffortMeter } from 'design-system/ModelEffortMeter';

import type { PipelineAgentMeter } from '../setup/BillingStepModel.ts';

export interface AgentMeterProps {
  readonly meter:        PipelineAgentMeter | null;
  /** The session the meter belongs to, such as "Pipeline agent · web"; absent, the meter names the record's one pipeline agent. */
  readonly sessionName?: string;
}

function accessibleNameOf(meter: PipelineAgentMeter, sessionName: string | undefined): string {
  return sessionName === undefined ? meter.accessibleName : `${sessionName}: ${meter.model}, ${meter.effort} effort`;
}

export function AgentMeter({ meter, sessionName }: AgentMeterProps) {
  if (meter === null) return null;
  return (
    <ModelEffortMeter
      model={meter.model}
      effort={meter.effort}
      level={meter.level}
      levelCount={meter.levelCount}
      accessibleName={accessibleNameOf(meter, sessionName)}
      size="node"
    />
  );
}
