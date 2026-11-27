/**
 * The board's shell for one forge: it reads the board through Gaia's relay, follows the stream, says whether controls may act, and draws the
 * banners, header and the routed tab's view from `BOARD_TAB_VIEWS`. It navigates by Gaia's address alone, through `services.goTo`; in setup
 * the page's own head holds the step bar, told through `BoardSetupHeadContext`, and the board draws no header.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';

import type { BoardDocument } from '../../@types/board/BoardDocument.ts';
import { EmptyState }         from '../../lib/design-system/DesignSystemInterface.ts';
import {
  BoardRouter,
  DEFAULT_PROGRESS_VIEW,
  DEFAULT_TAB,
  PROGRESS_VIEW_CHOICE_NAME,
  TAB_CHOICE_NAME,
  type BoardRoute,
  type BoardTab
} from '../../shared/BoardRouter.ts';
import type { BoardServices }                                                            from '../@types/BoardServices.ts';
import type { BoardTabViewTable }                                                        from '../@types/BoardTabViewProps.ts';
import type { ConnectionState }                                                          from '../api/BoardEventStreamClient.ts';
import { BoardFlint }                                                                    from '../flint/BoardFlint.tsx';
import type { BoardReading }                                                             from '../flint/BoardOccasionModel.ts';
import { boardPreferenceStoreOf }                                                        from '../preferences/PreferenceStore.ts';
import { BROWSER_BOARD_CLOCK, BoardClockContext, type BoardClock }                       from '../shared/BoardClock.ts';
import { type BoardSetupHead, BoardSetupHeadContext }                                    from '../shared/BoardSetupHead.ts';
import { QuestionPanelShownContext }                                                     from '../shared/CoveringPanel.ts';
import { FinishedWorkWindowContext }                                                     from '../shared/FinishedWorkWindow.ts';
import { HomeFolderContext }                                                             from '../shared/HomeFolder.ts';
import { ControlAvailabilityUtil, ControlSurroundingsContext, type ControlSurroundings } from '../shared/commands/ControlAvailability.ts';
import { ProgramFileChooserContext }                                                     from '../shared/commands/ProgramFileChooser.ts';
import { BoardGoToContext, BoardTrackerContext }                                         from '../shared/routing/BoardRouteLinks.ts';
import { DetailRoute }                                                                   from '../shared/routing/DetailRoute.ts';
import { DetailRoutingContext, detailRoutingOf, type DetailRouting }                     from '../shared/routing/DetailRouting.ts';
import { QuestionPanelOpenerContext }                                                    from '../shared/routing/QuestionPanelOpener.ts';
import { TimeUtil }                                                                      from '../utils/TimeUtil.ts';
import { KanbanTabSurroundingsContext }                                                  from '../views/kanban/KanbanTabSurroundings.ts';
import { PipelineViewModel }                                                             from '../views/pipeline/PipelineViewModel.ts';
import { QuestionsModelUtil }                                                            from '../views/questions/QuestionsModel.ts';
import { QuestionPanel }                                                                 from '../views/questions/panel/QuestionPanel.tsx';
import { QuestionPanelModel }                                                            from '../views/questions/panel/QuestionPanelModel.ts';
import { ShownQuestionContext, useQuestionPanelState }                                   from '../views/questions/panel/QuestionPanelState.ts';
import { AgentNotice }                                                                   from './AgentNotice.tsx';
import { AgentNoticeModel }                                                              from './AgentNoticeModel.ts';
import { BoardStateUpdate }                                                              from './BoardStateUpdate.ts';
import { useBoardTabFilters }                                                            from './BoardTabFilters.tsx';
import { BOARD_TAB_VIEWS }                                                               from './BoardTabViews.tsx';
import { ConnectionBanners }                                                             from './ConnectionBanners.tsx';
import { DetailPanelHost }                                                               from './DetailPanelHost.tsx';
import { Header }                                                                        from './Header.tsx';
import { type HeaderModel, headerModelOf, setupProgressOnStartingStepOf }                from './HeaderModel.ts';
import { IncidentNotice }                                                                from './IncidentNotice.tsx';
import { IncidentNoticeModelUtil }                                                       from './IncidentNoticeModel.ts';
import { SetupStepBar }                                                                  from './SetupStepBar.tsx';
import { WaitingOnUserModel }                                                            from './WaitingOnUserModel.ts';

export interface BoardAppProps {
  readonly services:  BoardServices;
  /** The route Gaia's address names; `null` for the forge alone, which opens the tab stored for this board. */
  readonly route:     BoardRoute | null;
  /** The forge's name until the first board names it. */
  readonly project:   string;
  /** The view of every tab; `BOARD_TAB_VIEWS` unless a spec hands its own. */
  readonly tabViews?: BoardTabViewTable;
  /** The page's own head, drawn at the top of the board; in setup it holds the setup step bar (`BoardSetupHeadContext`). */
  readonly children?: ReactNode;
}

