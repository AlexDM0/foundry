/**
 * The Pipeline tab: the screen `PipelineViewModel.screenOf` picks from the board's pipeline facts and the route, drawn as a setup step, the
 * Focus layout of the flow, or one level's page in monorepo mode. One modal dialog is open at a time, and an Apply sent from this view
 * shows its toast once the facts carry the version it made.
 */
import { useEffect, useState }                                        from 'react';
import type { BoardPipelineFlowDocument, BoardPipelineSetupDocument } from '../../../@types/board/BoardPipelineDocuments.ts';
import {
  ActionBar,
  Button,
  Tag,
  Text,
  TextButton,
  Toast
} from '../../../lib/design-system/DesignSystemInterface.ts';
import type { BoardRoute }                             from '../../../shared/BoardRouter.ts';
import type { ProfileLogFollower, TranscriptFollower } from '../../@types/BoardServices.ts';
import type { PreferenceStore }                        from '../../preferences/PreferenceStore.ts';
import { type BoardClock, useTickingNow }              from '../../shared/BoardClock.ts';
import { CommandButton }                               from '../../shared/commands/CommandButton.tsx';
import { useBoardHrefOf, useBoardNavigation }          from '../../shared/routing/BoardRouteLinks.ts';
import { TimeUtil }                                    from '../../utils/TimeUtil.ts';

import { FlowWorkspace }                                                  from './FlowWorkspace.tsx';
import { PipelinePreferencesContext }                                     from './PipelinePreferencesContext.ts';
import { PipelineViewModel, type PipelineScreen, type PipelineViewFacts } from './PipelineViewModel.ts';
import { ProfileLogFollowerContext }                                      from './ProfileLogFollowerContext.ts';
import { ApplyChangesDialog }                                             from './apply/ApplyChangesDialog.tsx';
import { ApplyChangesDialogModel }                                        from './apply/ApplyChangesDialogModel.ts';
import { CopyBetweenEntitiesDialog }                                      from './editing/CopyBetweenEntitiesDialog.tsx';
import { EditingAside }                                                   from './editing/EditingAside.tsx';
import { PipelineEditingModel }                                           from './editing/PipelineEditingModel.ts';
import { EntityLevelBreadcrumb }                                          from './entities/EntityLevelBreadcrumb.tsx';
import { EntityLevelFactsModel }                                          from './entities/EntityLevelFactsModel.ts';
import { ForgeLevelPage }                                                 from './entities/ForgeLevelPage.tsx';
import { MonorepoLevelContext }                                           from './entities/MonorepoLevelContext.ts';
import { FORGE_LEVEL, PipelineLevelModel, type PipelineLevel }            from './entities/PipelineLevelModel.ts';
import { PipelineLevelRail }                                              from './entities/PipelineLevelRail.tsx';
import { useFlowSelection }                                               from './flow/FlowSelection.ts';
import { PipelineFlowModel }                                              from './flow/PipelineFlowModel.ts';
import { CrossingNow }                                                    from './live/CrossingNow.tsx';
import { EntityWorkModel }                                                from './live/EntityWorkModel.ts';
import { FlowActivityPanel }                                              from './live/FlowActivityPanel.tsx';
import type { StampFormat }                                               from './live/FlowActivityPanelModel.ts';
import { ForgeLevelLive }                                                 from './live/ForgeLevelLive.tsx';
import { ForgeSettings }                                                  from './live/ForgeSettings.tsx';
import { LiveFooter }                                                     from './live/LiveFooter.tsx';
import { LivePipelineModel, type LivePipelineFacts, type LiveToastView }  from './live/LivePipelineModel.ts';
import { MinimalPipelineNote }                                            from './live/MinimalPipelineNote.tsx';
import { MinimalPipelineNoteModel }                                       from './live/MinimalPipelineNoteModel.ts';
import { AgentStep }                                                      from './setup/AgentStep.tsx';
import { BillingStep }                                                    from './setup/BillingStep.tsx';
import { ConstitutionStep }                                               from './setup/ConstitutionStep.tsx';
import { DesignStep }                                                     from './setup/DesignStep.tsx';
import { EntitiesStep }                                                   from './setup/EntitiesStep.tsx';
import { ResearchStep }                                                   from './setup/ResearchStep.tsx';
import { ResumeSummary }                                                  from './setup/ResumeSummary.tsx';
import { SetupWelcome }                                                   from './setup/SetupWelcome.tsx';

