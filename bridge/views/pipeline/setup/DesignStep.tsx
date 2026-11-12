/**
 * A2Proposal, the design step: the proposed flow and its gates area beside the pipeline agent's aside, whose tabs are the agent's chat
 * with the design questions and the change list. The agent's newest change shows under its chat with a link that shows the step on the
 * flow and its Undo. The footer counts the proposed steps and gates, and offers Discard proposal and Apply pipeline, which waits while a
 * question is open and opens the apply dialog, also on its own while an Apply is pending. Until the agent proposes a draft, the flow says
 * that it is designing.
 */
import { useState } from 'react';

import type { PipelineSetupFacts }         from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { TranscriptFollower }         from '../../../conversation/TranscriptLog.tsx';
import { ActionBar }                       from '../../../design-system/ActionBar.tsx';
import { Button, TextButton }              from '../../../design-system/Button.tsx';
import { ModelEffortMeter }                from '../../../design-system/ModelEffortMeter.tsx';
import { Tabs }                            from '../../../design-system/Tabs.tsx';
import { Tag }                             from '../../../design-system/Tag.tsx';
import type { PreferenceStore }            from '../../../preferences/PreferenceStore.ts';
import { useTickingNow, type BridgeClock } from '../../../shell/BridgeClock.ts';
import { CommandButton }                   from '../../../shell/CommandButton.tsx';
import { TimeUtil }                        from '../../../utils/TimeUtil.ts';
import { FlowWorkspace, useFlowSelection } from '../FlowWorkspace.tsx';
import type { FlowSelection }              from '../FlowWorkspace.tsx';
import type { PipelineViewFacts }          from '../PipelineViewModel.ts';
import { PipelineAgentPanel }              from '../agent-panel/PipelineAgentPanel.tsx';
import { ApplyDialog }                     from '../apply/ApplyDialog.tsx';
import { ChangeList }                      from '../apply/ChangeList.tsx';
import { ChangeListModel }                 from '../apply/ChangeListModel.ts';
import { BillingStepModel }                from './BillingStepModel.ts';
import { DesignStepModel }                 from './DesignStepModel.ts';

type AsideTab = 'agent' | 'changes';

export interface DesignStepProps {
  readonly facts:            PipelineViewFacts;
  readonly setup:            PipelineSetupFacts;
  readonly boardStore:       PreferenceStore | null;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BridgeClock;
}

interface NewestAgentChangeProps {
  readonly facts:     PipelineViewFacts;
  readonly setup:     PipelineSetupFacts;
  readonly selection: FlowSelection;
}

/** The change the agent's last reply names, with its links: show the step on the flow, and undo the change. */
function NewestAgentChange({ facts, setup, selection }: NewestAgentChangeProps) {
  const edit = DesignStepModel.newestAgentEditOf(setup.record.edits);
  const flow = facts.pipelineFlow ?? null;
  if (edit === null) return null;
  const target = flow === null ? null : DesignStepModel.flowTargetOf(edit.field, flow);
  return (
    <section className="bridge-pipeline-design-latest-change" aria-label="The agent's newest change">
      <p className="bridge-pipeline-design-latest-change-text">{edit.summary}</p>
      <span className="bridge-pipeline-design-latest-change-links">
        {target === null ? null : <TextButton label={DesignStepModel.showLinkTextOf(edit.field)} onPress={() => selection.showOnFlow(target)} />}
        <CommandButton
          label="Undo this change"
          accessibleName={`Undo the change to ${ChangeListModel.fieldWordsOf(edit.field).title}`}
          command={ChangeListModel.undoCommandOf(setup.record.setupId, edit.editId)}
        />
      </span>
    </section>
  );
}

