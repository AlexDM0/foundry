/**
 * The live flow's aside (A5Live): the "On the flow" tab lists what runs now, one row per ticket or draft on the flow linking to its detail,
 * then the newest pipeline records; the Pipeline agent tab says that no agent runs until one is asked. Under both, Ask the pipeline agent
 * sends `pipeline-agent-advise` and turns to the agent's tab; the advise session it opens then shows as an edit of the pipeline.
 */
import { useState } from 'react';

import { ActivityRow }                              from '../../../design-system/ActivityRow.tsx';
import { MicroCapsLabel }                           from '../../../design-system/MicroCapsLabel.tsx';
import { ModelEffortMeter }                         from '../../../design-system/ModelEffortMeter.tsx';
import { Tabs }                                     from '../../../design-system/Tabs.tsx';
import { useTickingNow, type BridgeClock }          from '../../../shell/BridgeClock.ts';
import { CommandButton }                            from '../../../shell/CommandButton.tsx';
import type { PipelineViewFacts }                   from '../PipelineViewModel.ts';
import { FlowActivityPanelModel, type StampFormat } from './FlowActivityPanelModel.ts';
import { LivePipelineModel }                        from './LivePipelineModel.ts';

type ActivityTab = 'flow' | 'agent';

export interface FlowActivityPanelProps {
  readonly facts:       PipelineViewFacts;
  readonly stampFormat: StampFormat | null;
  readonly clock:       BridgeClock;
}

export function FlowActivityPanel({ facts, stampFormat, clock }: FlowActivityPanelProps) {
  const [activityTab, setActivityTab] = useState<ActivityTab>('flow');
  const flow = facts.pipelineFlow ?? null;
  const occupantCount = flow?.occupants.length ?? 0;
  const now = useTickingNow(clock, occupantCount > 0);
  const rows = flow === null ? [] : FlowActivityPanelModel.activityRowsOf(flow, facts.pipelineChoices?.efforts ?? [], now);
  const historyLines = FlowActivityPanelModel.historyLinesOf(facts.pipelineHistory ?? [], stampFormat);
  return (
    <aside className="bridge-pipeline-activity" aria-label="Activity">
      <Tabs
        label="Activity and the pipeline agent"
        mode="switch"
        size="section"
        selectedKey={activityTab}
        onSelect={setActivityTab}
        items={[{ key: 'flow', label: 'On the flow' }, { key: 'agent', label: 'Pipeline agent' }]}
      />
      {activityTab === 'flow'
        ? (
          <div className="bridge-pipeline-activity-panel" role="tabpanel" aria-label="On the flow">
            <MicroCapsLabel text={FlowActivityPanelModel.nowHeadingOf(rows.length)} element="h3" />
            {rows.length === 0
              ? <p className="bridge-pipeline-activity-empty">Nothing is on the flow now.</p>
              : (
                <ul className="bridge-pipeline-activity-rows">
                  {rows.map((row) => (
                    <li key={row.key}>
                      <ActivityRow
                        href={row.href}
                        status={row.status}
                        idText={row.idText}
                        stepText={row.stepText}
                        elapsed={row.elapsed}
                        {...(row.meter === null
                          ? {}
                          : {
                            meter: (
                              <ModelEffortMeter
                                model={row.meter.model}
                                effort={row.meter.effort}
                                level={row.meter.level}
                                levelCount={row.meter.levelCount}
                                accessibleName={row.meter.accessibleName}
                                size="node"
                              />
                            )
                          })}
                      />
                    </li>
                  ))}
                </ul>
              )}
            {historyLines.length === 0
              ? null
              : (
                <>
                  <MicroCapsLabel text="Earlier" element="h3" />
                  <ul className="bridge-pipeline-activity-history">
                    {historyLines.map((line) => (
                      <li key={line.key} className="bridge-pipeline-activity-history-line">
                        {line.clock === null ? null : <span className="bridge-pipeline-activity-history-clock">{line.clock}</span>}
                        {line.text}
                      </li>
                    ))}
                  </ul>
                </>
              )}
          </div>
        )
        : (
          <div className="bridge-pipeline-activity-panel" role="tabpanel" aria-label="Pipeline agent">
            <p className="bridge-pipeline-activity-empty">
              No pipeline agent runs now. Ask it to read the pipeline and the gate history: it proposes changes as an edit to apply.
            </p>
          </div>
        )}
      <div className="bridge-pipeline-activity-foot">
        <CommandButton label="Ask the pipeline agent" command={LivePipelineModel.adviseCommand} onApplied={() => setActivityTab('agent')} />
      </div>
    </aside>
  );
}