export interface PipelineViewProps {
  readonly facts:            LivePipelineFacts;
  readonly route:            BoardRoute;
  /** Follows the pipeline agent's transcript for its chat. */
  readonly followTranscript: TranscriptFollower;
  /** Follows a gate profile's output on its stream route for the gate dialog's log. */
  readonly followProfileLog: ProfileLogFollower;
  readonly clock:            BoardClock;
  /** Keeps User's choices on the pipeline pages; null keeps them only while a page is mounted. */
  readonly boardStore:       PreferenceStore | null;
}

interface FlowScreenProps {
  readonly facts:            LivePipelineFacts;
  readonly route:            BoardRoute;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BoardClock;
  readonly onApplySent:      (resumesBoard: boolean) => void;
}

interface EditingFooterProps {
  readonly facts:        PipelineViewFacts;
  readonly setupId:      string;
  /** The smallest pipeline names its removed steps and offers Apply changes. */
  readonly minimal:      boolean;
  readonly applyIsAsked: boolean;
  readonly onApplyAsked: () => void;
  /** A draft over entities also counts the levels its changes are in. */
  readonly byLevel?:     boolean;
}

function editingSummaryTextOf(facts: PipelineViewFacts, minimal: boolean, byLevel: boolean): string | null {
  const changeList = facts.pipeline.flow?.changeList ?? [];
  const appliedRevision = ApplyChangesDialogModel.appliedRevisionOf(facts.pipeline.applied);
  if (minimal) return PipelineFlowModel.removedStepsTextOf(changeList);
  if (!byLevel) return PipelineEditingModel.footerSummaryOf(changeList.length, appliedRevision);
  return PipelineEditingModel.levelsFooterSummaryOf(changeList.length, PipelineEditingModel.levelGroupsOf(facts).length, appliedRevision);
}

function EditingFooter({
  facts, setupId, minimal, applyIsAsked, onApplyAsked, byLevel = false
}: EditingFooterProps) {
  const navigateTo = useBoardNavigation();
  const changeList = facts.pipeline.flow?.changeList ?? [];
  const appliedRevision = ApplyChangesDialogModel.appliedRevisionOf(facts.pipeline.applied);
  const summaryText = editingSummaryTextOf(facts, minimal, byLevel);
  return (
    <ActionBar
      label="Pipeline changes"
      start={(
        <>
          <Tag text="Editing" tone="warn" />
          {summaryText === null ? null : <Text bold>{summaryText}</Text>}
          <Text muted>{PipelineEditingModel.boardNoteOf(appliedRevision)}</Text>
        </>
      )}
      end={(
        <>
          <CommandButton
            label="Discard"
            command={PipelineEditingModel.discardCommandOf(setupId)}
            onApplied={() => navigateTo(PipelineViewModel.liveRoute)}
          />
          <Button
            label={minimal ? 'Apply changes' : ApplyChangesDialogModel.applyLabelOf(changeList.length)}
            emphasis="primary"
            expanded={applyIsAsked}
            onPress={onApplyAsked}
          />
        </>
      )}
    />
  );
}

/** The page's stamp slices with the viewer's day; null on a board whose page carries none. */
function stampFormatOf(facts: PipelineViewFacts, now: Date): StampFormat {
  return { todayCalendarDate: TimeUtil.calendarDateOf(now.getTime()), slices: facts.limits };
}

interface MonorepoLiveFlowProps {
  readonly facts: LivePipelineFacts;
  readonly level: PipelineLevel;
  readonly route: BoardRoute;
  readonly clock: BoardClock;
}