export function DesignStep({
  facts, setup, boardStore, followTranscript, clock
}: DesignStepProps) {
  const selection = useFlowSelection();
  const [asideTab, setAsideTab] = useState<AsideTab>('agent');
  const [applyIsAsked, setApplyIsAsked] = useState(setup.applyState !== null);
  const { record } = setup;
  const now = useTickingNow(clock, false);
  const agentState = DesignStepModel.agentStateOf(setup);
  const meter = BillingStepModel.pipelineAgentMeterOf(record, facts.pipelineChoices);
  const changeList = facts.pipelineFlow?.changeList ?? [];
  const apply = DesignStepModel.applyAvailabilityOf(setup.openQuestionCount);
  return (
    <div className="bridge-pipeline-design" data-state={agentState}>
      <h2 className="bridge-visually-hidden">Pipeline design</h2>
      <div className="bridge-pipeline-design-body">
        <div className="bridge-pipeline-design-main">
          {record.draft === null ? <p className="bridge-pipeline-design-pending" role="status">The pipeline agent is designing…</p> : null}
          <FlowWorkspace facts={facts} boardStore={boardStore} selection={selection} />
        </div>

        <aside className="bridge-pipeline-design-aside" aria-label="Pipeline agent">
          <Tabs
            label="Pipeline agent and changes"
            mode="switch"
            size="section"
            selectedKey={asideTab}
            onSelect={setAsideTab}
            items={[
              { key: 'agent', label: 'Pipeline agent' },
              {
                key:            'changes',
                label:          'Changes',
                count:          { count: changeList.length, tone: 'warn' },
                accessibleName: DesignStepModel.changesTabNameOf(changeList.length),
              },
            ]}
          />
          {asideTab === 'agent'
            ? (
              <div className="bridge-pipeline-design-aside-panel" role="tabpanel" aria-label="Chat with the pipeline agent">
                <div className="bridge-pipeline-design-agent-head">
                  <span className="bridge-pipeline-design-status" data-state={agentState}>
                    <span className="bridge-pipeline-design-status-dot" aria-hidden="true" />
                    {DesignStepModel.statusLineOf(setup)}
                  </span>
                  <ModelEffortMeter
                    model={meter.model}
                    effort={meter.effort}
                    level={meter.level}
                    levelCount={meter.levelCount}
                    accessibleName={meter.accessibleName}
                    size="node"
                  />
                </div>
                <PipelineAgentPanel
                  setup={setup}
                  step="design"
                  variant="aside"
                  followTranscript={followTranscript}
                  todayCalendarDate={TimeUtil.calendarDateOf(now.getTime())}
                  composerPlaceholder="For example: run the tests with --bail so a red build stops early"
                  afterChat={<NewestAgentChange facts={facts} setup={setup} selection={selection} />}
                />
              </div>
            )
            : (
              <div className="bridge-pipeline-design-aside-panel" role="tabpanel" aria-label="Changes">
                <ChangeList setupId={record.setupId} changeList={changeList} edits={record.edits} />
              </div>
            )}
        </aside>
      </div>

      <ActionBar
        label="Pipeline design actions"
        start={(
          <>
            <Tag text="Proposal" tone="warn" pops />
            <span className="bridge-pipeline-design-summary">{DesignStepModel.footerSummaryOf(setup.summary)}</span>
            <span className="bridge-pipeline-design-hint" data-tone={apply.hint.tone} role="status">
              {apply.hint.tone === 'question-open' ? <span className="bridge-pipeline-design-hint-dot" aria-hidden="true" /> : null}
              {apply.hint.text}
            </span>
          </>
        )}
        end={(
          <>
            <CommandButton label="Discard proposal" command={DesignStepModel.discardCommandOf(record.setupId)} />
            <span className="bridge-pipeline-design-apply" title={apply.disabledReason ?? undefined}>
              <Button
                label="Apply pipeline"
                emphasis="primary"
                attention={apply.enabled}
                disabled={!apply.enabled}
                expanded={applyIsAsked}
                onPress={() => setApplyIsAsked(true)}
              />
            </span>
          </>
        )}
      />
      {applyIsAsked
        ? (
          <ApplyDialog
            setup={setup}
            pendingTicketCount={BillingStepModel.pendingTicketCountOf(facts.page?.tickets ?? [])}
            concurrencyLimit={facts.concurrency?.limit ?? null}
            onClose={() => setApplyIsAsked(false)}
          />
        )
        : null}
    </div>
  );
}
