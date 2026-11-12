/**
 * The Bridge's shell: it follows the Overseer's event stream into one state, routes the hash to a tab, wires the embedded channel, and says
 * whether controls may act. After the stream comes back it asks `/api/identity` again and reloads when the Overseer runs new code, since
 * the bundle it holds may no longer match the API. A refused session code, or a session the Overseer no longer knows, raises the session
 * banner in place of the wait for a board. Everything it reaches outside the page arrives in `services`, so a DOM spec fakes it.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import type { BoardStateDocument, OverseerIdentity }                                     from '../@types/BoardStateDocument.ts';
import type { ConversationBoardDocument }                                                from '../@types/ConversationDocuments.ts';
import type { CommandClient }                                                            from '../api/CommandClient.ts';
import type { ConnectionState, EventStreamHandlers }                                     from '../api/EventStreamClient.ts';
import type { PictureUploadClient }                                                      from '../api/PictureUploadClient.ts';
import type { SessionExchangeOutcome }                                                   from '../api/SessionCodeExchange.ts';
import { OpenDecisionsUtil }                                                             from '../conversation/OpenDecisionsUtil.ts';
import type { TranscriptFollower }                                                       from '../conversation/TranscriptLog.tsx';
import { EmptyState }                                                                    from '../design-system/ListSection.tsx';
import { boardPreferenceStoreOf, sharedPreferenceStoreOf, type PreferenceStorage }       from '../preferences/PreferenceStore.ts';
import { FinishedWorkUtil }                                                              from '../utils/FinishedWorkUtil.ts';
import { TimeUtil }                                                                      from '../utils/TimeUtil.ts';
import { AgentsView }                                                                    from '../views/agents/AgentsView.tsx';
import { AssistantView }                                                                 from '../views/assistant/AssistantView.tsx';
import { EpicsModel }                                                                    from '../views/epics/EpicsModel.ts';
import { EpicsView }                                                                     from '../views/epics/EpicsView.tsx';
import { FinishedWorkView }                                                              from '../views/finished-work/FinishedWorkView.tsx';
import { IntakeView }                                                                    from '../views/intake/IntakeView.tsx';
import { useKanbanFilterChoices }                                                        from '../views/kanban/KanbanFilterChoices.ts';
import { KanbanFilterSections }                                                          from '../views/kanban/KanbanFilterSections.tsx';
import { KanbanModel }                                                                   from '../views/kanban/KanbanModel.ts';
import { KanbanView, type KanbanLaneHighlightRequest }                                   from '../views/kanban/KanbanView.tsx';
import { MergeQueueModel }                                                               from '../views/merge-queue/MergeQueueModel.ts';
import { MergeQueueView }                                                                from '../views/merge-queue/MergeQueueView.tsx';
import { PipelineView }                                                                  from '../views/pipeline/PipelineView.tsx';
import { ProgressModel }                                                                 from '../views/progress/ProgressModel.ts';
import { ProgressView }                                                                  from '../views/progress/ProgressView.tsx';
import { QuestionPanel }                                                                 from '../views/question-panel/QuestionPanel.tsx';
import type { QuestionPanelBoard }                                                       from '../views/question-panel/QuestionPanelModel.ts';
import { useQuestionPanelState }                                                         from '../views/question-panel/QuestionPanelState.ts';
import { QuestionAlerts, type QuestionNotifier }                                         from '../views/questions/QuestionAlerts.ts';
import { QuestionsView }                                                                 from '../views/questions/QuestionsView.tsx';
import { TicketsModel }                                                                  from '../views/tickets/TicketsModel.ts';
import { TicketsView }                                                                   from '../views/tickets/TicketsView.tsx';
import { WavesModel }                                                                    from '../views/waves/WavesModel.ts';
import { WavesView }                                                                     from '../views/waves/WavesView.tsx';
import { BoardStateUpdate }                                                              from './BoardStateUpdate.ts';
import { BROWSER_BRIDGE_CLOCK, BridgeClockContext, type BridgeClock }                    from './BridgeClock.ts';
import { ConnectionBanners }                                                             from './ConnectionBanners.tsx';
import { ControlAvailabilityUtil, ControlSurroundingsContext, type ControlSurroundings } from './ControlAvailability.ts';
import { QuestionPanelShownContext }                                                     from './CoveringPanel.ts';
import { DetailPanelHost }                                                               from './DetailPanelHost.tsx';
import { DetailRoute }                                                                   from './DetailRoute.ts';
import { DetailRoutingContext, detailRoutingOf }                                         from './DetailRouting.ts';
import { EmbeddedChannel, type EmbeddedSurroundings }                                    from './EmbeddedChannel.ts';
import { FinishedWorkFilter, useFinishedWorkChoice, type FinishedWorkCount }             from './FinishedWorkFilter.tsx';
import { FinishedWorkWindowContext, type FinishedWorkWindow }                            from './FinishedWorkWindow.ts';
import {
  DEFAULT_TAB,
  HashRouter,
  TAB_CHOICE_NAME,
  type BridgeTab
} from './HashRouter.ts';
import { Header }                                 from './Header.tsx';
import { HeaderModelUtil, type HeaderFigureLane } from './HeaderModel.ts';
import { IncidentNotice }                         from './IncidentNotice.tsx';
import { IncidentNoticeModelUtil }                from './IncidentNoticeModel.ts';
import { QuestionPanelOpenerContext }             from './QuestionPanelOpener.ts';
import type { SessionLoss }                       from './SessionWordingUtil.ts';
import { ThemeBootstrap, type ThemeChoice }       from './ThemeBootstrap.ts';
import { WaitingOnUserModel }                     from './WaitingOnUserModel.ts';

export interface BridgeServices {
  readonly commandClient:        CommandClient;
  /** Absent where no picture can be uploaded, so the Intake view offers none. */
  readonly pictureUploadClient?: PictureUploadClient;
  readonly openEventStream:      (handlers: EventStreamHandlers) => { close: () => void };
  readonly fetchIdentity:        () => Promise<OverseerIdentity | null>;
  readonly reload:               () => void;
  readonly storage:              () => PreferenceStorage;
  readonly embedded:             boolean;
  readonly embeddedSurroundings: () => EmbeddedSurroundings;
  readonly now:                  () => Date;
  readonly followTranscript:     TranscriptFollower;
  readonly questionNotifier:     QuestionNotifier;
}