/** One level's live page of a monorepo pipeline: the rail, the breadcrumb, the level's phases or the forge's page, and every entity's activity. */
function MonorepoLiveFlow({
  facts, level, route, clock
}: MonorepoLiveFlowProps) {
  const now = useTickingNow(clock, (facts.pipeline.flow?.occupants.length ?? 0) > 0);
  const selection = useFlowSelection(null);
  const stampFormat = stampFormatOf(facts, now);
  const footer = LivePipelineModel.footerOf(facts.pipeline.applied, stampFormat);
  const words = LivePipelineModel.levelPageWordsOf(level, facts.pipeline.applied);
  const boardHrefOf = useBoardHrefOf();
  const navigateTo = useBoardNavigation();
  const levelHrefOf = (target: PipelineLevel): string => boardHrefOf(PipelineLevelModel.routeMovedTo(route, target));
  const levelFacts = level.kind === 'entity' ? LivePipelineModel.factsLiveAtEntityOf(facts, level.key) : facts;
  const activityTextOf = (target: PipelineLevel): string | null => (target.kind === 'entity'
    ? EntityWorkModel.railActivityTextOf(target.key, facts)
    : EntityWorkModel.forgeRailActivityTextOf(facts));
  return (
    <MonorepoLevelContext.Provider value={{ level, forgeLevelHref: levelHrefOf(FORGE_LEVEL), wholeDraft: null }}>
      <FlowWorkspace
        facts={levelFacts}
        selection={selection}
        title={words.title}
        lead={words.lead}
        notice={level.kind === 'entity' ? <CrossingNow crossings={EntityWorkModel.crossingsNowOf(level.key, facts)} /> : null}
        aside={<FlowActivityPanel facts={facts} stampFormat={stampFormat} clock={clock} level={level} />}
        footer={footer === null ? null : <LiveFooter footer={footer} />}
        rail={(
          <PipelineLevelRail
            facts={facts}
            level={level}
            onSelect={(target) => navigateTo(PipelineLevelModel.routeMovedTo(route, target))}
            activityTextOf={activityTextOf}
          />
        )}
        breadcrumb={<EntityLevelBreadcrumb level={level} forgeLevelHref={levelHrefOf(FORGE_LEVEL)} />}
        levelPage={PipelineLevelModel.isForgeLevel(level) ? <ForgeLevelLive facts={facts} selection={selection} now={now} /> : null}
      />
    </MonorepoLevelContext.Provider>
  );
}

interface MonorepoEditingFlowProps {
  readonly facts:            LivePipelineFacts;
  readonly setup:            BoardPipelineSetupDocument;
  readonly flow:             BoardPipelineFlowDocument;
  readonly level:            PipelineLevel;
  readonly route:            BoardRoute;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BoardClock;
  readonly onApplySent:      (resumesBoard: boolean) => void;
}

/** One level's page while a pipeline over entities is edited: the rail, the breadcrumb, the level's phases or the forge's page, every level's changes. */
function MonorepoEditingFlow({
  facts, setup, flow, level, route, followTranscript, clock, onApplySent
}: MonorepoEditingFlowProps) {
  const selection = useFlowSelection(setup.applyState === null ? null : setup.record.setupId);
  const [copyIsOpen, setCopyIsOpen] = useState(false);
  const { record } = setup;
  const applyChangesIsAsked = selection.applyIsAskedFor(record.setupId);
  const boardHrefOf = useBoardHrefOf();
  const navigateTo = useBoardNavigation();
  const levelHrefOf = (target: PipelineLevel): string => boardHrefOf(PipelineLevelModel.routeMovedTo(route, target));
  const levelFacts = level.kind === 'entity' ? EntityLevelFactsModel.factsAtEntityOf(facts, level.key) : facts;
  const words = PipelineEditingModel.levelPageWordsOf(level, record.draft, ApplyChangesDialogModel.appliedRevisionOf(facts.pipeline.applied));
  const copyNotice = level.kind !== 'entity' || record.draft === null
    ? null
    : (
      <span className="board-pipeline-design-copy">
        <TextButton label="Copy settings to another entity" onPress={() => setCopyIsOpen(true)} />
      </span>
    );
  return (
    <>
      <MonorepoLevelContext.Provider value={{ level, forgeLevelHref: levelHrefOf(FORGE_LEVEL), wholeDraft: record.draft }}>
        <FlowWorkspace
          facts={levelFacts}
          selection={selection}
          title={words.title}
          lead={words.lead}
          notice={copyNotice}
          aside={<EditingAside facts={facts} setup={setup} followTranscript={followTranscript} clock={clock} levelShown={{ level, hrefOf: levelHrefOf }} />}
          footer={(
            <EditingFooter
              facts={facts}
              setupId={record.setupId}
              minimal={false}
              applyIsAsked={applyChangesIsAsked}
              onApplyAsked={() => selection.askApply(record.setupId)}
              byLevel
            />
          )}
          rail={<PipelineLevelRail facts={facts} level={level} onSelect={(target) => navigateTo(PipelineLevelModel.routeMovedTo(route, target))} />}
          breadcrumb={<EntityLevelBreadcrumb level={level} forgeLevelHref={levelHrefOf(FORGE_LEVEL)} />}
          levelPage={PipelineLevelModel.isForgeLevel(level)
            ? <ForgeLevelPage facts={facts} selection={selection} entityHrefOf={(key) => levelHrefOf(PipelineLevelModel.entityLevelOf(key))} />
            : null}
        />
      </MonorepoLevelContext.Provider>
      {applyChangesIsAsked
        ? (
          <ApplyChangesDialog
            setup={setup}
            flow={flow}
            pipeline={facts.pipeline.applied}
            onClose={selection.closeApply}
            onApplySent={() => onApplySent(false)}
            tickets={EntityWorkModel.ticketsOf(facts)}
          />
        )
        : null}
      {copyIsOpen && level.kind === 'entity' && record.draft !== null
        ? (
          <CopyBetweenEntitiesDialog
            wholeDraft={record.draft}
            fromEntityKey={level.key}
            target={{ setupId: record.setupId, draftRevision: record.draftRevision }}
            onClose={() => setCopyIsOpen(false)}
          />
        )
        : null}
    </>
  );
}

