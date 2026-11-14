/**
 * The panel of an applied pipeline being edited (A6Editing): its Changes tab first, the change cards with the tickets in flight under
 * them and Ask the pipeline agent to check in its foot, which sends `pipeline-check` and turns to the agent's tab; then the Pipeline agent
 * tab with the agent's chat and the composer. The head names the selected tab: the version step beside Changes, the agent's state and
 * its model and effort beside Pipeline agent. An advise session, which Ask the pipeline agent opened on the live flow, opens on the
 * agent's tab.
 */
import { CountBadge } from 'design-system/CountBadge';
import { Tabs }       from 'design-system/Tabs';
import { Text }       from 'design-system/Text';
import { useState }   from 'react';

import type { PipelineSetupFacts }                             from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { TranscriptFollower }                             from '../../../conversation/TranscriptLog.tsx';
import { useTickingNow, type BridgeClock }                     from '../../../shell/BridgeClock.ts';
import { CommandButton }                                       from '../../../shell/CommandButton.tsx';
import { TimeUtil }                                            from '../../../utils/TimeUtil.ts';
import { PipelinePanel, PipelinePanelBody, PipelinePanelFoot } from '../PipelinePanel.tsx';
import type { PipelineViewFacts }                              from '../PipelineViewModel.ts';
import { AgentMeter }                                          from '../agent-panel/AgentMeter.tsx';
import { PipelineAgentPanel }                                  from '../agent-panel/PipelineAgentPanel.tsx';
import { ApplyChangesDialogModel }                             from '../apply/ApplyChangesDialogModel.ts';
import { ChangeList }                                          from '../apply/ChangeList.tsx';
import { InFlightNote }                                        from '../apply/InFlightNote.tsx';
import { BillingStepModel }                                    from '../setup/BillingStepModel.ts';
import { DesignStepModel }                                     from '../setup/DesignStepModel.ts';
import { PipelineEditingModel }                                from './PipelineEditingModel.ts';

type PanelTab = 'changes' | 'agent';

export interface EditingAsideProps {
  readonly facts:            PipelineViewFacts;
  readonly setup:            PipelineSetupFacts;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BridgeClock;
}

export function EditingAside({
  facts, setup, followTranscript, clock
}: EditingAsideProps) {
  const [panelTab, setPanelTab] = useState<PanelTab>(setup.record.mode === 'advise' ? 'agent' : 'changes');
  const now = useTickingNow(clock, false);
  const { record } = setup;
  const flow = facts.pipelineFlow ?? null;
  const changeList = flow?.changeList ?? [];
  const ticketIdsInFlight = flow?.ticketIdsInFlight ?? [];
  const appliedRevision = ApplyChangesDialogModel.appliedRevisionOf(facts.pipeline);
  const versionStepText = PipelineEditingModel.versionStepTextOf(appliedRevision);
  const tabs = (
    <Tabs
      label="Changes and the pipeline agent"
      mode="switch"
      size="section"
      selectedKey={panelTab}
      onSelect={setPanelTab}
      items={[
        {
          key:            'changes',
          label:          'Changes',
          countBadge:     <CountBadge count={changeList.length} tone="warn" />,
          accessibleName: DesignStepModel.changesTabNameOf(changeList.length),
        },
        { key: 'agent', label: 'Pipeline agent' },
      ]}
    />
  );
  if (panelTab === 'agent') {
    return (
      <PipelinePanel
        label="Changes"
        title="Pipeline agent"
        status={PipelineEditingModel.agentStatusOf(setup.agentJobState)}
        headEnd={<AgentMeter meter={BillingStepModel.pipelineAgentMeterOf(record, facts)} />}
        tabs={tabs}
        tabPanelLabel="Chat with the pipeline agent"
      >
        <PipelineAgentPanel
          setup={setup}
          step="design"
          followTranscript={followTranscript}
          todayCalendarDate={TimeUtil.calendarDateOf(now.getTime())}
          composerPlaceholder="For example: does the new gate need the network?"
        />
      </PipelinePanel>
    );
  }
  return (
    <PipelinePanel
      label="Changes"
      title="Changes"
      headEnd={versionStepText === null ? null : <Text typeRole="tab" muted>{versionStepText}</Text>}
      tabs={tabs}
      tabPanelLabel="Changes"
    >
      <PipelinePanelBody>
        <ChangeList setupId={record.setupId} changeList={changeList} edits={record.edits} editing={PipelineEditingModel.changeListEditingOf(facts)} />
        <InFlightNote
          ticketIds={ticketIdsInFlight}
          lead={ApplyChangesDialogModel.inFlightLeadOf(ticketIdsInFlight.length)}
          text={ApplyChangesDialogModel.inFlightTextOf(appliedRevision)}
        />
      </PipelinePanelBody>
      <PipelinePanelFoot>
        <CommandButton
          label="Ask the pipeline agent to check"
          command={PipelineEditingModel.checkCommandOf(record.setupId)}
          onApplied={() => setPanelTab('agent')}
        />
      </PipelinePanelFoot>
    </PipelinePanel>
  );
}