const HELD_BY_INSTALL_CHANGE = 'held-by-install-change';

/** The board's preference holding the incident defaults this viewer marked seen. */
const SEEN_INCIDENT_DEFAULTS_CHOICE_NAME = 'seen-incident-defaults';

const WAITING_FOR_THE_FIRST_BOARD = 'Waiting for the forge\'s first board.';

function connectionIsLost(connection: ConnectionState): boolean {
  return connection === 'down' || connection === 'no-session';
}

function shownTabsOfBoard(board: BoardDocument | null): BoardTab[] {
  if (board === null) return BoardRouter.shownTabsOf(null, null, null);
  return BoardRouter.shownTabsOf(
    board.page.tickets.some((ticket) => ticket.dependsOn.length > 0),
    board.page.facts.epics.length > 0,
    board.pipeline.applied.readingVerdict === 'readable',
  );
}

/** Reads the board at the start, after each `board-changed`, and once the stream is live again after it was lost; a later read wins. */
function useBoardReading(services: BoardServices): {
  readonly board:          BoardDocument | null;
  readonly connection:     ConnectionState;
  readonly boardShownAsOf: string | null;
} {
  const { readingAtMount } = services;
  const [board, setBoard] = useState<BoardDocument | null>(readingAtMount?.board ?? null);
  const [connection, setConnection] = useState<ConnectionState>(readingAtMount?.connection ?? 'connecting');
  const [boardShownAsOf, setBoardShownAsOf] = useState<string | null>(() => (readingAtMount?.board ? services.now().toLocaleString() : null));
  useEffect(() => {
    let isMounted = true;
    let readNumber = 0;
    let streamWasLost = false;
    const readAgain = (): void => {
      readNumber += 1;
      const thisRead = readNumber;
      void services.readBoard().then((read) => {
        if (!isMounted || thisRead !== readNumber) return;
        setBoard((previous) => BoardStateUpdate.boardAfterRead(previous, read));
        if (read.verdict === 'read') setBoardShownAsOf(services.now().toLocaleString());
      });
    };
    readAgain();
    const stream = services.openEventStream({
      onEvent: (event) => {
        if (BoardStateUpdate.readIsDueAfter(event)) readAgain();
      },
      onConnection: (state) => {
        setConnection(state);
        if (connectionIsLost(state)) streamWasLost = true;
        if (state !== 'live' || !streamWasLost) return;
        streamWasLost = false;
        readAgain();
      },
    });
    return () => {
      isMounted = false;
      stream.close();
    };
  }, [services]);
  return { board, connection, boardShownAsOf };
}

/**
 * The head's part in setup: the step bar while a setup record walks its steps, and on the agent step that starts one, where the stepper's
 * Agent is current; on the welcome before a record opens the head shows none.
 */
