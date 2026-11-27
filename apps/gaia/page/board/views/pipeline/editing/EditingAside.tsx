/**
 * The panel of an applied pipeline being edited: the Changes tab first, with the change cards, the tickets in flight and Ask the pipeline
 * agent to check, then the Pipeline agent tab. Over entities the Changes tab groups every level's changes and the agent's tab follows the
 * level shown.
 */
import { useState }                                            from 'react';
import type { BoardPipelineSetupDocument }                     from '../../../../@types/board/BoardPipelineDocuments.ts';
import { CountBadge, Tabs, Text }                              from '../../../../lib/design-system/DesignSystemInterface.ts';
import type { TranscriptFollower }                             from '../../../@types/BoardServices.ts';
import { type BoardClock, useTickingNow }                      from '../../../shared/BoardClock.ts';
import { CommandButton }                                       from '../../../shared/commands/CommandButton.tsx';
import { TimeUtil }                                            from '../../../utils/TimeUtil.ts';
import { PipelinePanel, PipelinePanelBody, PipelinePanelFoot } from '../PipelinePanel.tsx';
import type { PipelineViewFacts }                              from '../PipelineViewModel.ts';
import { AgentMeter }                                          from '../agent-panel/AgentMeter.tsx';
import { PipelineAgentPanel, type AgentPanelLevel }            from '../agent-panel/PipelineAgentPanel.tsx';
import { PipelineAgentPanelModel }                             from '../agent-panel/PipelineAgentPanelModel.ts';
import { ApplyChangesDialogModel }                             from '../apply/ApplyChangesDialogModel.ts';
import { ChangeList }                                          from '../apply/ChangeList.tsx';
import { InFlightNote }                                        from '../apply/InFlightNote.tsx';
import { ChangeGroup }                                         from '../entities/ChangeGroup.tsx';
import { PipelineLevelModel }                                  from '../entities/PipelineLevelModel.ts';
import { BillingStepModel }                                    from '../setup/BillingStepModel.ts';
import { DesignStepModel }                                     from '../setup/DesignStepModel.ts';
import { PipelineEditingModel }                                from './PipelineEditingModel.ts';

type PanelTab = 'changes' | 'agent';

export interface EditingAsideProps {
  readonly facts:            PipelineViewFacts;
  readonly setup:            BoardPipelineSetupDocument;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BoardClock;
  /** The level a draft over entities shows; absent in single mode. */
  readonly levelShown?:      AgentPanelLevel | null;
}

/** Every level's changes, the forge's first, with the entities the check covers under them. */
function LevelChangeGroups({ facts, setupId }: { readonly facts: PipelineViewFacts; readonly setupId: string }) {
  const groups = PipelineEditingModel.levelGroupsOf(facts);
  const coverage = PipelineEditingModel.checkCoverageTextOf(groups);
  if (groups.length === 0) return <p className="board-pipeline-change-list-empty">The draft changes nothing yet.</p>;
  return (
    <>
      {groups.map((group) => <ChangeGroup key={PipelineLevelModel.itemAtLevel(group.level, null)} setupId={setupId} group={group} />)}
      {coverage === null ? null : <Text element="p" muted>{coverage}</Text>}
    </>
  );
}

export function EditingAside({
  facts, setup, followTranscript, clock, levelShown = null
}: EditingAsideProps) {
  const [panelTab, setPanelTab] = useState<PanelTab>(setup.record.mode === 'advise' ? 'agent' : 'changes');
  const now = useTickingNow(clock, false);
  const { record } = setup;
  const flow = facts.pipeline.flow ?? null;
  const changeList = flow?.changeList ?? [];
  const ticketIdsInFlight = flow?.ticketIdsInFlight ?? [];
  const appliedRevision = ApplyChangesDialogModel.appliedRevisionOf(facts.pipeline.applied);
  const versionStepText = PipelineEditingModel.versionStepTextOf(appliedRevision, levelShown !== null);
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
          countBadge:     <CountBadge count={changeList.length} tone="neutral" />,
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
        title={PipelineAgentPanelModel.panelTitleOf(levelShown?.level ?? null)}
        status={PipelineEditingModel.agentStatusOf(PipelineAgentPanelModel.levelSessionOf(setup, levelShown?.level ?? null, facts.jobs).sessionState)}
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
          jobs={facts.jobs}
          levelShown={levelShown}
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
        {levelShown === null
          ? <ChangeList setupId={record.setupId} changeList={changeList} edits={record.edits} editing={PipelineEditingModel.changeListEditingOf(facts)} />
          : <LevelChangeGroups facts={facts} setupId={record.setupId} />}
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
