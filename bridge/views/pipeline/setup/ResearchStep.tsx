/**
 * A1Reading, the research step, as FlowResearch draws it: the agent's status line over the page's title row, what it found by topic in
 * cards two by two and the scripts as a table, grey lines until the first finding comes; beside it the pipeline agent's panel with the
 * research questions as decision cards, Flint reading the repository and the composer. The footer says how far the research is, and
 * offers Stop the pipeline agent and Continue to constitution, which is offered at every moment of the research.
 */
import { ActionBar } from 'design-system/ActionBar';
import { Skeleton }  from 'design-system/Skeleton';
import { Tag }       from 'design-system/Tag';
import { Text }      from 'design-system/Text';
import { View }      from 'design-system/View';

import type { PipelineSetupFacts }                   from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { TranscriptFollower }                   from '../../../conversation/TranscriptLog.tsx';
import { useTickingNow, type BridgeClock }           from '../../../shell/BridgeClock.ts';
import { CommandButton }                             from '../../../shell/CommandButton.tsx';
import { HashRouter }                                from '../../../shell/HashRouter.ts';
import { StateToneUtil }                             from '../../../utils/StateToneUtil.ts';
import { TimeUtil }                                  from '../../../utils/TimeUtil.ts';
import { ViewTitle }                                 from '../../ViewTitle.tsx';
import { PipelinePage }                              from '../PipelinePage.tsx';
import { PipelinePanel }                             from '../PipelinePanel.tsx';
import { PipelineViewModel, type PipelineViewFacts } from '../PipelineViewModel.ts';
import { AgentMeter }                                from '../agent-panel/AgentMeter.tsx';
import { PipelineAgentPanel }                        from '../agent-panel/PipelineAgentPanel.tsx';
import { BillingStepModel }                          from './BillingStepModel.ts';
import { FindingCard }                               from './FindingCard.tsx';
import { ResearchStepModel }                         from './ResearchStepModel.ts';
import { ScriptRows }                                from './ScriptRows.tsx';

export interface ResearchStepProps {
  readonly facts:            PipelineViewFacts;
  readonly setup:            PipelineSetupFacts;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BridgeClock;
}

const SKELETON_LINES = 3;

function launchStampOf(facts: PipelineViewFacts, agentJobId: string | null): string | null {
  if (agentJobId === null) return null;
  return facts.jobs?.find((job) => job.id === agentJobId)?.launchedAt ?? null;
}

export function ResearchStep({
  facts, setup, followTranscript, clock
}: ResearchStepProps) {
  const { record } = setup;
  const state = ResearchStepModel.researchStateOf(setup);
  const now = useTickingNow(clock, state !== 'stopped');
  const status = ResearchStepModel.panelStatusOf(setup);
  const sections = ResearchStepModel.findingSectionsOf(record.findings);
  const scriptRows = ResearchStepModel.scriptRowsOf(record.findings);
  const statusLine = ResearchStepModel.statusLineOf({ setup, agentLaunchedAt: launchStampOf(facts, record.agentJobId) }, now);
  const main = (
    <>
      <View gap="two">
        <span className="bridge-pipeline-research-status" data-state={state}>
          <span className="bridge-pipeline-research-status-dot" aria-hidden="true" />
          {statusLine}
        </span>
        <ViewTitle
          title={ResearchStepModel.headingOf(facts.project ?? '')}
          lead={'The agent finds the stack, the conventions and the scripts. It runs nothing and proposes nothing yet. Tell it what it got '
            + 'wrong or missed, so the design starts from the right facts.'}
        />
      </View>
      {record.findings.length === 0
        ? <Skeleton lines={SKELETON_LINES} accessibleName="Waiting for the first findings" />
        : (
          <>
            <div className="bridge-pipeline-research-cards">
              {sections.map((section) => <FindingCard key={section.topic} section={section} />)}
            </div>
            {scriptRows.length === 0
              ? null
              : (
                <ScriptRows
                  rows={scriptRows}
                  sourceText={ResearchStepModel.scriptsSourceTextOf(record.findings)}
                  countText={ResearchStepModel.scriptCountTextOf(record.findings)}
                />
              )}
          </>
        )}
    </>
  );
  const panel = (
    <PipelinePanel
      label="Pipeline agent"
      title="Pipeline agent"
      status={status}
      headEnd={<AgentMeter meter={BillingStepModel.pipelineAgentMeterOf(record, facts)} />}
    >
      <PipelineAgentPanel
        setup={setup}
        step="research"
        followTranscript={followTranscript}
        todayCalendarDate={TimeUtil.calendarDateOf(now.getTime())}
        composerPlaceholder="Correct a finding, for example: the tests also need Redis"
        showsAgentStrip
      />
    </PipelinePanel>
  );
  const footer = (
    <ActionBar
      label="Research actions"
      start={(
        <>
          <Tag text={status.text} tone="neutral" stateTone={StateToneUtil.toneOf('in-progress')} dot={status.tone === 'working'} />
          <span className="bridge-pipeline-research-footer-status" aria-live="polite">{ResearchStepModel.footerCountsOf(setup)}</span>
          <Text muted>Continue at any time. The agent keeps its findings for the design.</Text>
        </>
      )}
      end={(
        <>
          <CommandButton
            label="Stop the pipeline agent"
            command={ResearchStepModel.stopCommandOf(setup)}
            onApplied={() => HashRouter.navigateTo({ tab: 'pipeline', item: null })}
          />
          <CommandButton
            label="Continue to constitution"
            command={ResearchStepModel.continueCommandOf(setup)}
            primary
            attention={ResearchStepModel.continueHasAttention(setup)}
            onApplied={() => HashRouter.navigateTo(PipelineViewModel.setupStepRouteOf('constitution'))}
          />
        </>
      )}
    />
  );
  return (
    <div className="bridge-pipeline-research" data-state={state}>
      <PipelinePage main={main} panel={panel} footer={footer} />
    </div>
  );
}