export interface BridgeAppProps {
  readonly services:                BridgeServices;
  /** How the code in the fragment fared before the shell mounted; `no-code` when absent. */
  readonly sessionExchangeOutcome?: SessionExchangeOutcome;
}

const HELD_BY_INSTALL_CHANGE = 'held-by-install-change';

/** The Kanban's Merge queue lane opens its detail at `#kanban/merge-queue`. */
export const MERGE_QUEUE_ITEM = 'merge-queue';

/** On the root: `live` while the event stream is up, so every live animation, wherever it is, plays only then. */
export const FRESHNESS_ATTRIBUTE = 'data-freshness';

/** On the root once the first board has painted; until then every motion token is 0ms, so the first board shows at once. */
export const MOTION_ATTRIBUTE = 'data-motion';

export const MOTION_READY = 'ready';

const PANEL_ENTER_ANIMATION = 'bridge-panel-enter';

/** The board's preference holding the incident defaults this viewer marked seen. */
const SEEN_INCIDENT_DEFAULTS_CHOICE_NAME = 'seen-incident-defaults';

export function BridgeApp({ services, sessionExchangeOutcome = 'no-code' }: BridgeAppProps) {
  const sharedStore = useMemo(() => sharedPreferenceStoreOf(services.storage), [services]);
  const [identity, setIdentity] = useState<OverseerIdentity | null>(null);
  const [boardState, setBoardState] = useState<BoardStateDocument | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [boardShownAsOf, setBoardShownAsOf] = useState<string | null>(null);
  const [installRefusal, setInstallRefusal] = useState<string | null>(null);
  const [sessionIsLost, setSessionIsLost] = useState(false);
  // A refused code stays shown even when an older cookie still opens the stream: another process may hold a session from it.
  const sessionLoss: SessionLoss | null = sessionExchangeOutcome === 'refused' ? 'code-refused' : (sessionIsLost ? 'no-session' : null);
  const loseSession = useCallback(() => setSessionIsLost(true), []);
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => ThemeBootstrap.themeChoiceOf(sharedStore.readChoice('theme')));
  const knownCodeVersion = useRef<string | null>(null);
  const streamWasDown = useRef(false);

  const boardStore = useMemo(() => (identity === null ? null : boardPreferenceStoreOf(identity.trackerId, services.storage)), [identity, services]);
  const storedTab = useCallback(() => boardStore?.readChoice(TAB_CHOICE_NAME) ?? null, [boardStore]);
  const addressedRoute = HashRouter.useHashRoute(storedTab);
  const [finishedWorkChoice, chooseFinishedWork] = useFinishedWorkChoice(boardStore);
  const kanbanFilterChoices = useKanbanFilterChoices(boardStore);
  const [laneHighlight, setLaneHighlight] = useState<KanbanLaneHighlightRequest | null>(null);
  const takeLaneHighlight = useCallback(() => setLaneHighlight(null), []);
  const showLane = useCallback((laneKey: HeaderFigureLane) => setLaneHighlight((previous) => ({ laneKey, sequence: (previous?.sequence ?? 0) + 1 })), []);
  const conversationBoard = boardState as ConversationBoardDocument | null;
  const waitingBoard = boardState as (BoardStateDocument & ConversationBoardDocument) | null;
  const waitingOnUser = useMemo(() => (waitingBoard === null ? null : WaitingOnUserModel.waitingOnUserOf(waitingBoard)), [waitingBoard]);
  const tabCounts = useMemo(
    () => (waitingBoard === null || waitingOnUser === null ? {} : WaitingOnUserModel.tabCountsOf(waitingBoard, waitingOnUser)),
    [waitingBoard, waitingOnUser],
  );
  QuestionAlerts.useOpenQuestionAlerts(conversationBoard?.decisions ?? null, services.questionNotifier);
  const questionQueue = useMemo(() => (conversationBoard === null ? [] : OpenDecisionsUtil.openDecisionsOf(conversationBoard)), [conversationBoard]);
  const questionPanel = useQuestionPanelState(boardStore, questionQueue);

  useEffect(() => {
    let current = true;
    void services.fetchIdentity().then((fetched) => {
      if (!current || fetched === null) return;
      knownCodeVersion.current = fetched.codeVersion;
      setIdentity(fetched);
    });
    return () => {
      current = false;
    };
  }, [services]);

  useEffect(() => {
    const stream = services.openEventStream({
      onEvent: (kind, data) => {
        setBoardState((previous) => BoardStateUpdate.boardStateAfter(previous, kind, data));
        if (kind !== 'board') return;
        setBoardShownAsOf(services.now().toLocaleString());
        if ((data as Partial<BoardStateDocument>).overseer?.state !== HELD_BY_INSTALL_CHANGE) setInstallRefusal(null);
      },
      onConnection: (state) => {
        setConnection(state);
        if (state === 'no-session') loseSession();
        if (state === 'live') setSessionIsLost(false);
        if (state === 'down') streamWasDown.current = true;
        if (state !== 'live' || !streamWasDown.current) return;
        streamWasDown.current = false;
        void services.fetchIdentity().then((fetched) => {
          if (fetched !== null && knownCodeVersion.current !== null && fetched.codeVersion !== knownCodeVersion.current) services.reload();
        });
      },
    });
    return () => stream.close();
  }, [services, loseSession]);

  const progressBoardState = useMemo(() => ProgressModel.progressBoardStateOf(boardState), [boardState]);
  // The chart and the waves read the clock once per board: what moves with it is only shown, and moves on with the next board.
  const boardNow = useMemo(() => (boardState === null ? 0 : services.now().getTime()), [boardState, services]);
  const wavesCanvas = useMemo(() => (progressBoardState === null ? null : WavesModel.wavesModelOf(progressBoardState, boardNow)), [progressBoardState, boardNow]);
  const shownTabs = useMemo(() => HashRouter.shownTabsOf(
    boardState === null ? null : wavesCanvas !== null,
    boardState?.page === undefined ? null : boardState.page.payload.boardFacts.epics.length > 0,
    boardState?.pipeline === undefined ? null : boardState.pipeline.readingVerdict === 'readable',
  ), [boardState, wavesCanvas]);
  const route = HashRouter.shownRouteOf(addressedRoute, shownTabs);
  const { tab: routeTab, item: routeItem } = route;
  const detailRouting = useMemo(
    () => (DetailRoute.isDetailTab(routeTab)
      ? detailRoutingOf(routeTab, DetailRoute.openDetailOf({ tab: routeTab, item: routeItem }), HashRouter.navigateTo)
      : null),
    [routeTab, routeItem],
  );
  const openDetail = detailRouting?.openItem ?? null;
  const questionPanelIsShown = questionPanel.shownDecision !== null && openDetail === null;

  // Only a panel Esc closes counts: an item route of another tab (a session, New chat, a question) leaves the board on Esc.
  const panelIsOpen = openDetail !== null || questionPanelIsShown;
  const panelIsOpenNow = useRef(panelIsOpen);
  useEffect(() => {
    panelIsOpenNow.current = panelIsOpen;
  }, [panelIsOpen]);

  useEffect(() => {
    if (!services.embedded) return undefined;
    const escapeForwarder = EmbeddedChannel.forwardEscape(services.embeddedSurroundings(), () => panelIsOpenNow.current);
    return () => escapeForwarder.close();
  }, [services]);

  useEffect(() => {
    boardStore?.writeChoice(TAB_CHOICE_NAME, route.tab, DEFAULT_TAB);
  }, [boardStore, route.tab]);

  useEffect(() => {
    document.documentElement.setAttribute(FRESHNESS_ATTRIBUTE, connection === 'live' ? 'live' : 'snapshot');
  }, [connection]);
  useEffect(() => () => document.documentElement.removeAttribute(FRESHNESS_ATTRIBUTE), []);

  const boardHasArrived = boardState !== null;
  useEffect(() => {
    if (!boardHasArrived) return undefined;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => document.documentElement.setAttribute(MOTION_ATTRIBUTE, MOTION_READY));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      document.documentElement.removeAttribute(MOTION_ATTRIBUTE);
    };
  }, [boardHasArrived]);

  // The incoming tab rises in once motion is ready; the outgoing one is gone at once, so it never takes a click.
  const [enteringTab, setEnteringTab] = useState<BridgeTab | null>(null);
  const previousTab = useRef(route.tab);
  useLayoutEffect(() => {
    if (previousTab.current === route.tab) return;
    previousTab.current = route.tab;
    setEnteringTab(document.documentElement.getAttribute(MOTION_ATTRIBUTE) === MOTION_READY ? route.tab : null);
  }, [route.tab]);

  const streamIsDown = connection === 'down';
  const installIsHeld = installRefusal !== null || boardState?.overseer.state === HELD_BY_INSTALL_CHANGE;
  const controlSurroundings = useMemo((): ControlSurroundings => ({
    availability:  ControlAvailabilityUtil.availabilityOf(streamIsDown || sessionIsLost, installIsHeld),
    commandClient: services.commandClient,
    ...(services.pictureUploadClient === undefined ? {} : { pictureUploadClient: services.pictureUploadClient }),
    onInstallHeld: setInstallRefusal,
    onSessionLost: loseSession,
  }), [streamIsDown, sessionIsLost, installIsHeld, services, loseSession]);

  const bridgeClock = useMemo((): BridgeClock => ({ ...BROWSER_BRIDGE_CLOCK, now: services.now }), [services]);
  const kanbanBoardState = useMemo(() => KanbanModel.kanbanBoardStateOf(boardState), [boardState]);
  const { storedPressedChips, storedReadyOrder } = kanbanFilterChoices;
  const kanbanFilters = useMemo(
    () => (kanbanBoardState === null ? null : KanbanModel.kanbanFilterModelOf(kanbanBoardState, storedPressedChips, storedReadyOrder)),
    [kanbanBoardState, storedPressedChips, storedReadyOrder],
  );
  const [markedSeenIncidentIds, setMarkedSeenIncidentIds] = useState<readonly string[] | null>(null);
  const seenIncidentIds = useMemo(
    () => markedSeenIncidentIds ?? boardStore?.readTextList(SEEN_INCIDENT_DEFAULTS_CHOICE_NAME) ?? [],
    [markedSeenIncidentIds, boardStore],
  );
  const incidentNotice = useMemo(() => {
    const slices = IncidentNoticeModelUtil.timestampSlicesOf(boardState);
    const stampFormat = slices === null ? null : { todayCalendarDate: TimeUtil.calendarDateOf(boardNow), slices };
    return conversationBoard === null ? null : IncidentNoticeModelUtil.incidentNoticeModelOf(conversationBoard, seenIncidentIds, stampFormat);
  }, [boardState, conversationBoard, seenIncidentIds, boardNow]);
  const markIncidentDefaultsSeen = (): void => {
    if (conversationBoard === null) return;
    const seenIds = IncidentNoticeModelUtil.seenIdsAfterMarking(conversationBoard);
    boardStore?.writeTextList(SEEN_INCIDENT_DEFAULTS_CHOICE_NAME, seenIds);
    setMarkedSeenIncidentIds(seenIds);
  };
  const ticketsBoardState = useMemo(() => TicketsModel.ticketsBoardStateOf(boardState), [boardState]);
  const epicsBoardState = useMemo(() => EpicsModel.epicsBoardStateOf(boardState), [boardState]);
  const headerModel = HeaderModelUtil.headerModelOf(boardState, services.now(), connection);
  const mergeQueueIsOpen = route.tab === 'kanban' && route.item === MERGE_QUEUE_ITEM;
  const boardViewIsShown = route.tab === 'agents' || route.tab === 'questions' || route.tab === 'assistant' || route.tab === 'intake' || route.tab === 'pipeline'
    || mergeQueueIsOpen
    || (route.tab === 'kanban' && kanbanBoardState !== null)
    || (route.tab === 'tickets' && ticketsBoardState !== null)
    || (route.tab === 'waves' && wavesCanvas !== null)
    || ((route.tab === 'progress' || route.tab === 'epics') && (progressBoardState !== null || boardState?.page !== undefined));

  const chooseTheme = (choice: ThemeChoice): void => {
    ThemeBootstrap.chooseTheme(sharedStore, choice);
    setThemeChoice(choice);
  };

  const finishedWorkWindow: FinishedWorkWindow = {
    choice:                  finishedWorkChoice,
    cutoffEpochMilliseconds: FinishedWorkUtil.cutoffEpochMillisecondsOf(finishedWorkChoice, boardNow),
    nowEpochMilliseconds:    boardNow,
  };
  const page = boardState?.page;
  const onKanban = route.tab === 'kanban' && kanbanFilters !== null;
  const counted = useMemo((): FinishedWorkCount => {
    if (page === undefined) return { noun: 'ticket', finishedMoments: [] };
    if (route.tab !== 'progress') return { noun: 'ticket', finishedMoments: page.tickets.map(FinishedWorkUtil.ticketFinishedEpochMillisecondsOf) };
    const ticketMomentById = new Map(page.tickets.map((ticket) => [ticket.id, FinishedWorkUtil.ticketFinishedEpochMillisecondsOf(ticket)]));
    return {
      noun:            'task',
      finishedMoments: page.payload.progress.tasks.map((task) => (
        FinishedWorkUtil.taskFinishedEpochMillisecondsOf(task, task.ticket === null ? null : ticketMomentById.get(task.ticket) ?? null)
      )),
    };
  }, [page, route.tab]);
  const filter = page === undefined || !DetailRoute.isDetailTab(route.tab) ? null : (
    <FinishedWorkFilter
      choice={finishedWorkChoice}
      onChoice={chooseFinishedWork}
      tickets={page.tickets}
      epics={page.payload.boardFacts.epics}
      counted={counted}
      nowEpochMilliseconds={boardNow}
      durationUnits={kanbanBoardState?.page.payload.limits ?? null}
      tabSections={onKanban ? <KanbanFilterSections filters={kanbanFilters} choices={kanbanFilterChoices} epicRollups={page.payload.boardFacts.epics} /> : null}
      lineEpic={onKanban ? kanbanFilters.lineEpic : null}
      onResetTabFilters={kanbanFilterChoices.reset}
    />
  );

  const boardViews = (
    <>
      {boardState !== null && mergeQueueIsOpen
        ? <MergeQueueView targets={MergeQueueModel.mergeQueueModelOf(boardState.mergeQueue, boardState.notices ?? [])} />
        : null}
      {kanbanBoardState !== null && kanbanFilters !== null && route.tab === 'kanban' && !mergeQueueIsOpen
        ? (
          <KanbanView
            boardState={kanbanBoardState}
            filters={kanbanFilters}
            boardStore={boardStore}
            streamIsLive={connection === 'live'}
            mergeQueueHref={HashRouter.fragmentOf({ tab: 'kanban', item: MERGE_QUEUE_ITEM })}
            onShowAllFinished={() => chooseFinishedWork('all')}
            laneHighlight={laneHighlight}
            onLaneHighlightTaken={takeLaneHighlight}
          />
        )
        : null}
      {wavesCanvas !== null && route.tab === 'waves' ? <WavesView canvas={wavesCanvas} /> : null}
      {progressBoardState !== null && route.tab === 'progress'
        ? <ProgressView boardState={progressBoardState} boardStore={boardStore} nowEpochMilliseconds={boardNow} todayCalendarDate={TimeUtil.calendarDateOf(boardNow)} />
        : null}
      {page !== undefined && route.tab === 'progress'
        ? <FinishedWorkView tickets={page.tickets} choice={finishedWorkChoice} nowEpochMilliseconds={boardNow} />
        : null}
      {epicsBoardState !== null && route.tab === 'epics'
        ? <EpicsView boardState={epicsBoardState} pointedEpicKey={DetailRoute.pointedEpicKeyOf(route)} />
        : null}
      {ticketsBoardState !== null && route.tab === 'tickets'
        ? <TicketsView boardState={ticketsBoardState} boardStore={boardStore} />
        : null}
      {boardState !== null && detailRouting !== null
        ? <DetailPanelHost boardState={boardState} item={openDetail} todayCalendarDate={TimeUtil.calendarDateOf(services.now().getTime())} />
        : null}
    </>
  );

  return (
    <ControlSurroundingsContext.Provider value={controlSurroundings}>
      <QuestionPanelOpenerContext.Provider value={questionPanel.open}>
        <div className="bridge-shell">
          <ConnectionBanners
            streamIsDown={streamIsDown}
            boardShownAsOf={boardShownAsOf}
            installHeldRefusal={installIsHeld ? installRefusal : undefined}
            sessionLoss={sessionLoss}
            warnings={headerModel.warnings}
            notices={headerModel.notices}
          />
          {incidentNotice === null ? null : <IncidentNotice model={incidentNotice} onMarkSeen={markIncidentDefaultsSeen} />}
          <Header
            project={boardState?.project ?? identity?.project ?? ''}
            model={headerModel}
            selectedTab={route.tab}
            shownTabs={shownTabs}
            themeChoice={themeChoice}
            onThemeChoice={chooseTheme}
            activityIsLive={connection === 'live'}
            clock={bridgeClock}
            tabBarEnd={filter}
            onShowLane={showLane}
            waitingOnUser={waitingOnUser}
            tabCounts={tabCounts}
            questionNotifier={services.questionNotifier}
            timestampSlices={boardState?.page?.payload.limits ?? null}
          />
          <main
            className="bridge-panel"
            data-tab={route.tab}
            data-entering={enteringTab === route.tab ? '' : undefined}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget && event.animationName === PANEL_ENTER_ANIMATION) setEnteringTab(null);
            }}
          >
            {boardState === null && sessionLoss === null
              ? <EmptyState text="Waiting for the Overseer's first board." />
              : null}
            {boardState !== null && route.tab === 'agents'
              ? (
                <AgentsView
                  project={boardState.project}
                  jobs={boardState.jobs}
                  decisions={boardState.decisions}
                  incidents={boardState.incidents}
                  launchSlots={boardState.launchSlots ?? null}
                  concurrency={boardState.concurrency ?? null}
                  tickets={boardState.page?.tickets ?? []}
                  selectedJobId={route.item}
                  clock={bridgeClock}
                  timestampSlices={IncidentNoticeModelUtil.timestampSlicesOf(boardState)}
                />
              )
              : null}
            {conversationBoard !== null && route.tab === 'questions'
              ? <QuestionsView board={conversationBoard} notifier={services.questionNotifier} />
              : null}
            {conversationBoard !== null && route.tab === 'assistant'
              ? <AssistantView board={conversationBoard} followTranscript={services.followTranscript} />
              : null}
            {conversationBoard !== null && route.tab === 'intake'
              ? <IntakeView board={conversationBoard} followTranscript={services.followTranscript} selectedItem={route.item} />
              : null}
            {boardState !== null && route.tab === 'pipeline' ? <PipelineView facts={boardState} route={route} /> : null}
            <BridgeClockContext.Provider value={bridgeClock}>
              <FinishedWorkWindowContext.Provider value={finishedWorkWindow}>
                <QuestionPanelShownContext.Provider value={questionPanel.shownDecision !== null}>
                  {detailRouting === null ? boardViews : <DetailRoutingContext.Provider value={detailRouting}>{boardViews}</DetailRoutingContext.Provider>}
                </QuestionPanelShownContext.Provider>
              </FinishedWorkWindowContext.Provider>
            </BridgeClockContext.Provider>
            {boardState !== null && !boardViewIsShown
              ? <BoardCounts boardState={boardState} tab={route.tab} />
              : null}
          </main>
          {boardState === null
            ? null
            : (
              <BridgeClockContext.Provider value={bridgeClock}>
                <QuestionPanel
                  board={boardState as unknown as QuestionPanelBoard}
                  queue={questionQueue}
                  shownDecision={questionPanel.shownDecision}
                  isHiddenBehindDetail={openDetail !== null}
                  format={{ todayCalendarDate: TimeUtil.calendarDateOf(boardNow), slices: IncidentNoticeModelUtil.timestampSlicesOf(boardState) }}
                  followTranscript={services.followTranscript}
                  onFold={questionPanel.fold}
                  onClose={questionPanel.close}
                  onNext={questionPanel.showNext}
                  focusesCloseOnOpen={() => questionPanel.openedByUser}
                />
              </BridgeClockContext.Provider>
            )}
        </div>
      </QuestionPanelOpenerContext.Provider>
    </ControlSurroundingsContext.Provider>
  );
}

function BoardCounts({ boardState, tab }: { readonly boardState: BoardStateDocument; readonly tab: string }) {
  return (
    <EmptyState text={`${boardState.jobs.length} jobs, ${boardState.decisions.length} decisions, ${boardState.incidents.length} incidents. `}>
      {tab === 'kanban' ? <a href={HashRouter.fragmentOf({ tab: 'kanban', item: MERGE_QUEUE_ITEM })}>Merge queue</a> : null}
    </EmptyState>
  );
}