function setupHeadOf({ setupSteps, setupProgress }: HeaderModel, agentStepStartsSetup: boolean): BoardSetupHead | null {
  if (setupSteps === null || setupProgress === null) return null;
  const progress = setupProgress.stage === 'not-started' && agentStepStartsSetup ? setupProgressOnStartingStepOf(setupSteps) : setupProgress;
  return { stepBar: progress.stage === 'setting-up' ? <SetupStepBar steps={setupSteps} /> : null, progress };
}

export function BoardApp({
  services, route, project, tabViews = BOARD_TAB_VIEWS, children
}: BoardAppProps) {
  const { board, connection, boardShownAsOf } = useBoardReading(services);
  const boardStore = useMemo(() => boardPreferenceStoreOf(services.trackerId, services.storage), [services]);
  const [installRefusal, setInstallRefusal] = useState<string | null>(null);
  const [sessionIsLost, setSessionIsLost] = useState(false);
  const [refusedCommandCount, setRefusedCommandCount] = useState(0);
  const countRefusal = useCallback(() => setRefusedCommandCount((counted) => counted + 1), []);
  const loseSession = useCallback(() => setSessionIsLost(true), []);
  const mainPanelRef = useRef<HTMLElement | null>(null);

  const boardIsHeld = board?.hephaestus.state === HELD_BY_INSTALL_CHANGE;
  const [refusalBoard, setRefusalBoard] = useState(board);
  // Adjusting state while rendering, as React advises for a value derived from a changed input: a board no longer held clears the 423.
  if (refusalBoard !== board) {
    setRefusalBoard(board);
    if (board !== null && !boardIsHeld) setInstallRefusal(null);
  }
  if (connection === 'live' && sessionIsLost) setSessionIsLost(false);

  const shownTabs = useMemo(() => shownTabsOfBoard(board), [board]);
  const addressedRoute = route ?? BoardRouter.routeOf(null, boardStore.readChoice(TAB_CHOICE_NAME));
  const shownRoute = BoardRouter.shownRouteOf(addressedRoute, shownTabs);
  // Before the first board its tabs are not known, so a stored tab such as Pipeline would be overwritten by the default.
  const boardIsRead = board !== null;
  useEffect(() => {
    if (boardIsRead && BoardRouter.tabIsStored(shownRoute.tab)) boardStore.writeChoice(TAB_CHOICE_NAME, shownRoute.tab, DEFAULT_TAB);
  }, [boardIsRead, boardStore, shownRoute.tab]);
  const progressViewToOpen = BoardRouter.progressViewToOpenOf(shownRoute.tab, boardStore.readChoice(PROGRESS_VIEW_CHOICE_NAME), shownTabs);
  useEffect(() => {
    if (boardIsRead && BoardRouter.isProgressView(shownRoute.tab)) boardStore.writeChoice(PROGRESS_VIEW_CHOICE_NAME, shownRoute.tab, DEFAULT_PROGRESS_VIEW);
  }, [boardIsRead, boardStore, shownRoute.tab]);

  const streamIsDown = connectionIsLost(connection);
  const installIsHeld = installRefusal !== null || boardIsHeld;
  const controlSurroundings = useMemo((): ControlSurroundings => ({
    availability:        ControlAvailabilityUtil.availabilityOf(streamIsDown || sessionIsLost, installIsHeld),
    commandClient:       services.commandClient,
    pictureUploadClient: services.pictureUploadClient,
    onInstallHeld:       setInstallRefusal,
    onSessionLost:       loseSession,
    onRefused:           countRefusal,
  }), [streamIsDown, sessionIsLost, installIsHeld, services, loseSession, countRefusal]);

  const boardClock = useMemo((): BoardClock => ({ ...BROWSER_BOARD_CLOCK, now: services.now }), [services]);
  const boardNow = useMemo(() => (board === null ? 0 : services.now().getTime()), [board, services]);
  const waitingOnUser = useMemo(() => (board === null ? null : WaitingOnUserModel.waitingOnUserOf(board)), [board]);
  const tabCounts = useMemo(() => (board === null || waitingOnUser === null ? {} : WaitingOnUserModel.tabCountsOf(board, waitingOnUser)), [board, waitingOnUser]);
  const [markedSeenIncidentIds, setMarkedSeenIncidentIds] = useState<readonly string[] | null>(null);
  const seenIncidentIds = useMemo(() => markedSeenIncidentIds ?? boardStore.readTextList(SEEN_INCIDENT_DEFAULTS_CHOICE_NAME), [markedSeenIncidentIds, boardStore]);
  const incidentNotice = useMemo(() => (board === null ? null : IncidentNoticeModelUtil.incidentNoticeModelOf(
    board,
    seenIncidentIds,
    { todayCalendarDate: TimeUtil.calendarDateOf(boardNow), slices: TimeUtil.timestampSlicesOf(board) },
  )), [board, seenIncidentIds, boardNow]);
  const markIncidentDefaultsSeen = (): void => {
    if (board === null) return;
    const seenIds = IncidentNoticeModelUtil.seenIdsAfterMarking(board);
    boardStore.writeTextList(SEEN_INCIDENT_DEFAULTS_CHOICE_NAME, seenIds);
    setMarkedSeenIncidentIds(seenIds);
    // The line goes, and the focused button with it; the focus moves to the panel instead of falling to the body.
    mainPanelRef.current?.focus();
  };
  const agentNotice = useMemo(() => (board === null ? null : AgentNoticeModel.agentNoticeOf(board)), [board]);
  const boardIsInSetup = board !== null && PipelineViewModel.isInSetup(board);
  const questionQueue = useMemo(
    () => (board === null ? [] : QuestionPanelModel.panelQueueOf(QuestionsModelUtil.openDecisionsOf(board), boardIsInSetup)),
    [board, boardIsInSetup],
  );
  const questionPanel = useQuestionPanelState(boardStore, questionQueue);
  // `questions/<id>` opens that open question's panel, when the route arrives and when the question does.
  const routedQuestionId = shownRoute.tab === 'questions' ? shownRoute.item : null;
  const routedQuestionIsOpen = routedQuestionId !== null && questionQueue.some(({ decision }) => decision.id === routedQuestionId);
  const openQuestionPanel = questionPanel.open;
  useEffect(() => {
    if (routedQuestionIsOpen && routedQuestionId !== null) openQuestionPanel(routedQuestionId);
  }, [routedQuestionIsOpen, routedQuestionId, openQuestionPanel]);
  const flintBoardReading = useMemo((): BoardReading => ({ board, connection, refusedCommandCount }), [board, connection, refusedCommandCount]);
  const headerModel = headerModelOf(board, services.now(), connection);
  const agentStepStartsSetup = board !== null && shownRoute.tab === 'pipeline' && PipelineViewModel.screenOf(board, shownRoute).screen === 'setup-start';
  const setupHead = setupHeadOf(headerModel, agentStepStartsSetup);
  const TabView = tabViews[shownRoute.tab];
  const { tab: shownTab, item: shownItem } = shownRoute;
  const tabFilters = useBoardTabFilters(board, shownTab, boardStore, boardNow);
  const detailRouting = useMemo((): DetailRouting | null => {
    if (!DetailRoute.isDetailTab(shownTab)) return null;
    const fragmentOf = (detailRoute: BoardRoute): string => BoardRouter.fragmentOf(services.trackerId, detailRoute);
    const openDetail = DetailRoute.openDetailOf({ tab: shownTab, item: shownItem });
    return detailRoutingOf(shownTab, openDetail, (detailRoute) => services.goTo(fragmentOf(detailRoute)), fragmentOf);
  }, [shownTab, shownItem, services]);
  const shownQuestion = questionPanel.shownDecision;

  const mainArea = (): ReactNode => {
    if (board === null) return <EmptyState text={WAITING_FOR_THE_FIRST_BOARD} />;
    const tabView = (
      <FinishedWorkWindowContext value={tabFilters.finishedWorkWindow}>
        <KanbanTabSurroundingsContext value={tabFilters.kanbanSurroundings}>
          <TabView board={board} route={shownRoute} connection={connection} boardStore={boardStore} services={services} />
        </KanbanTabSurroundingsContext>
      </FinishedWorkWindowContext>
    );
    if (detailRouting === null) return tabView;
    return (
      <DetailRoutingContext value={detailRouting}>
        {tabView}
        <DetailPanelHost board={board} item={detailRouting.openItem} todayCalendarDate={TimeUtil.calendarDateOf(services.now().getTime())} />
      </DetailRoutingContext>
    );
  };

  return (
    <BoardTrackerContext value={services.trackerId}>
      <BoardGoToContext value={services.goTo}>
        <ControlSurroundingsContext value={controlSurroundings}>
          <ProgramFileChooserContext value={services.chooseProgramFile ?? null}>
            <QuestionPanelOpenerContext value={questionPanel.open}>
              <BoardClockContext value={boardClock}>
                <BoardFlint
                  boardStore={boardStore}
                  boardReading={flintBoardReading}
                  {...(services.flintFrameSource === undefined ? {} : { frameSource: services.flintFrameSource })}
                  {...(services.onFlintHandle === undefined ? {} : { onHandle: services.onFlintHandle })}
                >
                  <div className="board-shell">
                    <BoardSetupHeadContext value={setupHead}>{children}</BoardSetupHeadContext>
                    <ConnectionBanners
                      streamIsDown={streamIsDown}
                      boardShownAsOf={boardShownAsOf}
                      installHeldRefusal={installIsHeld ? installRefusal : undefined}
                      warnings={headerModel.warnings}
                      notices={headerModel.notices}
                    />
                    {incidentNotice === null ? null : <IncidentNotice model={incidentNotice} onMarkSeen={markIncidentDefaultsSeen} />}
                    {agentNotice === null ? null : <AgentNotice notice={agentNotice} />}
                    <Header
                      project={board?.project ?? project}
                      model={headerModel}
                      selectedTab={shownRoute.tab}
                      shownTabs={shownTabs}
                      progressViewToOpen={progressViewToOpen}
                      activityIsLive={connection === 'live'}
                      sidePanelIsOpen={shownQuestion !== null}
                      clock={boardClock}
                      tabBarEnd={tabFilters.filterLine}
                      onShowLane={tabFilters.showLane}
                      waitingOnUser={waitingOnUser}
                      tabCounts={tabCounts}
                      questionNotifier={services.questionNotifier}
                      timestampSlices={board === null ? null : TimeUtil.timestampSlicesOf(board)}
                    />
                    <main
                      ref={mainPanelRef}
                      tabIndex={-1}
                      className="board-panel"
                      data-tab={shownRoute.tab}
                    >
                      <QuestionPanelShownContext value={shownQuestion !== null}>
                        <ShownQuestionContext value={shownQuestion?.decision.id ?? null}>
                          <HomeFolderContext value={services.homeFolder ?? null}>{mainArea()}</HomeFolderContext>
                        </ShownQuestionContext>
                      </QuestionPanelShownContext>
                    </main>
                    {board === null
                      ? null
                      : (
                        <QuestionPanel
                          board={board}
                          queue={questionQueue}
                          shownDecision={shownQuestion}
                          isHiddenBehindDetail={DetailRoute.openDetailOf(shownRoute) !== null}
                          format={{ todayCalendarDate: TimeUtil.calendarDateOf(boardNow), slices: TimeUtil.timestampSlicesOf(board) }}
                          followTranscript={services.followTranscript}
                          onFold={questionPanel.fold}
                          onClose={questionPanel.close}
                          onNext={questionPanel.showNext}
                          focusesCloseOnOpen={() => questionPanel.openedByUser}
                        />
                      )}
                  </div>
                </BoardFlint>
              </BoardClockContext>
            </QuestionPanelOpenerContext>
          </ProgramFileChooserContext>
        </ControlSurroundingsContext>
      </BoardGoToContext>
    </BoardTrackerContext>
  );
}
