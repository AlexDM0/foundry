/**
 * A2Proposal, the design step: the Focus layout of the proposed flow, with the pipeline agent's panel in its right column, whose tabs are
 * the Conversation (the agent's chat with the design questions as decision cards, Flint's strip and the composer) and the change list.
 * The agent's newest change shows under its chat with a link that opens the step's phase and selects it, and its Undo. The footer says
 * that nothing is stored before Apply, counts the proposed steps and gates, and offers Discard proposal and Apply pipeline, which waits
 * while a question is open and opens the apply dialog, also on its own while an Apply is pending. Until the agent proposes a draft, a
 * line over the phases says that it is designing.
 */

import { ActionBar }  from 'design-system/ActionBar';
import { Button }     from 'design-system/Button';
import { CountBadge } from 'design-system/CountBadge';
import { Tabs }       from 'design-system/Tabs';
import { Tag }        from 'design-system/Tag';
import { Text }       from 'design-system/Text';
import { TextButton } from 'design-system/TextButton';
import { useState }   from 'react';

import type { PipelineSetupFacts }                   from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { TranscriptFollower }                   from '../../../conversation/TranscriptLog.tsx';
import { useTickingNow, type BridgeClock }           from '../../../shell/BridgeClock.ts';
import { CommandButton }                             from '../../../shell/CommandButton.tsx';
import { TimeUtil }                                  from '../../../utils/TimeUtil.ts';
import { FlowWorkspace }                             from '../FlowWorkspace.tsx';
import { PipelinePanel, PipelinePanelBody }          from '../PipelinePanel.tsx';
import { PipelineViewModel, type PipelineViewFacts } from '../PipelineViewModel.ts';
import { AgentMeter }                                from '../agent-panel/AgentMeter.tsx';
import { PipelineAgentPanel }                        from '../agent-panel/PipelineAgentPanel.tsx';
import { ApplyDialog }                               from '../apply/ApplyDialog.tsx';
import { ChangeList }                                from '../apply/ChangeList.tsx';
import { ChangeListModel }                           from '../apply/ChangeListModel.ts';
import { FlowGlyph }                                 from '../flow/FlowGlyph.tsx';
import { useFlowSelection, type FlowSelection }      from '../flow/FlowSelection.ts';
import { BillingStepModel }                          from './BillingStepModel.ts';
import { DesignStepModel }                           from './DesignStepModel.ts';

type PanelTab = 'conversation' | 'changes';

export interface DesignStepProps {
  readonly facts:            PipelineViewFacts;
  readonly setup:            PipelineSetupFacts;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BridgeClock;
  /** Called with the board's resume choice once the Overseer took the Apply. */
  readonly onApplySent?:     (resumesBoard: boolean) => void;
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
  facts, setup, followTranscript, clock, onApplySent
}: DesignStepProps) {
  const selection = useFlowSelection();
  const [panelTab, setPanelTab] = useState<PanelTab>('conversation');
  const [applyIsAsked, setApplyIsAsked] = useState(setup.applyState !== null);
  const { record } = setup;
  const now = useTickingNow(clock, false);
  const changeList = facts.pipelineFlow?.changeList ?? [];
  const apply = DesignStepModel.applyAvailabilityOf(setup.openQuestionCount);
  const words = PipelineViewModel.flowPageWordsOf('proposal', facts.pipelineFlow ?? null, null);
  const panel = (
    <PipelinePanel
      label="Pipeline agent"
      title="Pipeline agent"
      status={DesignStepModel.panelStatusOf(setup)}
      headEnd={<AgentMeter meter={BillingStepModel.pipelineAgentMeterOf(record, facts)} />}
      tabs={(
        <Tabs
          label="Pipeline agent and changes"
          mode="switch"
          size="section"
          selectedKey={panelTab}
          onSelect={setPanelTab}
          items={[
            { key: 'conversation', label: 'Conversation' },
            {
              key:            'changes',
              label:          'Changes',
              countBadge:     <CountBadge count={changeList.length} tone="neutral" />,
              accessibleName: DesignStepModel.changesTabNameOf(changeList.length),
            },
          ]}
        />
      )}
      tabPanelLabel={panelTab === 'conversation' ? 'Chat with the pipeline agent' : 'Changes'}
    >
      {panelTab === 'conversation'
        ? (
          <PipelineAgentPanel
            setup={setup}
            step="design"
            followTranscript={followTranscript}
            todayCalendarDate={TimeUtil.calendarDateOf(now.getTime())}
            composerPlaceholder="Ask for a change, or ask why"
            afterChat={<NewestAgentChange facts={facts} setup={setup} selection={selection} />}
            showsAgentStrip
          />
        )
        : (
          <PipelinePanelBody>
            <ChangeList setupId={record.setupId} changeList={changeList} edits={record.edits} />
          </PipelinePanelBody>
        )}
    </PipelinePanel>
  );
  const footer = (
    <ActionBar
      label="Pipeline design actions"
      start={(
        <>
          <Tag text="Proposal" tone="neutral" />
          <Text bold>Nothing is stored until you apply.</Text>
          <Text muted>{DesignStepModel.footerSummaryOf(setup.summary)}</Text>
        </>
      )}
      end={(
        <>
          <span className="bridge-pipeline-design-hint" data-tone={apply.hint.tone} role="status">
            {apply.hint.tone === 'question-open'
              ? <span className="bridge-pipeline-design-hint-dot" aria-hidden="true" />
              : <FlowGlyph glyph="check" />}
            {apply.hint.text}
          </span>
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
  );
  return (
    <div className="bridge-pipeline-design" data-state={DesignStepModel.agentStateOf(setup)}>
      <FlowWorkspace
        facts={facts}
        selection={selection}
        title={words.title}
        lead={words.lead}
        notice={record.draft === null ? <div role="status"><Text element="p" muted>The pipeline agent is designing…</Text></div> : null}
        aside={panel}
        footer={footer}
      />
      {applyIsAsked
        ? (
          <ApplyDialog
            setup={setup}
            pendingTicketCount={BillingStepModel.pendingTicketCountOf(facts.page?.tickets ?? [])}
            concurrencyLimit={facts.concurrency?.limit ?? null}
            onClose={() => setApplyIsAsked(false)}
            {...(onApplySent === undefined ? {} : { onApplySent })}
          />
        )
        : null}
    </div>
  );
}