function FlowScreen({
  facts, route, followTranscript, clock, onApplySent
}: FlowScreenProps) {
  const now = useTickingNow(clock, false);
  const { setup } = facts.pipeline;
  const selection = useFlowSelection(setup?.applyState === null || setup === null ? null : setup.record.setupId);
  const applyChangesIsAsked = setup !== null && selection.applyIsAskedFor(setup.record.setupId);
  const { flow } = facts.pipeline;
  if (flow === null) return null;
  const minimal = MinimalPipelineNoteModel.noteIsShownFor(flow);
  const words = PipelineViewModel.flowPageWordsOf(flow.toolbarStage, flow, ApplyChangesDialogModel.appliedRevisionOf(facts.pipeline.applied));
  const minimalNote = minimal ? <MinimalPipelineNote flow={flow} /> : null;
  const liveLevel = flow.toolbarStage === 'live' ? PipelineViewModel.levelShownOf(facts, route) : null;
  if (liveLevel !== null) {
    // Each level is its own page: an open phase or dialog never follows the owner to another level.
    return <MonorepoLiveFlow key={PipelineLevelModel.itemAtLevel(liveLevel, null)} facts={facts} level={liveLevel} route={route} clock={clock} />;
  }
  if (flow.toolbarStage === 'live') {
    const stampFormat = stampFormatOf(facts, now);
    const footer = LivePipelineModel.footerOf(facts.pipeline.applied, stampFormat);
    return (
      <FlowWorkspace
        facts={facts}
        selection={selection}
        title={words.title}
        lead={words.lead}
        aside={<FlowActivityPanel facts={facts} stampFormat={stampFormat} clock={clock} />}
        footer={footer === null ? null : <LiveFooter footer={footer} />}
      />
    );
  }
  const editingLevel = flow.toolbarStage === 'editing' && setup !== null ? PipelineViewModel.levelShownOf(facts, route) : null;
  if (editingLevel !== null && setup !== null) {
    // Each level is its own page: an open phase or dialog never follows the owner to another level.
    return (
      <MonorepoEditingFlow
        key={PipelineLevelModel.itemAtLevel(editingLevel, null)}
        facts={facts}
        setup={setup}
        flow={flow}
        level={editingLevel}
        route={route}
        followTranscript={followTranscript}
        clock={clock}
        onApplySent={onApplySent}
      />
    );
  }
  if (flow.toolbarStage !== 'editing' || setup === null) {
    return <FlowWorkspace facts={facts} selection={selection} title={words.title} lead={words.lead} aside={minimalNote} footer={null} />;
  }
  return (
    <>
      <FlowWorkspace
        facts={facts}
        selection={selection}
        title={words.title}
        lead={words.lead}
        aside={minimalNote ?? <EditingAside facts={facts} setup={setup} followTranscript={followTranscript} clock={clock} />}
        footer={(
          <EditingFooter
            facts={facts}
            setupId={setup.record.setupId}
            minimal={minimal}
            applyIsAsked={applyChangesIsAsked}
            onApplyAsked={() => selection.askApply(setup.record.setupId)}
          />
        )}
      />
      {applyChangesIsAsked
        ? (
          <ApplyChangesDialog
            setup={setup}
            flow={flow}
            pipeline={facts.pipeline.applied}
            onClose={selection.closeApply}
            onApplySent={() => onApplySent(false)}
          />
        )
        : null}
    </>
  );
}

interface ScreenContentProps {
  readonly facts:            LivePipelineFacts;
  readonly screen:           PipelineScreen;
  readonly route:            BoardRoute;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BoardClock;
  readonly onApplySent:      (resumesBoard: boolean) => void;
}

