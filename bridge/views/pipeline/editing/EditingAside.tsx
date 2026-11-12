/**
 * The aside of an applied pipeline being edited (A6Editing): its Changes tab first, the change cards with the tickets in flight under
 * them, then the Pipeline agent tab with the agent's chat; under both, Ask the pipeline agent to check sends `pipeline-check` and turns to
 * the agent's tab. An advise session, which Ask the pipeline agent opened on the live flow, opens on the agent's tab.
 */
import { useState } from 'react';

import type { PipelineSetupFacts }         from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { TranscriptFollower }         from '../../../conversation/TranscriptLog.tsx';
import { Tabs }                            from '../../../design-system/Tabs.tsx';
import { useTickingNow, type BridgeClock } from '../../../shell/BridgeClock.ts';
import { CommandButton }                   from '../../../shell/CommandButton.tsx';
import { TimeUtil }                        from '../../../utils/TimeUtil.ts';
import type { PipelineViewFacts }          from '../PipelineViewModel.ts';
import { PipelineAgentPanel }              from '../agent-panel/PipelineAgentPanel.tsx';
import { ApplyChangesDialogModel }         from '../apply/ApplyChangesDialogModel.ts';
import { ChangeList }                      from '../apply/ChangeList.tsx';
import { InFlightNote }                    from '../apply/InFlightNote.tsx';
import { DesignStepModel }                 from '../setup/DesignStepModel.ts';
import { PipelineEditingModel }            from './PipelineEditingModel.ts';

type AsideTab = 'changes' | 'agent';

export interface EditingAsideProps {
  readonly facts:            PipelineViewFacts;
  readonly setup:            PipelineSetupFacts;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BridgeClock;
}

export function EditingAside({
  facts, setup, followTranscript, clock
}: EditingAsideProps) {
  const [asideTab, setAsideTab] = useState<AsideTab>(setup.record.mode === 'advise' ? 'agent' : 'changes');
  const now = useTickingNow(clock, false);
  const { record } = setup;
  const flow = facts.pipelineFlow ?? null;
  const changeList = flow?.changeList ?? [];
  const ticketIdsInFlight = flow?.ticketIdsInFlight ?? [];
  const appliedRevision = ApplyChangesDialogModel.appliedRevisionOf(facts.pipeline);
  return (
    <aside className="bridge-pipeline-editing-aside" aria-label="Changes">
      <Tabs
        label="Changes and the pipeline agent"
        mode="switch"
        size="section"
        selectedKey={asideTab}
        onSelect={setAsideTab}
        items={[
          {
            key:            'changes',
            label:          'Changes',
            count:          { count: changeList.length, tone: 'warn' },
            accessibleName: DesignStepModel.changesTabNameOf(changeList.length),
          },
          { key: 'agent', label: 'Pipeline agent' },
        ]}
      />
      {asideTab === 'changes'
        ? (
          <div className="bridge-pipeline-editing-aside-panel" role="tabpanel" aria-label="Changes">
            <ChangeList
              setupId={record.setupId}
              changeList={changeList}
              edits={record.edits}
              editing={PipelineEditingModel.changeListEditingOf(facts)}
            />
            <InFlightNote
              ticketIds={ticketIdsInFlight}
              lead={ApplyChangesDialogModel.inFlightLeadOf(ticketIdsInFlight.length)}
              text={ApplyChangesDialogModel.inFlightTextOf(appliedRevision)}
            />
          </div>
        )
        : (
          <div className="bridge-pipeline-editing-aside-panel" role="tabpanel" aria-label="Chat with the pipeline agent">
            <PipelineAgentPanel
              setup={setup}
              step="design"
              variant="aside"
              followTranscript={followTranscript}
              todayCalendarDate={TimeUtil.calendarDateOf(now.getTime())}
              composerPlaceholder="For example: does the new gate need the network?"
            />
          </div>
        )}
      <div className="bridge-pipeline-editing-aside-foot">
        <CommandButton
          label="Ask the pipeline agent to check"
          command={PipelineEditingModel.checkCommandOf(record.setupId)}
          onApplied={() => setAsideTab('agent')}
        />
      </div>
    </aside>
  );
}
