/**
 * A1Reading, the research step: the pipeline agent's status line and its meter, what it found by topic and the scripts, grey lines until
 * the first finding comes, then the agent panel with the research questions side by side and the composer. The footer says how far the
 * research is, and offers Stop the pipeline agent and Continue to constitution, which is offered at every moment of the research.
 */
import type { PipelineSetupFacts }                   from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { TranscriptFollower }                   from '../../../conversation/TranscriptLog.tsx';
import { ActionBar }                                 from '../../../design-system/ActionBar.tsx';
import { BusyIndicator }                             from '../../../design-system/BusyIndicator.tsx';
import { ModelEffortMeter }                          from '../../../design-system/ModelEffortMeter.tsx';
import { Skeleton }                                  from '../../../design-system/Skeleton.tsx';
import { useTickingNow, type BridgeClock }           from '../../../shell/BridgeClock.ts';
import { CommandButton }                             from '../../../shell/CommandButton.tsx';
import { HashRouter }                                from '../../../shell/HashRouter.ts';
import { TimeUtil }                                  from '../../../utils/TimeUtil.ts';
import { PipelineViewModel, type PipelineViewFacts } from '../PipelineViewModel.ts';
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
  const meter = BillingStepModel.pipelineAgentMeterOf(record, facts);
  const sections = ResearchStepModel.findingSectionsOf(record.findings);
  const scriptRows = ResearchStepModel.scriptRowsOf(record.findings);
  const statusLine = ResearchStepModel.statusLineOf({ setup, agentLaunchedAt: launchStampOf(facts, record.agentJobId) }, now);
  return (
    <div className="bridge-pipeline-research" data-state={state}>
      <section className="bridge-pipeline-research-hero">
        <div className="bridge-pipeline-research-hero-text">
          <span className="bridge-pipeline-research-status" data-state={state}>
            <span className="bridge-pipeline-research-status-dot" aria-hidden="true" />
            {statusLine}
          </span>
          <h2 className="bridge-pipeline-setup-heading">{ResearchStepModel.headingOf(facts.project ?? '')}</h2>
          <p className="bridge-pipeline-setup-lead">
            The agent finds the stack and the scripts. It runs nothing and proposes nothing yet. Tell it below what it got wrong or missed, so
            the design starts from the right facts.
          </p>
        </div>
        {meter === null
          ? null
          : (
            <ModelEffortMeter
              model={meter.model}
              effort={meter.effort}
              level={meter.level}
              levelCount={meter.levelCount}
              accessibleName={meter.accessibleName}
              size="node"
            />
          )}
      </section>

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

      <PipelineAgentPanel
        setup={setup}
        step="research"
        variant="inline"
        followTranscript={followTranscript}
        todayCalendarDate={TimeUtil.calendarDateOf(now.getTime())}
        composerPlaceholder="Correct a finding, for example: the tests also need Redis, and dev is not used"
      />

      <ActionBar
        label="Research actions"
        start={(
          <>
            {state === 'researching' ? <BusyIndicator shape="spinner" accessibleName="Researching" /> : null}
            <span className="bridge-pipeline-research-footer-status" aria-live="polite">{ResearchStepModel.footerStatusOf(setup)}</span>
            <span className="bridge-pipeline-research-footer-hint">User moves on when ready; the agent keeps the findings for the design.</span>
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
    </div>
  );
}
