/**
 * A1Reading, the research step, as FlowResearch draws it: the agent's status line over the page's title row, what it found by topic in
 * cards two by two and the scripts as a table, grey lines until the first finding comes; beside it the pipeline agent's panel with the
 * research questions as decision cards, Flint reading the repository and the composer. The footer says how far the research is, and
 * offers Stop the pipeline agent and Continue to constitution, which is offered at every moment of the research.
 * In monorepo mode (MonoResearch) the layout the agent reports comes first; once entities have sessions of their own, the sessions list
 * stands beside the findings of the session shown, which the route's level holds, and the panel holds that session's chat. Each live
 * session has its own Stop, and the footer offers Stop all and Continue to the next step. No setting limits how many sessions run.
 */

import type { ReactNode }                                                from 'react';
import type { BoardPipelineSetupDocument, BoardResearchFindingDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  ActionBar,
  MonoId,
  Skeleton,
  Tag,
  Text,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import type { TranscriptFollower }                   from '../../../@types/BoardServices.ts';
import { type BoardClock, useTickingNow }            from '../../../shell/BoardClock.ts';
import { useBoardHrefOf, useBoardNavigation }        from '../../../shell/BoardRouteLinks.ts';
import type { BoardRoute }                           from '../../../shell/BoardRouter.ts';
import { CommandButton }                             from '../../../shell/CommandButton.tsx';
import { StateToneUtil }                             from '../../../utils/StateToneUtil.ts';
import { TimeUtil }                                  from '../../../utils/TimeUtil.ts';
import { ViewTitle }                                 from '../../ViewTitle.tsx';
import { PipelinePage }                              from '../PipelinePage.tsx';
import { PipelinePanel }                             from '../PipelinePanel.tsx';
import { PipelineViewModel, type PipelineViewFacts } from '../PipelineViewModel.ts';
import { NotLaunchedJob }                            from '../agent/NotLaunchedJob.tsx';
import { AgentMeter }                                from '../agent-panel/AgentMeter.tsx';
import { AgentSessionModel }                         from '../agent-panel/AgentSessionModel.ts';
import { PipelineAgentPanel }                        from '../agent-panel/PipelineAgentPanel.tsx';
import { PipelineAgentPanelModel }                   from '../agent-panel/PipelineAgentPanelModel.ts';
import { PipelineLevelModel, type PipelineLevel }    from '../entities/PipelineLevelModel.ts';
import { BillingStepModel }                          from './BillingStepModel.ts';
import { EntitySessionList }                         from './EntitySessionList.tsx';
import { EntitySessionListModel }                    from './EntitySessionListModel.ts';
import { FindingCard }                               from './FindingCard.tsx';
import { LayoutFinding }                             from './LayoutFinding.tsx';
import { ResearchStepModel }                         from './ResearchStepModel.ts';
import { ScriptRows }                                from './ScriptRows.tsx';

export interface ResearchStepProps {
  readonly facts:            PipelineViewFacts;
  readonly setup:            BoardPipelineSetupDocument;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BoardClock;
  /** The route the step is on; in monorepo mode it names the level shown. */
  readonly route:            BoardRoute;
}

const SKELETON_LINES = 3;

const RESEARCH_ITEM = 'setup/research';

const SINGLE_MODE_LEAD = 'The agent finds the stack, the conventions and the scripts. It runs nothing and proposes nothing yet. Tell it what it got '
  + 'wrong or missed, so the design starts from the right facts.';

const MONOREPO_LEAD = 'The agent reports the layout first, then researches each codebase on its own. It runs nothing and proposes nothing yet. '
  + 'Tell it what it got wrong, per entity.';

const SINGLE_MODE_PLACEHOLDER = 'Correct a finding, for example: the tests also need Redis';

const MONOREPO_PLACEHOLDER = 'Correct a finding of this entity, for example: e2e also needs Redis';

/** Stands for the findings while forge did not start the agent, in place of grey lines that would read as work under way. */
const NOT_LAUNCHED_EMPTY_TEXT = 'Nothing found yet: forge has not started the agent.';

const SINGLE_MODE_FOOTER_NOTE = 'Continue at any time. The agent keeps its findings for the design.';

const MONOREPO_FOOTER_NOTE = 'Continue at any time. Stopped entities keep what they found.';

/** The findings of one session as cards by topic and the scripts as rows; grey lines stand in before the first. */
function SessionFindings({ findings, emptyText = null }: { readonly findings: readonly BoardResearchFindingDocument[]; readonly emptyText?: string | null }) {
  if (findings.length === 0) {
    return emptyText === null
      ? <Skeleton lines={SKELETON_LINES} accessibleName="Waiting for the first findings" />
      : <Text muted>{emptyText}</Text>;
  }
  const sections = ResearchStepModel.findingSectionsOf(findings);
  const scriptRows = ResearchStepModel.scriptRowsOf(findings);
  return (
    <>
      <div className="board-pipeline-research-cards">
        {sections.map((section) => <FindingCard key={section.topic} section={section} />)}
      </div>
      {scriptRows.length === 0
        ? null
        : (
          <ScriptRows
            rows={scriptRows}
            sourceText={ResearchStepModel.scriptsSourceTextOf(findings)}
            countText={ResearchStepModel.scriptCountTextOf(findings)}
          />
        )}
    </>
  );
}

function launchStampOf(facts: PipelineViewFacts, agentJobId: string | null): string | null {
  if (agentJobId === null) return null;
  return facts.jobs?.find((job) => job.id === agentJobId)?.launchedAt ?? null;
}

/** The monorepo parts of the page: the session the route's level shows, the sessions list, and the commands that stop them. */
interface MonorepoResearch {
  readonly level:   PipelineLevel;
  readonly routeOf: (level: PipelineLevel) => BoardRoute;
  readonly rows:    ReturnType<typeof EntitySessionListModel.rowsOf>;
  readonly shown:   ReturnType<typeof EntitySessionListModel.selectedSessionOf>;
}

function routeOfLevel(level: PipelineLevel): BoardRoute {
  return PipelineLevelModel.routeAtLevel(level, RESEARCH_ITEM);
}

function monorepoResearchOf(facts: PipelineViewFacts, setup: BoardPipelineSetupDocument, routedLevel: PipelineLevel | null): MonorepoResearch | null {
  const sessionFacts = { setup, shownEntities: PipelineViewModel.entitiesShownOf(facts), jobs: facts.jobs };
  if (!EntitySessionListModel.hasEntitySessions(sessionFacts)) return null;
  const level = EntitySessionListModel.shownLevelOf(sessionFacts, routedLevel);
  return {
    level,
    routeOf: routeOfLevel,
    rows:    EntitySessionListModel.rowsOf(sessionFacts, level),
    shown:   EntitySessionListModel.selectedSessionOf(sessionFacts, level),
  };
}

function SessionsAndFindings({ research }: { readonly research: MonorepoResearch }) {
  const { shown, rows } = research;
  const navigateTo = useBoardNavigation();
  return (
    <div className="board-research-columns">
      <EntitySessionList
        rows={rows}
        countText={EntitySessionListModel.countTextOf(rows)}
        onSelect={(level) => navigateTo(PipelineLevelModel.routeAtLevel(level, RESEARCH_ITEM))}
      />
      <section className="board-research-session-findings" aria-label={`Findings of ${shown.name}`}>
        <span className="board-research-session-findings-head">
          {PipelineLevelModel.isForgeLevel(shown.level) ? <Text bold>{shown.name}</Text> : <MonoId text={shown.name} tone="strong" weight="bold" />}
          <Text typeRole="small" muted>{shown.scopeText}</Text>
        </span>
        <SessionFindings findings={shown.findings} emptyText={shown.emptyText} />
      </section>
    </div>
  );
}

interface ResearchPageProps extends ResearchStepProps {
  /** The level the route names in monorepo mode; `null` in single mode, which follows no route. */
  readonly routedLevel: PipelineLevel | null;
}

export function ResearchStep(props: ResearchStepProps) {
  const routedLevel = PipelineViewModel.monorepoModeOf(props.facts) ? PipelineLevelModel.leveledItemOf(props.route.item).level : null;
  return <ResearchPage {...props} routedLevel={routedLevel} />;
}

function ResearchPage({
  facts, setup, followTranscript, clock, routedLevel
}: ResearchPageProps) {
  const { record } = setup;
  const sessionState = AgentSessionModel.setupSessionStateOf(setup, facts.jobs);
  const state = ResearchStepModel.researchStateOf(setup, sessionState);
  const now = useTickingNow(clock, ResearchStepModel.researchIsUnderWay(state));
  const monorepoMode = PipelineViewModel.monorepoModeOf(facts);
  const research = monorepoMode ? monorepoResearchOf(facts, setup, routedLevel) : null;
  const boardHrefOf = useBoardHrefOf();
  const navigateTo = useBoardNavigation();
  const levelShown = research === null ? null : { level: research.level, hrefOf: (level: PipelineLevel) => boardHrefOf(research.routeOf(level)) };
  const notLaunched = ResearchStepModel.notLaunchedOf(setup, facts.jobs);
  const status = research === null ? ResearchStepModel.panelStatusOf(state) : EntitySessionListModel.panelStatusOf(research.shown.state);
  const layoutItems = ResearchStepModel.layoutItemsOf(record.findings);
  const statusLine = ResearchStepModel.statusLineOf({ setup, sessionState, agentLaunchedAt: launchStampOf(facts, record.agentJobId) }, now);
  const continueStep = ResearchStepModel.continueStepOf(PipelineViewModel.setupStepsOf(record));
  let findingsPart: ReactNode = <SessionFindings findings={record.findings} emptyText={state === 'not-launched' ? NOT_LAUNCHED_EMPTY_TEXT : null} />;
  if (research !== null) findingsPart = <SessionsAndFindings research={research} />;
  const main = (
    <>
      <View gap="two">
        <span className="board-pipeline-research-status" data-state={state}>
          <span className="board-pipeline-research-status-dot" aria-hidden="true" />
          {statusLine}
        </span>
        <ViewTitle title={ResearchStepModel.headingOf(facts.project ?? '')} lead={monorepoMode ? MONOREPO_LEAD : SINGLE_MODE_LEAD} />
      </View>
      {notLaunched === null ? null : <NotLaunchedJob jobId={record.agentJobId} notLaunched={notLaunched} agent={facts.agent} choiceMode="setup" />}
      {monorepoMode && layoutItems.length > 0
        ? <LayoutFinding items={layoutItems} sourcePaths={ResearchStepModel.layoutSourcePathsOf(record.findings)} />
        : null}
      {findingsPart}
    </>
  );
  const sessionName = levelShown === null ? undefined : PipelineAgentPanelModel.panelTitleOf(levelShown.level);
  const panel = (
    <PipelinePanel
      label="Pipeline agent"
      title={sessionName ?? 'Pipeline agent'}
      status={status}
      headEnd={<AgentMeter meter={BillingStepModel.pipelineAgentMeterOf(record, facts)} {...(sessionName === undefined ? {} : { sessionName })} />}
    >
      <PipelineAgentPanel
        setup={setup}
        step="research"
        jobs={facts.jobs}
        followTranscript={followTranscript}
        todayCalendarDate={TimeUtil.calendarDateOf(now.getTime())}
        composerPlaceholder={research === null ? SINGLE_MODE_PLACEHOLDER : MONOREPO_PLACEHOLDER}
        showsAgentStrip
        levelShown={levelShown}
      />
    </PipelinePanel>
  );
  const stopEvery = research === null ? null : EntitySessionListModel.stopEveryCommandsOf(research.rows);
  const footer = (
    <ActionBar
      label="Research actions"
      start={(
        <>
          {status.tone === 'failed'
            ? <Tag text={status.text} tone="error" />
            : <Tag text={status.text} tone="neutral" stateTone={StateToneUtil.toneOf('in-progress')} dot={status.tone === 'working'} />}
          <span className="board-pipeline-research-footer-status" aria-live="polite">
            {research === null ? ResearchStepModel.footerCountsOf(setup) : EntitySessionListModel.footerCountsOf(research.rows)}
          </span>
          <Text muted>{research === null ? SINGLE_MODE_FOOTER_NOTE : MONOREPO_FOOTER_NOTE}</Text>
        </>
      )}
      end={(
        <>
          {stopEvery === null
            ? (
              <CommandButton
                label="Stop the pipeline agent"
                command={ResearchStepModel.stopCommandOf(setup)}
                onApplied={() => navigateTo({ tab: 'pipeline', item: null })}
              />
            )
            : (
              <CommandButton
                label="Stop all"
                accessibleName="Stop every research session"
                command={stopEvery}
                onApplied={() => navigateTo({ tab: 'pipeline', item: null })}
              />
            )}
          <CommandButton
            label={`Continue to ${continueStep}`}
            command={ResearchStepModel.continueCommandOf(setup)}
            primary
            attention={ResearchStepModel.continueHasAttention(setup)}
            onApplied={() => navigateTo(PipelineViewModel.setupStepRouteOf(continueStep))}
          />
        </>
      )}
    />
  );
  return (
    <div className="board-pipeline-research" data-state={state}>
      <PipelinePage main={main} panel={panel} footer={footer} />
    </div>
  );
}