function ScreenContent({
  facts, screen, route, followTranscript, clock, onApplySent
}: ScreenContentProps) {
  const { setup } = facts.pipeline;
  if (screen.screen === 'setup-landing') return <SetupWelcome facts={facts} unreadable={screen.unreadable} />;
  if (screen.screen === 'setup-start') return <AgentStep facts={facts} setup={null} replacesUnreadablePipeline={screen.unreadable !== null} />;
  if (screen.screen === 'setup-step' && screen.step === 'agent' && setup !== null) return <AgentStep facts={facts} setup={setup} replacesUnreadablePipeline={false} />;
  if (screen.screen === 'setup-step' && screen.step === 'billing' && setup !== null) return <BillingStep facts={facts} setup={setup} />;
  if (screen.screen === 'setup-step' && screen.step === 'research' && setup !== null) {
    return <ResearchStep facts={facts} setup={setup} followTranscript={followTranscript} clock={clock} route={route} />;
  }
  if (screen.screen === 'setup-step' && screen.step === 'entities' && setup !== null) {
    return <EntitiesStep facts={facts} setup={setup} followTranscript={followTranscript} clock={clock} />;
  }
  const constitutionIsShown = (screen.screen === 'setup-step' && screen.step === 'constitution') || screen.screen === 'constitution-edit';
  if (constitutionIsShown && setup !== null) return <ConstitutionStep facts={facts} setup={setup} followTranscript={followTranscript} clock={clock} route={route} />;
  if (screen.screen === 'setup-resume' && setup !== null) return <ResumeSummary setup={setup} jobs={facts.jobs} />;
  if (screen.screen === 'forge-settings') return <ForgeSettings facts={facts} />;
  if (screen.screen === 'setup-step' && screen.step === 'design' && setup !== null) {
    return (
      <DesignStep facts={facts} setup={setup} followTranscript={followTranscript} clock={clock} onApplySent={onApplySent} route={route} />
    );
  }
  if (screen.screen !== 'flow') return <h2 className="board-pipeline-title">{PipelineViewModel.screenTitleOf(screen)}</h2>;
  return <FlowScreen facts={facts} route={route} followTranscript={followTranscript} clock={clock} onApplySent={onApplySent} />;
}

/** An Apply this view sent: the applied version before it, and whether it resumes the board. */
interface AwaitedApply {
  readonly revisionBefore: number | null;
  readonly resumesBoard:   boolean;
}

/** The toast after an Apply this view sent, shown once the facts carry the newer applied version. */
function useAppliedToast(facts: PipelineViewFacts): { toast: LiveToastView | null; awaitApply: (resumesBoard: boolean) => void; dismiss: () => void } {
  const [awaitedApply, setAwaitedApply] = useState<AwaitedApply | null>(null);
  const [toast, setToast] = useState<LiveToastView | null>(null);
  const landedRevision = awaitedApply === null ? null : LivePipelineModel.landedRevisionOf(awaitedApply.revisionBefore, facts.pipeline.applied);
  // The facts of this render carry the landing: the state moves here, as React's adjusting-state-on-new-props pattern does.
  if (awaitedApply !== null && landedRevision !== null) {
    setToast(LivePipelineModel.toastOf(awaitedApply.resumesBoard, landedRevision));
    setAwaitedApply(null);
  }
  const revisionBefore = ApplyChangesDialogModel.appliedRevisionOf(facts.pipeline.applied);
  return {
    toast,
    awaitApply: (resumesBoard) => setAwaitedApply({ revisionBefore, resumesBoard }),
    dismiss:    () => setToast(null),
  };
}

export function PipelineView({
  facts, route, followTranscript, followProfileLog, clock, boardStore
}: PipelineViewProps) {
  const screen = PipelineViewModel.screenOf(facts, route);
  const setupRouteIsLeft = PipelineViewModel.setupRouteIsLeftOf(screen, route);
  const appliedToast = useAppliedToast(facts);
  const navigateTo = useBoardNavigation();
  useEffect(() => {
    if (setupRouteIsLeft) navigateTo(PipelineViewModel.liveRouteOf(route));
  }, [setupRouteIsLeft, route, navigateTo]);
  return (
    <section className="board-pipeline" aria-label={PipelineViewModel.screenTitleOf(screen)} data-screen={screen.screen}>
      <ProfileLogFollowerContext.Provider value={followProfileLog}>
        <PipelinePreferencesContext.Provider value={boardStore}>
          <ScreenContent
            facts={facts}
            screen={screen}
            route={route}
            followTranscript={followTranscript}
            clock={clock}
            onApplySent={appliedToast.awaitApply}
          />
        </PipelinePreferencesContext.Provider>
      </ProfileLogFollowerContext.Provider>
      {appliedToast.toast === null
        ? null
        : (
          <div className="board-pipeline-toast">
            <Toast title={appliedToast.toast.title} text={appliedToast.toast.text} glyph="check" onExpired={appliedToast.dismiss} />
          </div>
        )}
    </section>
  );
}
