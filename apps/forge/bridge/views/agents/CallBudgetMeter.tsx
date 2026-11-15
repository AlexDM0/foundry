/** A job's calls against its budget: a fill meter in its role's lane colour and the figure, "used · none" for a session with no budget. */
import { FillMeter } from 'design-system/FillMeter';

import type { DisplayState }     from '../../../src/lib/tracker-model/@types/Task.ts';
import { StateToneUtil }         from '../../utils/StateToneUtil.ts';
import type { AgentJobDocument } from './AgentJobDocument.ts';
import { AgentsModel }           from './AgentsModel.ts';

export interface CallBudgetMeterProps {
  readonly job:       AgentJobDocument;
  readonly laneState: DisplayState;
}

export function CallBudgetMeter({ job, laneState }: CallBudgetMeterProps) {
  const meter = AgentsModel.budgetMeterOf(job);
  return (
    <div className="agents-budget">
      <span className="agents-budget-meter">
        <FillMeter label={meter.label} used={meter.used} limit={meter.limit} near={meter.near} tone={StateToneUtil.toneOf(laneState)} />
      </span>
      <span className="agents-budget-figure" data-near={meter.near ? '' : undefined}>
        {meter.limit === null
          ? (
            <>
              {meter.used}
              <span className="agents-muted"> · none</span>
            </>
          )
          : `${meter.used} / ${meter.limit}`}
      </span>
    </div>
  );
}
